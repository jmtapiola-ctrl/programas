// Wrapper de OpenAI Responses API para el reviewer del feat/audit-reviewer.
//
// Encapsula:
//   - Reasoning (effort=high vía REVIEWER_REASONING_EFFORT)
//   - Structured outputs (text.format json_schema strict)
//   - AbortSignal.timeout(REVIEWER_TIMEOUT_MS) — OBLIGATORIO (anotación Smoke 0.3)
//   - Retry con backoff exponencial [5s, 15s] hasta REVIEWER_MAX_RETRIES intentos totales
//   - Cost tracking (input + output + reasoning tokens)
//   - Cap defensivo de costo (REVIEWER_MAX_COST_PER_AUDIT_USD), pre-call y post-call
//
// Notas:
//   - Pricing es placeholder ($5/M in, $25/M out). Re-calibrar con factura real.
//   - El cap se evalúa pre-call (estimado) y post-call (acumulado de retries).
//   - El JSON output se devuelve PARSEADO. La validación de SHAPE contra schema
//     de aplicación se hace en `lib/reviewer-validator.ts`.

import OpenAI from 'openai'

// ─── Config ──────────────────────────────────────────────────────────────────

const MODEL = process.env.REVIEWER_MODEL ?? 'gpt-5.5'
const EFFORT = (process.env.REVIEWER_REASONING_EFFORT ?? 'high') as
  | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
const TIMEOUT_MS = Number(process.env.REVIEWER_TIMEOUT_MS ?? 270000)
const MAX_RETRIES = Math.max(1, Number(process.env.REVIEWER_MAX_RETRIES ?? 3))
const MAX_COST_USD = Number(process.env.REVIEWER_MAX_COST_PER_AUDIT_USD ?? 8)

// Pricing placeholder gpt-5.5. Re-calibrar con factura real.
// Reasoning tokens cuentan como output.
const PRICE_INPUT_PER_M = 5
const PRICE_OUTPUT_PER_M = 25

// Backoff entre intentos sucesivos (índice = número de retry: 1er retry, 2do retry).
const RETRY_BACKOFF_MS = [5000, 15000]

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface ReviewerCallParams {
  systemPrompt: string
  userMessage: string
  schema: Record<string, unknown>
  schemaName: string
  maxOutputTokens?: number
  // Hook opcional para reportar progreso al SSE caller. Se invoca cada ~3s
  // mientras el reviewer está pensando, con elapsed_ms acumulado.
  onProgress?: (elapsedMs: number) => void
}

export interface ReviewerCallMetrics {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cost_usd: number
  latency_ms: number
  retries_used: number
  attempts: number
  model: string
  effort: string
}

export type ReviewerCallResult =
  | { ok: true; data: unknown; metrics: ReviewerCallMetrics }
  | {
      ok: false
      reason: 'cost_cap_exceeded' | 'timeout' | 'malformed_json' | 'api_error' | 'all_retries_failed'
      details: string
      metrics: ReviewerCallMetrics
    }

// ─── Helpers internos ────────────────────────────────────────────────────────

function calcCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICE_INPUT_PER_M + outputTokens * PRICE_OUTPUT_PER_M) / 1_000_000
}

function estimateInputTokens(systemPrompt: string, userMessage: string): number {
  // Heurística rough: 1 token ≈ 4 chars (en español puede ser un poco más).
  // Sirve para estimación pre-call del cost cap.
  const totalChars = systemPrompt.length + userMessage.length
  return Math.ceil(totalChars / 4)
}

function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { status?: number; code?: string; name?: string }
  // Retry: timeouts, network, 429 (rate limit), 5xx server errors.
  if (e.name === 'AbortError') return true
  if (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED') return true
  if (e.status === 429) return true
  if (typeof e.status === 'number' && e.status >= 500) return true
  return false
}

function backoffFor(retryIdx: number): number {
  return RETRY_BACKOFF_MS[Math.min(retryIdx, RETRY_BACKOFF_MS.length - 1)] ?? 15000
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Lazy singleton del cliente OpenAI ────────────────────────────────────────

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY no encontrada en environment')
    _client = new OpenAI({ apiKey })
  }
  return _client
}

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Llama al reviewer (gpt-5.5 + reasoning effort=high) con structured output JSON.
 * Implementa retry, timeout, y cap de costo.
 *
 * El `data` devuelto es el JSON parseado. La validación de SHAPE contra el
 * schema de aplicación (max items, enums, etc.) se hace en
 * `validateReviewerReport` de `lib/reviewer-validator.ts`.
 */
export async function callReviewer(params: ReviewerCallParams): Promise<ReviewerCallResult> {
  const client = getClient()
  const maxOutputTokens = params.maxOutputTokens ?? 16000

  // ── Pre-call cost cap check ──
  const inputEstimate = estimateInputTokens(params.systemPrompt, params.userMessage)
  const costEstimate = calcCost(inputEstimate, maxOutputTokens)
  if (costEstimate > MAX_COST_USD) {
    return {
      ok: false,
      reason: 'cost_cap_exceeded',
      details: `Costo estimado pre-call ($${costEstimate.toFixed(2)}) supera cap de $${MAX_COST_USD}. Input ~${inputEstimate.toLocaleString()} tokens + max_output ${maxOutputTokens}.`,
      metrics: emptyMetrics(),
    }
  }

  // ── Loop de intentos ──
  const totalStart = Date.now()
  let cumulativeInput = 0
  let cumulativeOutput = 0
  let cumulativeReasoning = 0
  let cumulativeCost = 0
  const errores: string[] = []

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const wait = backoffFor(attempt - 2)
      console.log(`[reviewer] retry ${attempt - 1}/${MAX_RETRIES - 1}: esperando ${wait}ms antes de reintentar`)
      await sleep(wait)
    }

    let progressTimer: NodeJS.Timeout | undefined
    try {
      const attemptStart = Date.now()

      // Reportar progreso al SSE cada 3s mientras se espera la respuesta.
      if (params.onProgress) {
        progressTimer = setInterval(() => {
          params.onProgress!(Date.now() - totalStart)
        }, 3000)
      }

      const response = await client.responses.create(
        {
          model: MODEL,
          reasoning: { effort: EFFORT },
          instructions: params.systemPrompt,
          input: params.userMessage,
          text: {
            format: {
              type: 'json_schema',
              name: params.schemaName,
              strict: true,
              schema: params.schema,
            },
          },
          max_output_tokens: maxOutputTokens,
        },
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      )

      if (progressTimer) clearInterval(progressTimer)

      const usageInput = response.usage?.input_tokens ?? 0
      const usageOutput = response.usage?.output_tokens ?? 0
      const usageReasoning = response.usage?.output_tokens_details?.reasoning_tokens ?? 0
      cumulativeInput += usageInput
      cumulativeOutput += usageOutput
      cumulativeReasoning += usageReasoning
      cumulativeCost = calcCost(cumulativeInput, cumulativeOutput)

      // ── Post-call cost cap check ──
      if (cumulativeCost > MAX_COST_USD) {
        return {
          ok: false,
          reason: 'cost_cap_exceeded',
          details: `Costo acumulado ($${cumulativeCost.toFixed(2)}) supera cap de $${MAX_COST_USD} tras intento ${attempt}/${MAX_RETRIES}.`,
          metrics: buildMetrics(cumulativeInput, cumulativeOutput, cumulativeReasoning, cumulativeCost, totalStart, attempt - 1, attempt),
        }
      }

      // ── Parsear el output JSON ──
      const text = response.output_text
      if (!text || text.trim().length === 0) {
        errores.push(`attempt ${attempt}: output_text vacío`)
        continue
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch (e) {
        errores.push(`attempt ${attempt}: malformed JSON — ${e instanceof Error ? e.message : String(e)}`)
        // Si max_output_tokens se agotó, el output queda truncado y JSON.parse falla.
        // Reintentar con backoff puede ayudar (a veces el modelo razona menos en el retry).
        continue
      }

      // ── Éxito ──
      console.log(`[reviewer] OK en intento ${attempt}/${MAX_RETRIES} — ${(Date.now() - attemptStart) / 1000}s, cost acumulado $${cumulativeCost.toFixed(3)}`)
      return {
        ok: true,
        data: parsed,
        metrics: buildMetrics(cumulativeInput, cumulativeOutput, cumulativeReasoning, cumulativeCost, totalStart, attempt - 1, attempt),
      }
    } catch (err) {
      if (progressTimer) clearInterval(progressTimer)
      const msg = err instanceof Error ? err.message : String(err)
      errores.push(`attempt ${attempt}: ${msg}`)
      console.warn(`[reviewer] intento ${attempt}/${MAX_RETRIES} falló:`, msg)

      // Errores no-retryables: aborta inmediatamente.
      if (!isRetryableError(err) && !msg.includes('timeout')) {
        return {
          ok: false,
          reason: 'api_error',
          details: errores.join(' | '),
          metrics: buildMetrics(cumulativeInput, cumulativeOutput, cumulativeReasoning, cumulativeCost, totalStart, attempt - 1, attempt),
        }
      }
      // Retryable: continuar al siguiente intento si quedan.
    }
  }

  // ── Todos los intentos fallaron ──
  const finalReason = errores.some(e => /malformed JSON|output_text vacío/.test(e))
    ? 'malformed_json'
    : errores.some(e => /timeout|aborted/i.test(e))
    ? 'timeout'
    : 'all_retries_failed'

  return {
    ok: false,
    reason: finalReason,
    details: errores.join(' | '),
    metrics: buildMetrics(cumulativeInput, cumulativeOutput, cumulativeReasoning, cumulativeCost, totalStart, MAX_RETRIES - 1, MAX_RETRIES),
  }
}

// ─── Builders de métricas ────────────────────────────────────────────────────

function emptyMetrics(): ReviewerCallMetrics {
  return {
    input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    cost_usd: 0,
    latency_ms: 0,
    retries_used: 0,
    attempts: 0,
    model: MODEL,
    effort: EFFORT,
  }
}

function buildMetrics(
  input: number,
  output: number,
  reasoning: number,
  cost: number,
  startMs: number,
  retriesUsed: number,
  attempts: number,
): ReviewerCallMetrics {
  return {
    input_tokens: input,
    output_tokens: output,
    reasoning_tokens: reasoning,
    cost_usd: cost,
    latency_ms: Date.now() - startMs,
    retries_used: retriesUsed,
    attempts,
    model: MODEL,
    effort: EFFORT,
  }
}
