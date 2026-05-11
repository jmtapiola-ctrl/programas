// Endpoint GET /api/planes-estrategicos/[id]/audit/[turno_id]/status
//
// Hidratación del estado de una auditoría tras abandono del usuario.
// NO usar para polling continuo en el flujo normal — la primera vista del
// flujo (Pantalla 2 modal) consume el SSE de /audit/start. Este endpoint
// solo sirve cuando el usuario cierra el tab y vuelve más tarde a la URL
// `/cierre/N` (Pantalla 1) o `/cierre/N/final` (Pantalla 4).
//
// Devuelve:
//   {
//     sub_estado_paso: SubEstadoPaso,
//     report: ReviewerReport | null,        // si la audit completó OK
//     decisiones: DecisionUsuario[] | null, // si el user ya empezó a procesar
//     metrics: { costo_usd, latencia_ms, retry_count, modelo },
//     skipped: boolean,
//     failed: boolean,
//   }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEntrevistaPE, getReviewerTurnos, updateSubEstadoPaso, incrementAuditoriasPaso } from '@/lib/airtable'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; turno_id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId, turno_id: turnoId } = await params

  const entrevista = await getEntrevistaPE(planId)
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  // Buscar el turno reviewer específico por airtableId.
  // Cargamos los reviewer turns de los pasos 1, 2 y 3 y filtramos.
  const [revPaso1, revPaso2, revPaso3] = await Promise.all([
    getReviewerTurnos(entrevista.id, 1),
    getReviewerTurnos(entrevista.id, 2),
    getReviewerTurnos(entrevista.id, 3),
  ])
  const allReviewerTurnos = [...revPaso1, ...revPaso2, ...revPaso3]
  const reviewer = allReviewerTurnos.find(r => r.airtableId === turnoId)

  if (!reviewer) {
    // Caso edge: el turno aún no existe (auditoría en proceso, todavía no
    // persistida). Devolvemos estado actual sin report.
    return NextResponse.json({
      sub_estado_paso: entrevista.sub_estado_paso ?? 'en_curso',
      report: null,
      decisiones: null,
      metrics: null,
      skipped: false,
      failed: false,
      hint: 'Turno reviewer no encontrado (probablemente la audit está aún en proceso o el turno_id es inválido).',
    })
  }

  // ─── AUTO-CORRECCIÓN del estado inconsistente (caso 2 del rollback) ───
  //
  // Si el sub_estado_paso es 'auditoria_en_proceso' pero hay un turno reviewer
  // persistido con report válido (no skipped, no failed), significa que el flow
  // del audit/start crashó entre `appendReviewerTurno` y la transición final
  // `auditoria_en_proceso → auditoria_completa`.
  //
  // Auto-corrección: transicionar a 'auditoria_completa' + incrementar counter
  // (que tampoco se incrementó en el flow original porque venía después).
  // Es idempotente: si el counter ya está en el valor correcto, el guard del
  // helper rechaza y seguimos sin error.
  const meta = reviewer.report?.meta
  const justif = meta?.justificacion_confianza ?? ''
  const isSkipped = /skipped/i.test(justif)
  const isFailed = /failed/i.test(justif)
  const reportEsValido = !isSkipped && !isFailed && (reviewer.report?.errors?.length > 0 || reviewer.report?.questions?.length > 0)

  let subEstadoFinal = entrevista.sub_estado_paso ?? 'en_curso'
  let autoCorregido = false

  if (subEstadoFinal === 'auditoria_en_proceso' && reportEsValido) {
    try {
      await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', 'auditoria_completa')
      // Inferir paso del audit del propio turno: getReviewerTurnos ya filtró
      // por paso, así que basta ver en cuál lookup apareció.
      const auditPaso: 1 | 2 | 3 = revPaso1.find(r => r.airtableId === turnoId)
        ? 1
        : revPaso2.find(r => r.airtableId === turnoId)
          ? 2
          : 3
      const counterField =
        auditPaso === 1 ? 'auditorias_paso_1_count' as const :
        auditPaso === 2 ? 'auditorias_paso_2_count' as const :
        'auditorias_paso_3_count' as const
      const currentCount = (entrevista[counterField] ?? 0) as number
      // Si el counter es < cantidad de turnos reviewer no-failed/skipped del Paso, incrementar.
      const reviewerTurnosDelPaso = auditPaso === 1 ? revPaso1 : auditPaso === 2 ? revPaso2 : revPaso3
      const successCount = reviewerTurnosDelPaso.filter(r => {
        const j = r.report?.meta?.justificacion_confianza ?? ''
        return !/skipped|failed/i.test(j)
      }).length
      if (currentCount < successCount) {
        await incrementAuditoriasPaso(entrevista.id, auditPaso, currentCount).catch(() => undefined)
      }
      subEstadoFinal = 'auditoria_completa'
      autoCorregido = true
      console.log(`[audit/status] auto-corregido: entrevista=${entrevista.id} paso=${auditPaso} estado auditoria_en_proceso → auditoria_completa (turno reviewer ${turnoId} ya persistido)`)
    } catch (e) {
      // Si el guard rechazó (ej: race condition donde otro request ya transicionó),
      // simplemente reportamos el estado actual sin auto-corregir.
      console.warn(`[audit/status] auto-corrección falló (probable race condition):`, e instanceof Error ? e.message : String(e))
    }
  }

  return NextResponse.json({
    sub_estado_paso: subEstadoFinal,
    report: reviewer.report,
    decisiones: reviewer.decisiones ?? null,
    metrics: {
      costo_usd: reviewer.costo_usd,
      latencia_ms: reviewer.latencia_ms,
      retry_count: reviewer.retry_count,
    },
    skipped: isSkipped,
    failed: isFailed,
    auto_corregido: autoCorregido || undefined,
  })
}
