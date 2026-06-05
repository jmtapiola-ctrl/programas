// POST /api/planes-estrategicos/[id]/crear-lineas-jr
//
// Confirma las líneas Jr revisadas/editadas por el user en el wizard de creación.
// Por cada línea:
//   1. Si el email del dueño no existe en Usuarios, crea uno con rol='Plan Jr',
//      activo=true, password temporal random (8 chars hasheados con bcrypt).
//   2. Crea el Plan Jr en Airtable con tipo='Jr', estado='Pendiente despliegue',
//      plan_sr_id=id-sr, responsable_id=user-Jr.id.
//   3. Persiste movs_heredados_ids + dueno_jr_email en el Plan Jr.
//   4. Guarda la línea (con plan_jr_id) en plan.lineas_jr del Sr.
//
// Body: { lineas: LineaJrPersistida[] } — todas con dueño asignado.
// Response: { ok, plans_jr_creados: number, usuarios_creados: number,
//             passwords_temporales: Array<{ email, password_plano }> }
//
// IMPORTANTE: los passwords temporales se devuelven UNA SOLA VEZ al frontend
// para que el Sr/Admin los pueda compartir manualmente. Después de esta
// respuesta, los passwords ya están hasheados y no se pueden recuperar.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import {
  getEntrevistaPE,
  getUsuarioByEmail,
  createUsuario,
  createPlanEstrategico,
  createEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import { checkPlanAccess } from '@/lib/auth-ownership'
import type { LineaJrPersistida } from '@/lib/types'

const SALT_ROUNDS = 10
const PASSWORD_TEMPORAL_LENGTH = 12

// Genera un password temporal random fácil de tipear (sin caracteres ambiguos).
function generarPasswordTemporal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < PASSWORD_TEMPORAL_LENGTH; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

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

    const { id: planSrId } = await params
    const access = await checkPlanAccess(user, planSrId)
    if (!access.allowed) {
      return NextResponse.json({ error: access.error ?? 'No autorizado' }, { status: access.status ?? 403 })
    }
    const planSr = access.plan!

    if (planSr.tipo !== 'Sr') {
      return NextResponse.json({ error: 'El plan no es Sr — no puede tener líneas Jr.' }, { status: 409 })
    }
    if ((planSr.lineas_jr?.length ?? 0) > 0) {
      return NextResponse.json({
        error: 'Este Plan Sr ya tiene líneas Jr creadas. No se permite re-crear (idempotencia).',
      }, { status: 409 })
    }
    const entrevista = await getEntrevistaPE(planSrId).catch(() => null)
    if (!entrevista || (entrevista.paso_actual ?? 0) < 4) {
      return NextResponse.json({
        error: 'El Plan Sr debe tener Paso 3 cerrado antes de crear Planes Jr.',
      }, { status: 409 })
    }

    const body = await req.json().catch(() => null) as { lineas?: LineaJrPersistida[] } | null
    if (!body?.lineas || !Array.isArray(body.lineas) || body.lineas.length < 3) {
      return NextResponse.json({ error: 'Debés enviar al menos 3 líneas Jr.' }, { status: 400 })
    }

    // Validaciones de cobertura y dueños.
    const movsActivos = (planSr.plan?.inventario?.movimientos ?? [])
      .filter(m => m.estado_usuario !== 'quitado')
    const movsIdsValidos = new Set(movsActivos.map(m => m.id))
    const movsAsignados = new Set<string>()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    for (const linea of body.lineas) {
      if (!linea.nombre?.trim()) {
        return NextResponse.json({ error: `Una línea no tiene nombre.` }, { status: 400 })
      }
      if (!linea.dueno_jr_email?.trim() || !emailRegex.test(linea.dueno_jr_email.trim())) {
        return NextResponse.json({
          error: `Línea "${linea.nombre}" no tiene email válido del dueño.`,
        }, { status: 400 })
      }
      if (!linea.dueno_jr_nombre?.trim()) {
        return NextResponse.json({
          error: `Línea "${linea.nombre}" no tiene nombre del dueño.`,
        }, { status: 400 })
      }
      if (!linea.movimientos_ids || linea.movimientos_ids.length === 0) {
        return NextResponse.json({
          error: `Línea "${linea.nombre}" no tiene movimientos asignados.`,
        }, { status: 400 })
      }
      for (const movId of linea.movimientos_ids) {
        if (!movsIdsValidos.has(movId)) {
          return NextResponse.json({
            error: `Línea "${linea.nombre}" referencia mov ${movId} que no existe en el inventario.`,
          }, { status: 400 })
        }
        if (movsAsignados.has(movId)) {
          return NextResponse.json({
            error: `Mov ${movId} está asignado a múltiples líneas. Debe estar en exactamente una.`,
          }, { status: 400 })
        }
        movsAsignados.add(movId)
      }
    }
    const noAsignados = [...movsIdsValidos].filter(id => !movsAsignados.has(id))
    if (noAsignados.length > 0) {
      return NextResponse.json({
        error: `Cobertura incompleta: ${noAsignados.length} mov(s) sin asignar a ninguna línea: ${noAsignados.join(', ')}.`,
      }, { status: 400 })
    }

    // Crear Users + Plans Jr + persistir.
    const passwordsTemporales: Array<{ email: string; nombre: string; password_plano: string }> = []
    const lineasFinales: LineaJrPersistida[] = []
    let usuariosCreados = 0
    let plansJrCreados = 0

    for (const linea of body.lineas) {
      const email = linea.dueno_jr_email.trim().toLowerCase()
      const nombre = linea.dueno_jr_nombre.trim()

      // (a) Crear o reusar Usuario.
      let usuarioJr = await getUsuarioByEmail(email).catch(() => null)
      if (!usuarioJr) {
        const passwordPlano = generarPasswordTemporal()
        const passwordHash = await bcrypt.hash(passwordPlano, SALT_ROUNDS)
        usuarioJr = await createUsuario({
          nombre,
          email,
          rol: 'Plan Jr',
          activo: true,
          password_hash: passwordHash,
          password_temporal: true,
        })
        passwordsTemporales.push({ email, nombre, password_plano: passwordPlano })
        usuariosCreados++
      }

      // (b) Crear Plan Jr.
      const planJr = await createPlanEstrategico({
        nombre: `${linea.nombre} (Jr de ${planSr.nombre})`,
        tipo: 'Jr',
        plan_sr_id: planSrId,
        plan_sr_nombre: planSr.nombre,
        responsable_id: usuarioJr.id,
        estado: 'Pendiente despliegue',
      })
      plansJrCreados++

      // (c) Crear Entrevista del Jr (necesaria para que después pueda arrancar
      // el wizard del Jr — Fase 6 pendiente).
      await createEntrevistaPE(planJr.id).catch((e) => {
        console.warn(`[crear-lineas-jr] no se pudo crear entrevista para Jr ${planJr.id}:`, e?.message)
      })

      // (d) Persistir campos Sr→Jr en el Plan Jr.
      await updatePlanEstrategico(planJr.id, {
        movs_heredados_ids: linea.movimientos_ids,
        dueno_jr_email: email,
      })

      // (e) Acumular línea final con plan_jr_id y estado actualizado.
      lineasFinales.push({
        ...linea,
        dueno_jr_email: email,
        dueno_jr_nombre: nombre,
        plan_jr_id: planJr.id,
        estado: 'pendiente_contexto',
      })
    }

    // Persistir lineas_jr en el Plan Sr.
    await updatePlanEstrategico(planSrId, { lineas_jr: lineasFinales })

    console.log('[crear-lineas-jr] done', JSON.stringify({
      plan_sr_id: planSrId,
      lineas_creadas: lineasFinales.length,
      plans_jr_creados: plansJrCreados,
      usuarios_creados: usuariosCreados,
    }))

    return NextResponse.json({
      ok: true,
      plans_jr_creados: plansJrCreados,
      usuarios_creados: usuariosCreados,
      passwords_temporales: passwordsTemporales,
      lineas: lineasFinales,
    })
  } catch (err) {
    const errAny = err as any
    console.error('[crear-lineas-jr] UNCAUGHT:', errAny?.message, errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
    }, { status: 500 })
  }
}
