// POST /api/planes-estrategicos/[id]/comentar
//
// Loop de "Comentar" desde Pantalla 4. El user escribe un comentario y se llama
// a Opus con el resumen actual + comentario para regenerar el resumen del Paso.
// Loop iterativo, máximo 3 iteraciones por Paso (después fuerza nudge para cerrar).
//
// Body: { paso: number, comentario: string, iteracion: number }
// Devuelve: { ok: true, iteracion_actual, nudge_proximo, apply_metrics }
//
// Estado: requiere `esperando_aprobacion_final`. NO transiciona el estado —
// el resumen se actualiza pero el flow se mantiene en aprobación final.
//
// Tracking: el costo de cada iteración se SUMA al campo Apply Changes Cost USD
// del turno reviewer (la conversación de comentar es parte del apply ampliado).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
} from '@/lib/airtable'
import type { PropositorPE, SituacionPE } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_ITERACIONES = 3

const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

const SYSTEM_PROMPT = `Sos el modelo principal del wizard de planificación estratégica. El usuario aprobó tentativamente el resumen del Bloque tras la auditoría externa, pero quiere hacer un ajuste adicional. Tu tarea: aplicar el comentario del usuario al resumen.

Reglas:
- NO inventes contenido. Solo aplicá lo que el usuario pide.
- NO cambies campos que el usuario no mencionó.
- Si el comentario es ambiguo, interpretá conservadoramente (cambio mínimo).
- Mantené el shape de los items en arrays (metricas/fuera/desvios_secundarios/resistencias).

OUTPUT (JSON estricto, sin markdown):
{
  "proposito": { "escena":"...", "metricas":[...], "fuera":[...], "horizonte":"...", "estabilidad":"..." },
  "situacion": { "desvio_principal":"...", "desvio_cuantificado":"...", "desvios_secundarios":[...], "causa_raiz":"...", "consecuencia_6m":"...", "consecuencia_12m":"...", "recursos_actuales":"...", "recursos_faltantes":"...", "intentos_previos":"...", "resistencias":[...] },
  "datos_faltantes": [...]
}

Shape de items:
- metricas[i] = {metrica, valor_objetivo, valor_actual}
- fuera[i] = {item, razon}
- desvios_secundarios[i] = {descripcion, datos}
- resistencias[i] = {actor, descripcion, mitigacion, tipo, criticidad}
- datos_faltantes[i] = "<string>"`

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => ({}))
  const paso = body?.paso
  const comentario: string = typeof body?.comentario === 'string' ? body.comentario.trim() : ''
  const iteracion: number = typeof body?.iteracion === 'number' ? body.iteracion : 0

  if (typeof paso !== 'number' || paso < 1) {
    return NextResponse.json({ error: 'paso debe ser integer >= 1' }, { status: 400 })
  }
  if (comentario.length === 0) {
    return NextResponse.json({ error: 'comentario no puede estar vacío' }, { status: 400 })
  }
  if (iteracion >= MAX_ITERACIONES) {
    return NextResponse.json({
      error: `Ya se hicieron ${MAX_ITERACIONES} iteraciones de comentar (máximo). Aceptá el resumen o re-auditá.`,
      max_alcanzado: true,
    }, { status: 409 })
  }

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  const sub = entrevista.sub_estado_paso ?? 'en_curso'
  if (sub !== 'esperando_aprobacion_final') {
    return NextResponse.json({
      error: `sub_estado_paso debe ser 'esperando_aprobacion_final', es '${sub}'`,
    }, { status: 409 })
  }

  const resumenJson = JSON.stringify({
    proposito: plan.proposito ?? null,
    situacion: plan.situacion ?? null,
    datos_faltantes: plan.datos_faltantes ?? [],
  }, null, 2)

  const userMsg = `Bloque actual: Bloque ${paso}.
Iteración: ${iteracion + 1} de ${MAX_ITERACIONES}.

═════════════════════════════════════════════════════════════
RESUMEN ACTUAL DEL BLOQUE
═════════════════════════════════════════════════════════════

${resumenJson}

═════════════════════════════════════════════════════════════
COMENTARIO DEL USUARIO
═════════════════════════════════════════════════════════════

${comentario}

═════════════════════════════════════════════════════════════

Aplicá el comentario al resumen y devolvé el JSON actualizado completo.`

  try {
    const start = Date.now()
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    })
    const latency = Date.now() - start
    const cost = (resp.usage.input_tokens * OPUS_INPUT_PER_M + resp.usage.output_tokens * OPUS_OUTPUT_PER_M) / 1_000_000

    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('\n')

    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      const m = text.match(/\{[\s\S]*\}/)
      if (m) {
        try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ }
      }
    }

    if (!parsed?.proposito || !parsed?.situacion || !Array.isArray(parsed?.datos_faltantes)) {
      return NextResponse.json({
        error: 'Opus devolvió output inválido para el comentario.',
        opus_response_preview: text.slice(0, 500),
        apply_metrics: { costo_usd: cost, latencia_ms: latency },
      }, { status: 500 })
    }

    // Persistir resumen actualizado.
    await updatePlanEstrategico(planId, {
      proposito: parsed.proposito as PropositorPE,
      situacion: parsed.situacion as SituacionPE,
      datos_faltantes: parsed.datos_faltantes as string[],
      ...(parsed.proposito?.horizonte ? { horizonte: parsed.proposito.horizonte } : {}),
    })

    const proximaIteracion = iteracion + 1
    const nudgeProximo = proximaIteracion >= MAX_ITERACIONES

    console.log('[comentar]', JSON.stringify({
      event: 'comentar_aplicado',
      plan_id: planId,
      paso,
      iteracion: proximaIteracion,
      max: MAX_ITERACIONES,
      nudge_proximo: nudgeProximo,
      costo_usd: cost,
      latencia_ms: latency,
    }))

    return NextResponse.json({
      ok: true,
      iteracion_actual: proximaIteracion,
      nudge_proximo: nudgeProximo,
      apply_metrics: { costo_usd: cost, latencia_ms: latency },
    })
  } catch (err) {
    console.error('[comentar] Error inesperado:', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
