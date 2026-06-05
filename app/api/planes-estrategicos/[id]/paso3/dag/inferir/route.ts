// POST /api/planes-estrategicos/[id]/paso3/dag/inferir
//
// Pide a Opus que proponga TODAS las dependencias del inventario en una lista
// plana — UN solo DAG por plan. NO persiste nada — devuelve solo la propuesta
// para que el user revise en el PropuestaDAGModal.
//
// Aplicación: si el user acepta, se llama POST /paso3/dag/aceptar con la lista
// de dependencias, que escribe las precondiciones globalmente + persiste el
// DAG con posiciones dagre.

import { PE_MODEL } from '@/lib/llm-config'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico, getEntrevistaPE } from '@/lib/airtable'
import {
  buildInferirDAGSystemPrompt,
  buildInferirDAGUserMessage,
} from '@/lib/inferir-dag-prompt'
import { normalizeDepTipoEdge } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

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

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Inferencia del DAG solo durante Paso 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  const inv = plan.plan?.inventario
  if (!inv || inv.movimientos.length === 0) {
    return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })
  }

  const movsCandidatos = inv.movimientos.filter(m => m.estado_usuario !== 'quitado')
  if (movsCandidatos.length === 0) {
    return NextResponse.json({ error: 'No hay movimientos activos.' }, { status: 409 })
  }

  const systemPrompt = buildInferirDAGSystemPrompt()
  const userMessage = buildInferirDAGUserMessage(movsCandidatos, plan)

  console.log('[paso3/dag/inferir] start', JSON.stringify({
    plan_id: planId,
    movs_candidatos: movsCandidatos.length,
  }))

  // Retry para errores transitorios.
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
      console.log(`[paso3/dag/inferir] Intento ${attempt}: llamando a Opus...`)
      const attemptStart = Date.now()
      const stream = anthropic.messages.stream({
        model: PE_MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      console.log(`[paso3/dag/inferir] Intento ${attempt}: OK en ${Date.now() - attemptStart}ms`)

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
      console.warn(`[paso3/dag/inferir] Intento ${attempt} falló:`, {
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

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.dependencias)) {
    return NextResponse.json({
      error: 'Opus devolvió output no parseable o sin campo "dependencias".',
      opus_response_preview: text.slice(0, 500),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Sanitización: filtrar ids inválidos, self-ref, dedupe pares, ciclo-check.
  const idsValidos = new Set(movsCandidatos.map(m => m.id))
  const sanitizadasRaw = parsed.dependencias
    .filter((d: any) =>
      typeof d?.desde === 'string' &&
      typeof d?.hacia === 'string' &&
      d.desde !== d.hacia &&
      idsValidos.has(d.desde) &&
      idsValidos.has(d.hacia)
    )
    .map((d: any) => {
      const tipo = normalizeDepTipoEdge(d.tipo)
      const rawLag = typeof d.lag_meses === 'number' && Number.isFinite(d.lag_meses) ? d.lag_meses : 0
      const lag = tipo === 'sugerida' ? 0 : Math.max(0, Math.floor(rawLag))
      return {
        desde: d.desde,
        hacia: d.hacia,
        tipo,
        razonamiento: typeof d.razonamiento === 'string' ? d.razonamiento : '',
        lag_meses: lag,
      }
    })

  // Dedupe (desde, hacia): si Opus duplicó, conservamos la primera.
  const seen = new Set<string>()
  const deduplicadas = sanitizadasRaw.filter((d: { desde: string; hacia: string }) => {
    const key = `${d.desde}->${d.hacia}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Ciclo-check: incrementalmente agregamos cada dep, descartando las que
  // crearían un ciclo en el grafo acumulado.
  type Dep = { desde: string; hacia: string; tipo: 'sugerida' | 'ff' | 'fs' | 'continuo'; razonamiento: string; lag_meses: number }
  const grafoAcum = new Map<string, Set<string>>() // source → targets
  const dependenciasSinCiclos: Dep[] = []
  for (const d of deduplicadas as Dep[]) {
    // Si hacia → ... → desde ya existe, agregar desde → hacia crearía ciclo.
    const visitados = new Set<string>()
    const cola = [d.hacia]
    let formariaCiclo = false
    while (cola.length) {
      const cur = cola.shift()!
      if (cur === d.desde) { formariaCiclo = true; break }
      if (visitados.has(cur)) continue
      visitados.add(cur)
      const targets = grafoAcum.get(cur)
      if (targets) for (const t of targets) cola.push(t)
    }
    if (formariaCiclo) continue
    if (!grafoAcum.has(d.desde)) grafoAcum.set(d.desde, new Set())
    grafoAcum.get(d.desde)!.add(d.hacia)
    dependenciasSinCiclos.push(d)
  }

  console.log('[paso3/dag/inferir] done', JSON.stringify({
    deps_emitidas_por_opus: parsed.dependencias.length,
    deps_sanitizadas: dependenciasSinCiclos.length,
    deps_descartadas: parsed.dependencias.length - dependenciasSinCiclos.length,
    costo_usd: Number(costoUsd.toFixed(4)),
    latencia_ms: latenciaMs,
  }))

  return NextResponse.json({
    ok: true,
    dependencias: dependenciasSinCiclos,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  })
}
