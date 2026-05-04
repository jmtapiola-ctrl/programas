// POST /api/planes-estrategicos/[id]/paso3/palancas/validar
//
// Sub-bloque 3.B — Validador cross-provider de las preguntas de palanca.
// Reusa la infraestructura de callReviewer del feat/audit-reviewer (OpenAI
// gpt-5.5 effort=high vía Responses API + structured outputs strict).
//
// Body: {} (sin payload — todo viene del estado actual del plan)
// Response: { ok: true, propuesta: { preguntas: [...], razonamiento_global }, costo_usd, latencia_ms }
//
// Validaciones:
// - paso=3, sub_bloque='3.B' (o cualquier flow donde palancas.preguntas_principal
//   tenga 5 preguntas con respuestas — el validador funciona si tiene material)
// - plan.palancas.preguntas_principal.length === 5
// - todas las 5 con respuesta no vacía
//
// Costo esperado: $0.20-0.50 USD por validación. Latencia: 60-120s (effort=high
// + structured output complejo).
//
// El endpoint NO modifica el inventario ni persiste las preguntas del validador.
// Solo devuelve la propuesta. El cliente las muestra en modal y, después de que
// el usuario las responde, persiste todo junto en plan.palancas.preguntas_validador.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico, getEntrevistaPE } from '@/lib/airtable'
import { callReviewer } from '@/lib/openai-client'
import {
  buildPalancasValidadorSystemPrompt,
  buildPalancasValidadorUserMessage,
  PALANCAS_VALIDADOR_SCHEMA,
} from '@/lib/palancas-validador-prompt'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Esperado paso_actual=3, got ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  const palancas = plan.plan?.palancas
  const principal = palancas?.preguntas_principal ?? []
  if (principal.length < 5) {
    return NextResponse.json({
      error: `El validador requiere las 5 preguntas principal completas. Hay ${principal.length}.`,
    }, { status: 409 })
  }
  const sinRespuesta = principal.filter(qa => !qa.respuesta?.trim())
  if (sinRespuesta.length > 0) {
    return NextResponse.json({
      error: `Hay ${sinRespuesta.length} pregunta(s) principal sin respuesta del usuario: ${sinRespuesta.map(q => q.id).join(', ')}.`,
    }, { status: 409 })
  }

  const systemPrompt = buildPalancasValidadorSystemPrompt()
  const userMessage = buildPalancasValidadorUserMessage(plan, principal)

  console.log('[paso3/palancas/validar] start', JSON.stringify({
    plan_id: planId,
    preguntas_principal: principal.length,
  }))

  const result = await callReviewer({
    systemPrompt,
    userMessage,
    schema: PALANCAS_VALIDADOR_SCHEMA as Record<string, unknown>,
    schemaName: 'palancas_validador',
    maxOutputTokens: 8000,  // Schema chico — 0-5 preguntas + razonamiento. Reasoning consume la mayoría.
  })

  if (!result.ok) {
    console.error('[paso3/palancas/validar] callReviewer falló:', result.reason, result.details)
    return NextResponse.json({
      error: `Validador falló (${result.reason}): ${result.details}`,
      metrics: result.metrics,
    }, { status: 500 })
  }

  // Sanitizar output (defensa adicional sobre el strict schema):
  const data = result.data as { preguntas?: Array<{ pregunta?: string; razon_complementariedad?: string }>; razonamiento_global?: string }
  const preguntas = (data.preguntas ?? []).slice(0, 5).map((q, i) => ({
    id: `V-${i + 1}`,  // ids prefijo "V" para validador (vs "P" del principal)
    pregunta: typeof q.pregunta === 'string' ? q.pregunta : '',
    razon_complementariedad: typeof q.razon_complementariedad === 'string' ? q.razon_complementariedad : '',
  })).filter(q => q.pregunta.trim() !== '')

  const razonamiento_global = typeof data.razonamiento_global === 'string' ? data.razonamiento_global : ''

  console.log('[paso3/palancas/validar] done', JSON.stringify({
    plan_id: planId,
    preguntas_validador_count: preguntas.length,
    costo_usd: result.metrics.cost_usd,
    latencia_ms: result.metrics.latency_ms,
  }))

  return NextResponse.json({
    ok: true,
    propuesta: { preguntas, razonamiento_global },
    costo_usd: result.metrics.cost_usd,
    latencia_ms: result.metrics.latency_ms,
  })
}
