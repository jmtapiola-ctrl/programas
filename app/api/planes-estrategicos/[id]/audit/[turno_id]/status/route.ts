// Endpoint GET /api/planes-estrategicos/[id]/audit/[turno_id]/status
//
// Hidratación del estado de una auditoría tras abandono del usuario.
// NO usar para polling continuo en el flujo normal — la primera vista del
// flujo (Pantalla 2 modal) consume el SSE de /audit/start. Este endpoint
// solo sirve cuando el usuario cierra el tab y vuelve más tarde a la URL
// `/cierre/paso-N` (Pantalla 1) o `/cierre/paso-N/final` (Pantalla 4).
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
import { getEntrevistaPE, getReviewerTurnos } from '@/lib/airtable'

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
  // Cargamos los reviewer turns de los pasos 1 y 2 y filtramos.
  const [revPaso1, revPaso2] = await Promise.all([
    getReviewerTurnos(entrevista.id, 1),
    getReviewerTurnos(entrevista.id, 2),
  ])
  const allReviewerTurnos = [...revPaso1, ...revPaso2]
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

  return NextResponse.json({
    sub_estado_paso: entrevista.sub_estado_paso ?? 'en_curso',
    report: reviewer.report,
    decisiones: reviewer.decisiones ?? null,
    metrics: {
      costo_usd: reviewer.costo_usd,
      latencia_ms: reviewer.latencia_ms,
      retry_count: reviewer.retry_count,
    },
    // skipped/failed no están directamente expuestos por getReviewerTurnos —
    // se pueden inferir del shape del report (skipped tiene errors=questions=0
    // + justificacion menciona "Skipped" o "Failed").
    skipped: /skipped/i.test(reviewer.report?.meta?.justificacion_confianza ?? ''),
    failed: /failed/i.test(reviewer.report?.meta?.justificacion_confianza ?? ''),
  })
}
