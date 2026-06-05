// POST /api/planes-estrategicos/[id]/confirmar-despliegue-jr
//
// Confirma el despliegue de un Plan Jr después de que el Sr/Admin editó el
// contexto curado. Operaciones (atómicas en spirit, secuenciales en HTTP):
//   1. Toma snapshot de los movs heredados desde el inventario del Sr (lee
//      planSr.plan.inventario.movimientos filtrado por movs_heredados_ids).
//   2. Persiste en el Plan Jr: contexto_curado (los 5 campos),
//      movs_heredados_snapshot, estado='Listo para compartir'.
//   3. Actualiza la línea correspondiente en planSr.lineas_jr[i].estado a
//      'listo_para_compartir'.
//
// Body: { contexto_curado: ContextoCuradoJr }  // los 5 campos
// Response: { ok, plan_jr_id, estado_nuevo: 'Listo para compartir', share_url }
//
// Validaciones:
//   - Plan es tipo='Jr' Y estado='Pendiente despliegue'.
//   - Caller tiene permiso (no es Plan Jr role).
//   - Los 5 campos del contexto curado tienen contenido (gate duro; la UI ya
//     lo enforza con la aprobación por campo).
//   - Plan Sr asociado existe y tiene la línea con plan_jr_id matching.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  updatePlanEstrategico,
} from '@/lib/airtable'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { CONTEXTO_CURADO_CAMPOS, contextoCuradoTieneContenido } from '@/lib/types'
import type { MovimientoPE, LineaJrPersistida, ContextoCuradoJr } from '@/lib/types'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const user = {
      id: (session.user as any).id as string,
      email: (session.user as any).email as string | undefined,
      role: (session.user as any).role as string | undefined,
    }

    const { id: planJrId } = await params
    const access = await checkPlanAccess(user, planJrId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.error ?? 'No autorizado' }, { status: access.status ?? 403 })
    }
    const planJr = access.plan!

    if (planJr.tipo !== 'Jr') {
      return NextResponse.json({ error: 'Este endpoint solo aplica a Planes Jr.' }, { status: 409 })
    }
    if (planJr.estado !== 'Pendiente despliegue') {
      return NextResponse.json({
        error: `El Jr está en estado "${planJr.estado}" — solo se puede confirmar despliegue desde "Pendiente despliegue".`,
      }, { status: 409 })
    }
    if (!planJr.plan_sr_id) {
      return NextResponse.json({ error: 'El Jr no tiene plan_sr_id.' }, { status: 500 })
    }
    if (user.role === 'Plan Jr' || user.role === 'Operador') {
      return NextResponse.json({ error: 'No tenés permisos para desplegar Planes Jr.' }, { status: 403 })
    }

    const body = await req.json().catch(() => null) as { contexto_curado?: ContextoCuradoJr } | null
    const contexto_curado: ContextoCuradoJr = {
      contexto: body?.contexto_curado?.contexto?.trim() ?? '',
      proposito: body?.contexto_curado?.proposito?.trim() ?? '',
      criterios_exito: body?.contexto_curado?.criterios_exito?.trim() ?? '',
      metricas: body?.contexto_curado?.metricas?.trim() ?? '',
      supuestos: body?.contexto_curado?.supuestos?.trim() ?? '',
    }
    // Gate duro: los 5 campos deben tener contenido (la UI ya lo enforza con la
    // aprobación, esto es la validación server-side).
    const vacios = CONTEXTO_CURADO_CAMPOS.filter(c => contexto_curado[c.key].length === 0)
    if (vacios.length > 0) {
      return NextResponse.json({
        error: `Faltan campos del contexto curado: ${vacios.map(c => c.label).join(', ')}.`,
      }, { status: 400 })
    }
    if (!contextoCuradoTieneContenido(contexto_curado)) {
      return NextResponse.json({
        error: 'El contexto curado está vacío.',
      }, { status: 400 })
    }

    const planSr = await getPlanEstrategico(planJr.plan_sr_id).catch(() => null)
    if (!planSr) {
      return NextResponse.json({ error: 'Plan Sr asociado no encontrado.' }, { status: 404 })
    }
    const lineas = planSr.lineas_jr ?? []
    const lineaIdx = lineas.findIndex(l => l.plan_jr_id === planJrId)
    if (lineaIdx === -1) {
      return NextResponse.json({
        error: 'Línea Jr no encontrada en el Plan Sr — desconsistencia.',
      }, { status: 500 })
    }
    const linea = lineas[lineaIdx]

    // Snapshot: filtra movs del inventario del Sr por IDs heredados. Si algún
    // ID heredado ya no existe en el inventario del Sr (porque el user del Sr
    // lo quitó después de crear el Jr), se omite del snapshot — el JR recibe
    // solo los que existen al momento del despliegue.
    const movsInventarioSr: MovimientoPE[] = planSr.plan?.inventario?.movimientos ?? []
    const idsHeredados = new Set(linea.movimientos_ids)
    const snapshot: MovimientoPE[] = movsInventarioSr.filter(m => idsHeredados.has(m.id))

    if (snapshot.length === 0) {
      return NextResponse.json({
        error: 'No quedan movimientos heredados resolvibles en el inventario del Sr — el despliegue es imposible.',
      }, { status: 409 })
    }

    // Persistir cambios en el Plan Jr.
    await updatePlanEstrategico(planJrId, {
      contexto_curado,
      movs_heredados_snapshot: snapshot,
      estado: 'Listo para compartir',
    })

    // Actualizar la línea en el Sr.
    const lineasActualizadas: LineaJrPersistida[] = lineas.map((l, i) =>
      i === lineaIdx ? { ...l, estado: 'listo_para_compartir' } : l,
    )
    await updatePlanEstrategico(planJr.plan_sr_id, {
      lineas_jr: lineasActualizadas,
    })

    console.log('[confirmar-despliegue-jr] done', JSON.stringify({
      plan_jr_id: planJrId,
      plan_sr_id: planJr.plan_sr_id,
      contexto_chars: CONTEXTO_CURADO_CAMPOS.reduce((n, c) => n + contexto_curado[c.key].length, 0),
      snapshot_movs: snapshot.length,
      linea_nombre: linea.nombre,
    }))

    return NextResponse.json({
      ok: true,
      plan_jr_id: planJrId,
      estado_nuevo: 'Listo para compartir',
      snapshot_movs: snapshot.length,
    })
  } catch (err) {
    const errAny = err as any
    console.error('[confirmar-despliegue-jr] UNCAUGHT:', errAny?.message, errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
    }, { status: 500 })
  }
}
