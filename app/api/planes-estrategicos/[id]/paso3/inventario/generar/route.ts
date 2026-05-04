// POST /api/planes-estrategicos/[id]/paso3/inventario/generar
//
// Genera el inventario inicial del Sub-bloque 3.A vía Opus con prompt JSON-only.
// Persiste el resultado en plan.inventario (no via PANEL_UPDATE — directo al
// campo Plan Paso 3 JSON). Latencia esperada 30-60s para un plan rico.
//
// Body: {} (sin payload — todo viene del estado actual del plan)
// Response: { ok: true, inventario: InventarioPE, costo_usd, latencia_ms }
//          | { error: string, status }
//
// Estado: requiere paso_actual=3 + plan.preparativos poblado. Si plan.inventario
// ya existe, devuelve 409 (no re-generar — usar el existente o pasar por flow
// de re-generación que llegará en Fase D si hace falta).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import {
  buildInventarioSystemPrompt,
  buildInventarioUserMessage,
} from '@/lib/inventario-prompt'
import type { InventarioPE, PlanoPE } from '@/lib/types'

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

  // Cargar plan + entrevista en paralelo
  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  // Validaciones de estado
  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Inventario solo se genera en Paso 3. paso_actual actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }
  if (!plan.plan?.preparativos) {
    return NextResponse.json({
      error: 'No se puede generar inventario sin plan.preparativos completo (sub-bloque 3.0).',
    }, { status: 409 })
  }
  if (plan.plan?.inventario) {
    return NextResponse.json({
      error: 'plan.inventario ya existe. No se re-genera automáticamente.',
      hint: 'Si querés re-generar, borrar plan.inventario primero (manual desde Airtable).',
    }, { status: 409 })
  }

  const systemPrompt = buildInventarioSystemPrompt()
  const userMessage = buildInventarioUserMessage(plan)

  console.log('[paso3/inventario/generar] start', JSON.stringify({
    plan_id: planId,
    user_message_chars: userMessage.length,
    areas_afectadas: plan.plan.preparativos.areas_afectadas?.length ?? 0,
    supuestos: plan.plan.preparativos.supuestos_exogenos?.length ?? 0,
  }))

  const start = Date.now()
  let costoUsd = 0
  let latenciaMs = 0
  let inventarioParsed: InventarioPE

  try {
    // streaming requerido — max_tokens 32k puede llevar a runtime > 10 min y
    // el SDK rechaza messages.create() en ese caso.
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 32000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
    const finalMsg = await stream.finalMessage()
    latenciaMs = Date.now() - start

    const inputTokens = finalMsg.usage.input_tokens
    const outputTokens = finalMsg.usage.output_tokens
    costoUsd = (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

    const text = finalMsg.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('\n')

    // Parsear JSON. Tolerar texto extra antes/después extrayendo el primer { ... }
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
      console.error('[paso3/inventario/generar] Opus output no parseable como JSON object')
      return NextResponse.json({
        error: 'Opus devolvió output no parseable como JSON object.',
        opus_response_preview: text.slice(0, 500),
        apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
      }, { status: 500 })
    }

    if (!Array.isArray(parsed.movimientos)) {
      return NextResponse.json({
        error: 'Output sin "movimientos" como array.',
        keys: Object.keys(parsed),
        apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
      }, { status: 500 })
    }

    // Setear generado_en si Opus no lo metió
    inventarioParsed = {
      movimientos: parsed.movimientos,
      resumenes_categoria: parsed.resumenes_categoria ?? [],
      generado_en: parsed.generado_en || new Date().toISOString(),
      costo_usd: costoUsd,
      latencia_ms: latenciaMs,
    }
  } catch (err) {
    console.error('[paso3/inventario/generar] Anthropic call failed:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Persistir en plan.inventario (preservar plan.preparativos existente)
  const planActualizado: PlanoPE = {
    ...plan.plan,
    inventario: inventarioParsed,
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/inventario/generar] done', JSON.stringify({
    plan_id: planId,
    movimientos_total: inventarioParsed.movimientos.length,
    categorias_total: inventarioParsed.resumenes_categoria.length,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  }))

  return NextResponse.json({
    ok: true,
    inventario: inventarioParsed,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  })
}
