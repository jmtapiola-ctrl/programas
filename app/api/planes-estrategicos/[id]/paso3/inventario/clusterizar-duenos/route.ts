// POST /api/planes-estrategicos/[id]/paso3/inventario/clusterizar-duenos
//
// Llama a Sonnet 4.6 para detectar variantes de dueños que probablemente sean
// la MISMA persona. Se dispara automáticamente al abrir el modal de P-4 (en
// paralelo a la AI de sugerencias de fases). Si encuentra clusters, el cliente
// muestra un banner ofreciendo unificarlos.
//
// El endpoint NO persiste nada — devuelve los clusters al cliente. La
// unificación efectiva se aplica vía POST /paso3/inventario/unificar-duenos
// cuando el user confirma desde el modal de UI.
//
// Response: { ok, clusters: [{ variantes, canonico_sugerido }], costo_usd, latencia_ms }
//         | { error, status }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico, getEntrevistaPE } from '@/lib/airtable'
import {
  buildDuenosClusteringSystemPrompt,
  buildDuenosClusteringUserMessage,
} from '@/lib/duenos-clustering-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Sonnet 4.6 pricing (per million tokens).
const SONNET_INPUT_PER_M = 3
const SONNET_OUTPUT_PER_M = 15

export async function POST(
  _req: NextRequest,
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

  const inv = plan.plan?.inventario
  if (!inv || inv.movimientos.length === 0) {
    return NextResponse.json({ ok: true, clusters: [], costo_usd: 0, latencia_ms: 0 })
  }

  // Extraer dueños únicos del inventario activo (no quitados).
  const movsActivos = inv.movimientos.filter(m => m.estado_usuario !== 'quitado')
  const duenosSet = new Set<string>()
  for (const m of movsActivos) {
    const d = (m.dueno ?? '').trim()
    if (d) duenosSet.add(d)
  }
  const duenosUnicos = Array.from(duenosSet).sort()

  // Si hay <= 1 dueño único, no hay nada que clusterizar.
  if (duenosUnicos.length <= 1) {
    return NextResponse.json({ ok: true, clusters: [], costo_usd: 0, latencia_ms: 0 })
  }

  const systemPrompt = buildDuenosClusteringSystemPrompt()
  const userMessage = buildDuenosClusteringUserMessage(duenosUnicos, plan)

  console.log('[paso3/inventario/clusterizar-duenos] start', JSON.stringify({
    plan_id: planId,
    duenos_unicos: duenosUnicos.length,
  }))

  const MAX_ATTEMPTS = 3
  const BACKOFF_MS = [0, 2000, 5000]
  const start = Date.now()
  let costoUsd = 0
  let latenciaMs = 0
  let text = ''
  let lastError: any = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]))
    try {
      const attemptStart = Date.now()
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      console.log(`[paso3/inventario/clusterizar-duenos] Intento ${attempt}: OK en ${Date.now() - attemptStart}ms`)

      const inputTokens = finalMsg.usage.input_tokens
      const outputTokens = finalMsg.usage.output_tokens
      costoUsd += (inputTokens * SONNET_INPUT_PER_M + outputTokens * SONNET_OUTPUT_PER_M) / 1_000_000

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
      console.warn(`[paso3/inventario/clusterizar-duenos] Intento ${attempt} falló:`, {
        message: errAny?.message,
        is_transient: isTransient,
      })
      if (!isTransient || attempt === MAX_ATTEMPTS) break
    }
  }

  if (lastError) {
    latenciaMs = Date.now() - start
    return NextResponse.json({
      error: lastError instanceof Error ? lastError.message : String(lastError),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Parsear JSON.
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ }
    }
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.clusters)) {
    return NextResponse.json({
      error: 'Sonnet devolvió output no parseable o sin campo "clusters".',
      sonnet_response_preview: text.slice(0, 500),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Sanitización: filtrar clusters inválidos.
  // - variantes debe ser array de strings.
  // - todas las variantes deben existir en duenosUnicos (case-sensitive match
  //   ya que comparamos contra los strings reales del inventario).
  // - canonico_sugerido debe ser string no vacío.
  // - clusters con <2 variantes se descartan (no son duplicados).
  const duenosUnicosSet = new Set(duenosUnicos)
  const sanitizados: Array<{ variantes: string[]; canonico_sugerido: string }> = []
  for (const raw of parsed.clusters) {
    if (!raw || typeof raw !== 'object') continue
    const variantes = Array.isArray(raw.variantes)
      ? raw.variantes.filter((v: any) => typeof v === 'string' && duenosUnicosSet.has(v))
      : []
    if (variantes.length < 2) continue
    const canonico = typeof raw.canonico_sugerido === 'string' && raw.canonico_sugerido.trim()
      ? raw.canonico_sugerido.trim()
      : variantes[0]
    sanitizados.push({ variantes, canonico_sugerido: canonico })
  }

  // Defensive: garantizar que ninguna variante aparezca en 2 clusters distintos.
  // Si la AI lo hizo, dejamos solo la primera ocurrencia.
  const yaAsignados = new Set<string>()
  const clustersFinales = sanitizados
    .map(c => ({
      canonico_sugerido: c.canonico_sugerido,
      variantes: c.variantes.filter(v => {
        if (yaAsignados.has(v)) return false
        yaAsignados.add(v)
        return true
      }),
    }))
    .filter(c => c.variantes.length >= 2)

  console.log('[paso3/inventario/clusterizar-duenos] done', JSON.stringify({
    clusters_count: clustersFinales.length,
    costo_usd: Number(costoUsd.toFixed(4)),
    latencia_ms: latenciaMs,
  }))

  return NextResponse.json({
    ok: true,
    clusters: clustersFinales,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  })
}
