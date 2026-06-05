// POST /api/planes-estrategicos/[id]/paso3/palancas/p4/sugerir-fases
//
// ⚠️ DEPRECADO desde V2 de P-4: el scheduling ahora es DETERMINÍSTICO via
// computeSchedule (CPM) en `lib/computeSchedule.ts`. La AI ya no se llama
// desde el cliente. Esta route se conserva por compat (no se borró para no
// romper si algún cliente legacy todavía la llama), pero el flow nuevo NO la
// usa. Si vuelve a hacer falta scheduling probabilístico, considerar
// re-purposear este endpoint pero con los nuevos campos (duracion_meses_ejecucion).
//
// Llama a Opus para sugerir fases temporales (Q2/Q3/Q4) por cada movimiento
// activo del inventario. Se dispara desde el panel de P-4 cuando el user
// llega a la pregunta y todavía no tiene una respuesta_estructurada con
// sugerencias_ai cacheadas.
//
// El endpoint NO persiste nada — devuelve las sugerencias al cliente. El
// cliente persiste vía PATCH /paso3/palancas/respuesta-estructurada con el
// shape { modo: 'secuenciacion', fases: [...], sugerencias_ai, razonamientos_ai }
// cuando el user confirme.
//
// Response: { ok, sugerencias: { [movId]: { fase, razonamiento } }, costo_usd, latencia_ms }
//         | { error, status }

import { PE_MODEL } from '@/lib/llm-config'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico, getEntrevistaPE } from '@/lib/airtable'
import {
  buildP4SugerirFasesSystemPrompt,
  buildP4SugerirFasesUserMessage,
} from '@/lib/p4-sugerir-fases-prompt'
import type { PalancaQAPE } from '@/lib/types'
import { normalizeDepTipoEdge } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75
const FASES_VALIDAS = new Set(['Q2', 'Q3', 'Q4'])

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
      error: `Sugerencia de fases solo durante Paso 3. paso_actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  const inv = plan.plan?.inventario
  if (!inv || inv.movimientos.length === 0) {
    return NextResponse.json({ error: 'No hay inventario.' }, { status: 409 })
  }

  const movsActivos = inv.movimientos.filter(m => m.estado_usuario !== 'quitado')
  if (movsActivos.length === 0) {
    return NextResponse.json({ error: 'No hay movimientos activos.' }, { status: 409 })
  }

  // Preguntas previas (P-1..P-3 si existen). El prompt las usa como contexto.
  const palancas = plan.plan?.palancas
  const preguntasPrevias: PalancaQAPE[] = palancas?.preguntas_principal?.filter(q => q.id !== 'P-4') ?? []

  const systemPrompt = buildP4SugerirFasesSystemPrompt()
  const userMessage = buildP4SugerirFasesUserMessage(movsActivos, plan, preguntasPrevias)

  console.log('[paso3/palancas/p4/sugerir-fases] start', JSON.stringify({
    plan_id: planId,
    movs_activos: movsActivos.length,
    preguntas_previas: preguntasPrevias.length,
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
      console.log(`[paso3/palancas/p4/sugerir-fases] Intento ${attempt}: llamando a Opus...`)
      const attemptStart = Date.now()
      const stream = anthropic.messages.stream({
        model: PE_MODEL,
        max_tokens: 12000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      console.log(`[paso3/palancas/p4/sugerir-fases] Intento ${attempt}: OK en ${Date.now() - attemptStart}ms`)

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
      console.warn(`[paso3/palancas/p4/sugerir-fases] Intento ${attempt} falló:`, {
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

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.sugerencias !== 'object') {
    return NextResponse.json({
      error: 'Opus devolvió output no parseable o sin campo "sugerencias".',
      opus_response_preview: text.slice(0, 500),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Sanitización: filtrar entries con ids inválidos o fases inválidas.
  const idsValidos = new Set(movsActivos.map(m => m.id))
  const sanitizadas: { [movId: string]: { fase: string; razonamiento: string } } = {}
  for (const [movId, raw] of Object.entries(parsed.sugerencias)) {
    if (!idsValidos.has(movId)) continue
    if (!raw || typeof raw !== 'object') continue
    const r = raw as any
    const fase = typeof r.fase === 'string' ? r.fase : ''
    if (!FASES_VALIDAS.has(fase)) continue
    const razon = typeof r.razonamiento === 'string' ? r.razonamiento : ''
    sanitizadas[movId] = { fase, razonamiento: razon }
  }

  // Para los movs que Opus no cubrió, default a Q2 con razon vacía (raro pero defensive).
  for (const m of movsActivos) {
    if (!sanitizadas[m.id]) {
      sanitizadas[m.id] = { fase: 'Q2', razonamiento: '(sin sugerencia de la AI, asignado a Q2 por default)' }
    }
  }

  // ─── Floor determinístico (post-procesamiento) ─────────────────────────────
  // La AI da una sugerencia probabilística. El server aplica el "piso" basado
  // en datos duros del inventario:
  //   1. Vacancia: today + semanas_cobertura → fase mínima donde el mov puede
  //      arrancar (la vacancia debe estar cubierta antes).
  //   2. Ventana temporal declarada (mov.ventana_temporal.arranca YYYY-MM):
  //      si el user/AI ya declaró un mes de arranque, la fase debe respetarlo.
  //   3. DURA chain transitiva: si A→B con tipo='dura', B no puede estar en
  //      fase anterior a la de A. Iterativo hasta estabilizar.
  // Fase final = max(fase_AI, floor_calculado). Si el server overridea, el
  // razonamiento original se preserva y se anota el ajuste.
  const FASE_ORDEN: Record<string, number> = { Q2: 0, Q3: 1, Q4: 2 }
  const today = new Date()
  const year = today.getFullYear()
  const q2End = new Date(year, 5, 30, 23, 59, 59)   // 30 jun
  const q3End = new Date(year, 8, 30, 23, 59, 59)   // 30 sep
  function faseDeFecha(d: Date): 'Q2' | 'Q3' | 'Q4' {
    if (d <= q2End) return 'Q2'
    if (d <= q3End) return 'Q3'
    return 'Q4'
  }
  function faseDeYM(ym: string | undefined): 'Q2' | 'Q3' | 'Q4' | null {
    if (!ym) return null
    const match = ym.match(/^(\d{4})-(\d{2})$/)
    if (!match) return null
    const yearV = parseInt(match[1], 10)
    const monthV = parseInt(match[2], 10)
    if (yearV !== year) return null  // ventana en otro año → ignorar
    if (monthV >= 4 && monthV <= 6) return 'Q2'
    if (monthV >= 7 && monthV <= 9) return 'Q3'
    if (monthV >= 10 && monthV <= 12) return 'Q4'
    return null
  }
  function maxFase(a: 'Q2' | 'Q3' | 'Q4', b: 'Q2' | 'Q3' | 'Q4'): 'Q2' | 'Q3' | 'Q4' {
    return FASE_ORDEN[a] >= FASE_ORDEN[b] ? a : b
  }

  // Detección de vacancia: flag explícito O heurística legacy sobre el string
  // del dueño (planes pre-feature usan "[vacancia: X]" / "(Vacancia)" / etc).
  // Cuando solo aplica la heurística, asumimos 8 semanas como default razonable
  // (≈ 2 meses, el caso más común). El user puede editar el mov para fijar el
  // valor real desde el form modal.
  const DEFAULT_VACANCIA_SEMANAS = 8
  function detectarVacancia(m: typeof movsActivos[number]): { esVacante: boolean; semanas: number; esLegacy: boolean } {
    if (m.dueno_es_vacante === true) {
      return {
        esVacante: true,
        semanas: m.dueno_semanas_cobertura && m.dueno_semanas_cobertura > 0
          ? m.dueno_semanas_cobertura
          : DEFAULT_VACANCIA_SEMANAS,
        esLegacy: false,
      }
    }
    const d = (m.dueno ?? '').toLowerCase()
    if (/vacanc|vacante/.test(d)) {
      return { esVacante: true, semanas: DEFAULT_VACANCIA_SEMANAS, esLegacy: true }
    }
    return { esVacante: false, semanas: 0, esLegacy: false }
  }

  // Step 1: floor por vacancia + ventana_temporal (datos del mov individual).
  for (const m of movsActivos) {
    const aiSug = sanitizadas[m.id]
    if (!aiSug) continue
    const aiFase = aiSug.fase as 'Q2' | 'Q3' | 'Q4'
    let floor: 'Q2' | 'Q3' | 'Q4' = 'Q2'
    const overrideReasons: string[] = []
    // Vacancia (flag estructurado o heurística legacy).
    const vac = detectarVacancia(m)
    if (vac.esVacante) {
      const startDate = new Date(today.getTime() + vac.semanas * 7 * 86400000)
      const vacFase = faseDeFecha(startDate)
      if (FASE_ORDEN[vacFase] > FASE_ORDEN[floor]) {
        floor = vacFase
        const sufijo = vac.esLegacy ? ` sem asumidas` : ` sem`
        overrideReasons.push(`vacante ${vac.semanas}${sufijo} → arranca en ${vacFase}`)
      }
    }
    // Ventana declarada.
    const ventFase = faseDeYM(m.ventana_temporal?.arranca)
    if (ventFase && FASE_ORDEN[ventFase] > FASE_ORDEN[floor]) {
      floor = ventFase
      overrideReasons.push(`ventana arranca ${m.ventana_temporal!.arranca}`)
    }
    // Aplicar floor si supera la fase AI.
    if (FASE_ORDEN[floor] > FASE_ORDEN[aiFase]) {
      sanitizadas[m.id] = {
        fase: floor,
        razonamiento: `${aiSug.razonamiento} [Ajustado: ${overrideReasons.join(', ')}]`,
      }
    }
  }

  // Step 2: FF/FS chain transitiva (iterativo hasta estabilizar).
  // Si A → B con tipo FF o FS y A está en QX, B no puede estar antes de QX.
  // Endpoint deprecado (V2 usa CPM); preservamos el rule para compat.
  const MAX_ITER_DURA = 10
  let iter = 0
  let anyChanged = true
  while (anyChanged && iter < MAX_ITER_DURA) {
    anyChanged = false
    iter++
    for (const m of movsActivos) {
      const mSug = sanitizadas[m.id]
      if (!mSug) continue
      const mFase = mSug.fase as 'Q2' | 'Q3' | 'Q4'
      for (const precId of m.precondiciones ?? []) {
        const tipo = normalizeDepTipoEdge(m.precondiciones_tipo?.[precId])
        if (tipo !== 'ff' && tipo !== 'fs' && tipo !== 'continuo') continue
        const precSug = sanitizadas[precId]
        if (!precSug) continue
        const precFase = precSug.fase as 'Q2' | 'Q3' | 'Q4'
        if (FASE_ORDEN[precFase] > FASE_ORDEN[mFase]) {
          sanitizadas[m.id] = {
            fase: precFase,
            razonamiento: `${mSug.razonamiento} [Ajustado: precondición ${tipo.toUpperCase()} ${precId} en ${precFase}]`,
          }
          anyChanged = true
        }
      }
    }
  }

  console.log('[paso3/palancas/p4/sugerir-fases] done', JSON.stringify({
    sugerencias_count: Object.keys(sanitizadas).length,
    dura_iter: iter,
    costo_usd: Number(costoUsd.toFixed(4)),
    latencia_ms: latenciaMs,
  }))

  return NextResponse.json({
    ok: true,
    sugerencias: sanitizadas,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  })
}
