// POST /api/planes-estrategicos/[id]/paso3/inventario/inferir-dependencias
//
// Dado un movimiento_id (recién agregado por el usuario al inventario), llama
// a Opus para inferir sus dependencias naturales con el resto del inventario.
// El usuario después confirma/rechaza desde un modal con checkboxes — este
// endpoint NO modifica el inventario, solo devuelve la propuesta.
//
// Body: { movimiento_id: string }
// Response: { ok: true, propuesta: { precondiciones: string[], desbloquea: string[],
//                                     tipo_dependencia: string, razonamiento: string },
//             costo_usd: number, latencia_ms: number }
//
// Latencia esperada: 10-20s. Costo: $0.05-0.10.
//
// Mismo patrón de retry para UND_ERR_SOCKET que /generar.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico, getEntrevistaPE } from '@/lib/airtable'
import {
  buildInferirDependenciasSystemPrompt,
  buildInferirDependenciasUserMessage,
} from '@/lib/inferir-dependencias-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Pricing claude-opus-4-7 ($15/M input, $75/M output) para tracking.
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as { movimiento_id?: string } | null
  if (!body?.movimiento_id) {
    return NextResponse.json({ error: 'Body debe incluir movimiento_id' }, { status: 400 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  const inv = plan.plan?.inventario
  if (!inv) {
    return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })
  }

  const movNuevo = inv.movimientos.find(m => m.id === body.movimiento_id)
  if (!movNuevo) {
    return NextResponse.json({ error: `movimiento_id "${body.movimiento_id}" no existe en el inventario.` }, { status: 404 })
  }

  const systemPrompt = buildInferirDependenciasSystemPrompt()
  const userMessage = buildInferirDependenciasUserMessage(movNuevo, inv.movimientos, plan)

  console.log('[paso3/inventario/inferir-dependencias] start', JSON.stringify({
    plan_id: planId,
    movimiento_id: body.movimiento_id,
    inventario_total: inv.movimientos.length,
  }))

  // Retry mechanism — mismo patrón que /generar para UND_ERR_SOCKET transitorios
  const MAX_ATTEMPTS = 3
  const BACKOFF_MS = [0, 2000, 5000]
  const start = Date.now()
  let costoUsd = 0
  let latenciaMs = 0
  let text = ''
  let lastError: any = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(`[paso3/inventario/inferir-dependencias] Reintento ${attempt}/${MAX_ATTEMPTS}. Esperando ${BACKOFF_MS[attempt - 1]}ms...`)
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]))
    }

    try {
      console.log(`[paso3/inventario/inferir-dependencias] Intento ${attempt}: llamando a Opus...`)
      const attemptStart = Date.now()
      const stream = anthropic.messages.stream({
        model: 'claude-opus-4-7',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      const attemptMs = Date.now() - attemptStart
      console.log(`[paso3/inventario/inferir-dependencias] Intento ${attempt}: OK en ${attemptMs}ms`)

      const inputTokens = finalMsg.usage.input_tokens
      const outputTokens = finalMsg.usage.output_tokens
      costoUsd += (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

      text = finalMsg.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')

      lastError = null
      break
    } catch (err) {
      lastError = err
      const errAny = err as any
      const isTransient =
        errAny?.cause?.code === 'UND_ERR_SOCKET' ||
        errAny?.cause?.message === 'other side closed' ||
        errAny?.message === 'terminated' ||
        errAny?.code === 'ECONNRESET' ||
        errAny?.code === 'ETIMEDOUT'
      console.warn(`[paso3/inventario/inferir-dependencias] Intento ${attempt} falló:`, {
        name: errAny?.name,
        message: errAny?.message,
        cause_code: errAny?.cause?.code,
        is_transient: isTransient,
      })
      if (!isTransient || attempt === MAX_ATTEMPTS) break
    }
  }

  if (lastError) {
    latenciaMs = Date.now() - start
    const errAny = lastError as any
    return NextResponse.json({
      error: lastError instanceof Error ? lastError.message : String(lastError),
      error_info: { name: errAny?.name, cause_code: errAny?.cause?.code, attempts: MAX_ATTEMPTS },
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Parsear JSON. Tolerar texto extra alrededor.
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({
      error: 'Opus devolvió output no parseable.',
      opus_response_preview: text.slice(0, 500),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Sanitizar: solo permitir IDs que existan en el inventario y NO el del propio movimiento nuevo
  const idsValidos = new Set(inv.movimientos.map(m => m.id))
  idsValidos.delete(body.movimiento_id)

  const precondiciones = Array.isArray(parsed.precondiciones)
    ? parsed.precondiciones.filter((id: any) => typeof id === 'string' && idsValidos.has(id))
    : []
  const desbloquea = Array.isArray(parsed.desbloquea)
    ? parsed.desbloquea.filter((id: any) => typeof id === 'string' && idsValidos.has(id))
    : []
  const tipo_dependencia = ['dura', 'blanda', 'ninguna'].includes(parsed.tipo_dependencia)
    ? parsed.tipo_dependencia
    : 'ninguna'
  const razonamiento = typeof parsed.razonamiento === 'string' ? parsed.razonamiento : ''

  console.log('[paso3/inventario/inferir-dependencias] done', JSON.stringify({
    movimiento_id: body.movimiento_id,
    precondiciones_count: precondiciones.length,
    desbloquea_count: desbloquea.length,
    tipo_dependencia,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  }))

  return NextResponse.json({
    ok: true,
    propuesta: { precondiciones, desbloquea, tipo_dependencia, razonamiento },
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  })
}
