// POST /api/planes-estrategicos/[id]/marcar-iniciado-jr
//
// TODO: este endpoint se consume desde el botón "Iniciar wizard →" de la
// vista /inicio del Plan Jr cuando se implemente Fase 6 (wizard del Plan Jr).
// Hasta entonces, el botón en /inicio está DESHABILITADO — este endpoint no
// se llama. Se deja creado como scaffold para que la transición de estado
// 'Listo para compartir' → 'En entrevista' exista desde ya, y el listado
// pueda mostrar el badge "En curso" cuando el dueño Jr efectivamente arranque
// su wizard.
//
// Operación:
//   1. Validar que es Plan Jr y estado='Listo para compartir'.
//   2. Validar que el caller es el dueño formal (match por email) o un rol
//      con acceso global.
//   3. Persistir estado='En entrevista' en el Jr.
//   4. Actualizar la línea correspondiente en planSr.lineas_jr[i].estado a
//      'en_curso'.
//
// Body: ninguno.
// Response: { ok, estado_nuevo: 'En entrevista' }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico, updatePlanEstrategico, getEntrevistaPE, updateEntrevistaPE } from '@/lib/airtable'
import { checkPlanAccess } from '@/lib/auth-ownership'
import type { LineaJrPersistida } from '@/lib/types'

export const maxDuration = 30

export async function POST(
  _req: NextRequest,
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
    if (planJr.estado !== 'Listo para compartir') {
      return NextResponse.json({
        error: `El Jr está en estado "${planJr.estado}" — solo se puede iniciar desde "Listo para compartir".`,
      }, { status: 409 })
    }
    if (!planJr.plan_sr_id) {
      return NextResponse.json({ error: 'El Jr no tiene plan_sr_id.' }, { status: 500 })
    }

    // Persistir cambio en el Jr. Si el Jr todavía no tiene 'area' poblada
    // (createPlanEstrategico no la setea para Jr), la derivamos del nombre de la
    // línea para que el panel/estado del wizard no la muestre vacía.
    const planUpdate: { estado: string; area?: string } = { estado: 'En entrevista' }

    // Sembrar la entrevista del Jr para arrancar en el Paso 1 liviano (alineación
    // con el propósito heredado), NO en el Encuadre/Paso 0. El propósito ya está
    // dado por el despliegue; el Paso 1 Jr es solo de buy-in.
    try {
      const entrevista = await getEntrevistaPE(planJrId)
      if (entrevista) {
        await updateEntrevistaPE(entrevista.id, {
          estado: 'En curso',
          paso_actual: 1,
          sub_bloque_actual: '1.A',
        })
      } else {
        console.warn('[marcar-iniciado-jr] el Jr no tiene entrevista — el wizard la creará al primer turno en Paso 0')
      }
    } catch (e) {
      console.warn('[marcar-iniciado-jr] no se pudo sembrar la entrevista:', (e as any)?.message)
    }

    // Actualizar la línea en el Sr (mejor effort — si falla el Sr no
    // rollbackeamos el Jr porque no es crítico para el flow del dueño Jr).
    try {
      const planSr = await getPlanEstrategico(planJr.plan_sr_id)
      if (planSr) {
        const lineas = planSr.lineas_jr ?? []
        const lineaIdx = lineas.findIndex(l => l.plan_jr_id === planJrId)
        if (lineaIdx !== -1) {
          if (!planJr.area && lineas[lineaIdx].nombre) planUpdate.area = lineas[lineaIdx].nombre
          const lineasActualizadas: LineaJrPersistida[] = lineas.map((l, i) =>
            i === lineaIdx ? { ...l, estado: 'en_curso' } : l,
          )
          await updatePlanEstrategico(planJr.plan_sr_id, { lineas_jr: lineasActualizadas })
        }
      }
    } catch (e) {
      console.warn('[marcar-iniciado-jr] no se pudo actualizar línea en Sr:', (e as any)?.message)
    }

    await updatePlanEstrategico(planJrId, planUpdate)

    console.log('[marcar-iniciado-jr] done', JSON.stringify({
      plan_jr_id: planJrId,
      plan_sr_id: planJr.plan_sr_id,
    }))

    return NextResponse.json({ ok: true, estado_nuevo: 'En entrevista' })
  } catch (err) {
    const errAny = err as any
    console.error('[marcar-iniciado-jr] UNCAUGHT:', errAny?.message, errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
    }, { status: 500 })
  }
}
