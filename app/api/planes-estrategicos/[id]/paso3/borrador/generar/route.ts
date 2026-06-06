// POST /api/planes-estrategicos/[id]/paso3/borrador/generar
//
// Genera una iteración del Borrador del plan (Sub-bloque 3.C) vía Opus.
// Persiste el resultado como nueva entry en plan.borrador.iteraciones[].
// Latencia esperada 60-120s para un plan rico.
//
// Body: {
//   numero_iteracion: 1 | 2 | 3,
//   disconformidades?: Array<{ elemento: string; razon: string }>  // solo si numero>1
// }
// Response: { ok: true, iteracion: BorradorIteracionPE, plan_actualizado: PlanoPE }
//          | { error: string, ... }
//
// Validaciones:
// - paso_actual=3, sub_bloque_actual='3.C' (o vino vía expected_sub_bloque)
// - plan.palancas.preguntas_principal con 5 items, todas con respuesta
// - plan.borrador.iteraciones.length < 3 (max 3 iteraciones)
// - Si numero_iteracion > 1: debe haber al menos una iteración previa
//
// Patrón de retry: idéntico al de /paso3/inventario/generar (UND_ERR_SOCKET +
// max 3 intentos con backoff). Opus reasoning interno puede tardar y romper
// el socket — un reintento normalmente funciona con cache caliente.

import { PE_MODEL } from '@/lib/llm-config'
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
  buildBorradorSystemPrompt,
  buildBorradorUserMessage,
  inyectarNombresMovimientos,
} from '@/lib/borrador-prompt'
import type { BorradorIteracionPE, PlanoPE } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Pricing claude-opus-4-7 ($15/M input, $75/M output) para tracking.
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

// Opus con max_tokens=24000 + reasoning interno puede tardar 60-180s. El
// default de Vercel (10s Hobby / 60s Pro) cierra la conexión antes y el
// cliente recibe response vacío → JSON.parse fails. 300s cubre el peor caso.
export const maxDuration = 300

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await handlePOST(req, { params })
  } catch (err) {
    // Global catch: cualquier excepción no atrapada (parsing del Opus output,
    // inyectarNombresMovimientos, updatePlanEstrategico, etc) cae acá. Sin
    // esto el route retorna 500 sin body y el cliente ve "JSON.parse: unexpected
    // end of data". Logueamos el stack completo del lado server.
    const errAny = err as any
    console.error('[paso3/borrador/generar] UNCAUGHT EXCEPTION:', errAny?.message)
    console.error('[paso3/borrador/generar] stack:', errAny?.stack)
    return NextResponse.json({
      error: `Error interno del servidor: ${errAny?.message ?? String(err)}`,
      hint: 'Mirá los logs del server (npm run dev / Vercel) para el stack trace completo.',
    }, { status: 500 })
  }
}

async function handlePOST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as {
    numero_iteracion?: 1 | 2 | 3
    disconformidades?: Array<{ elemento: string; razon: string }>
  } | null

  const numero = body?.numero_iteracion
  if (numero !== 1 && numero !== 2 && numero !== 3) {
    return NextResponse.json({
      error: 'Body debe incluir numero_iteracion: 1 | 2 | 3.',
    }, { status: 400 })
  }
  const disconformidades = body?.disconformidades ?? []

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  // Validaciones de estado
  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Borrador solo se genera en Paso 3. paso_actual actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }
  // Permitimos disparar desde 3.B también si las palancas están completas — el
  // user puede arrancar 3.C sin haber transicionado formalmente sub_bloque.
  // Sí exigimos las palancas + sus respuestas.
  //
  // Modos inline (P-4 secuenciacion, P-5 marcado_simple): el flow captura el
  // razonamiento POR MOV en el inventario, no en chat. Si respuesta_estructurada
  // está confirmada, consideramos la pregunta respondida aunque q.respuesta
  // texto esté vacío.
  const principal = plan.plan?.palancas?.preguntas_principal ?? []
  function preguntaSinResp(q: any): boolean {
    const modoInline = q.modo_interaccion === 'secuenciacion' || q.modo_interaccion === 'marcado_simple'
    if (modoInline && q.respuesta_estructurada) return false
    return !q.respuesta?.trim()
  }
  if (principal.length < 5 || principal.some(preguntaSinResp)) {
    return NextResponse.json({
      error: 'No se puede generar borrador sin las 5 preguntas_principal con respuesta.',
      principal_count: principal.length,
      sin_respuesta: principal.filter(preguntaSinResp).map((q: any) => q.id),
    }, { status: 409 })
  }

  const iteracionesPrevias = plan.plan?.borrador?.iteraciones ?? []
  if (iteracionesPrevias.length >= 3) {
    return NextResponse.json({
      error: 'Ya alcanzaste el máximo de 3 iteraciones de borrador. Si seguís disconforme, volvé a 3.A o 3.B para refinar.',
    }, { status: 409 })
  }
  if (iteracionesPrevias.length + 1 !== numero) {
    return NextResponse.json({
      error: `numero_iteracion inconsistente. Hay ${iteracionesPrevias.length} iteraciones previas, esperaba numero=${iteracionesPrevias.length + 1}.`,
    }, { status: 409 })
  }
  if (numero > 1 && disconformidades.length === 0) {
    return NextResponse.json({
      error: `Iteración ${numero} requiere al menos 1 disconformidad sobre la iteración anterior.`,
    }, { status: 400 })
  }

  const iteracionPrevia = numero > 1 ? iteracionesPrevias[numero - 2] : undefined

  const systemPrompt = buildBorradorSystemPrompt()
  const userMessage = buildBorradorUserMessage(plan, numero, iteracionPrevia, disconformidades)

  console.log('[paso3/borrador/generar] start', JSON.stringify({
    plan_id: planId,
    numero_iteracion: numero,
    user_message_chars: userMessage.length,
    disconformidades_count: disconformidades.length,
    movs_activos: (plan.plan?.inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado').length,
    palancas_principal: principal.length,
    palancas_validador: plan.plan?.palancas?.preguntas_validador?.length ?? 0,
  }))

  const start = Date.now()
  let costoUsd = 0
  let latenciaMs = 0
  let text = ''

  // Retry mechanism — mismo patrón que inventario/generar.
  const MAX_ATTEMPTS = 3
  const BACKOFF_MS = [0, 2000, 5000]
  let lastError: any = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(`[paso3/borrador/generar] Reintento ${attempt}/${MAX_ATTEMPTS} tras error transitorio. Esperando ${BACKOFF_MS[attempt - 1]}ms...`)
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]))
    }

    try {
      const attemptStart = Date.now()
      const stream = anthropic.messages.stream({
        model: PE_MODEL,
        // 24000 = headroom para un borrador rico (6 secciones, 3-7 decisiones,
        // 3-5 fases con razones, 2-5 alternativas) + Opus reasoning interno.
        // CLAUDE.md aprendizaje: en outputs estructurados ricos, max_tokens
        // chico trunca JSON mid-string. 16k era el chat default; el borrador
        // es más denso.
        max_tokens: 24000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      const attemptMs = Date.now() - attemptStart
      console.log(`[paso3/borrador/generar] Intento ${attempt}: Opus OK en ${attemptMs}ms · stop_reason=${finalMsg.stop_reason}`)

      const inputTokens = finalMsg.usage.input_tokens
      const outputTokens = finalMsg.usage.output_tokens
      costoUsd += (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

      text = finalMsg.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')

      if (finalMsg.stop_reason === 'max_tokens') {
        console.warn('[paso3/borrador/generar] Opus truncó por max_tokens — output puede ser JSON inválido')
      }
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
      console.warn(`[paso3/borrador/generar] Intento ${attempt} falló:`, {
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
    console.error('[paso3/borrador/generar] Todos los intentos fallaron:', errAny?.message)
    return NextResponse.json({
      error: lastError instanceof Error ? lastError.message : String(lastError),
      latencia_ms_total: latenciaMs,
      attempts: MAX_ATTEMPTS,
    }, { status: 500 })
  }

  // Parsear JSON tolerando texto extra antes/después.
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
    console.error('[paso3/borrador/generar] Opus output no parseable como JSON object')
    return NextResponse.json({
      error: 'La IA devolvió output no parseable como JSON object.',
      opus_response_preview: text.slice(0, 500),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Validación mínima de shape — chequeamos las 6 secciones obligatorias.
  const camposRequeridos = ['contexto', 'decisiones_priorizacion', 'secuencia_movimientos', 'supuestos_criticos', 'criterio_exito', 'alternativas_descartadas']
  const faltantes = camposRequeridos.filter(k => !(k in parsed))
  if (faltantes.length > 0) {
    return NextResponse.json({
      error: `Output del borrador falta campos obligatorios: ${faltantes.join(', ')}.`,
      keys_recibidas: Object.keys(parsed),
      apply_metrics: { costo_usd: costoUsd, latencia_ms: latenciaMs },
    }, { status: 500 })
  }

  // Armar la iteración final con metadata del backend (costo, latencia, fecha).
  const iteracionRaw: BorradorIteracionPE = {
    numero: numero,
    contexto: typeof parsed.contexto === 'string' ? parsed.contexto : '',
    decisiones_priorizacion: Array.isArray(parsed.decisiones_priorizacion) ? parsed.decisiones_priorizacion : [],
    secuencia_movimientos: Array.isArray(parsed.secuencia_movimientos) ? parsed.secuencia_movimientos : [],
    supuestos_criticos: Array.isArray(parsed.supuestos_criticos) ? parsed.supuestos_criticos : [],
    criterio_exito: parsed.criterio_exito ?? { pleno: '', minimo: '', path_minimo: '' },
    alternativas_descartadas: Array.isArray(parsed.alternativas_descartadas) ? parsed.alternativas_descartadas : [],
    disconformidades_usuario: [],
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
    generado_en: new Date().toISOString(),
  }

  // Post-procesamiento: inyectar nombre en M-X huérfanos. Defensa contra el
  // modelo olvidando la regla del prompt en menciones repetidas.
  const { iteracion, inyecciones, huerfanos } = inyectarNombresMovimientos(
    iteracionRaw,
    plan.plan?.inventario?.movimientos ?? [],
  )
  if (inyecciones > 0 || huerfanos > 0) {
    console.log(`[paso3/borrador/generar] post-proceso M-X: inyectados=${inyecciones} huerfanos_sin_inventario=${huerfanos}`)
  }

  // Audit trail: persistir las disconformidades que dispararon esta nueva
  // iteración en el campo disconformidades_usuario de la iteración previa
  // (la que está siendo "rechazada"). Sin esto, queda imposible reconstruir
  // a posteriori por qué la iteración N-1 fue descartada — el audit-reviewer
  // pierde trazabilidad.
  const iteracionesConAuditTrail = iteracionesPrevias.map((it, idx) => {
    if (idx === numero - 2 && disconformidades.length > 0) {
      return { ...it, disconformidades_usuario: disconformidades }
    }
    return it
  })

  // Persistir en plan.borrador.iteraciones (append, no replace).
  const borradorActualizado = {
    iteraciones: [...iteracionesConAuditTrail, iteracion],
    iteracion_aceptada: plan.plan?.borrador?.iteracion_aceptada,
  }
  const planActualizado: PlanoPE = {
    ...plan.plan,
    borrador: borradorActualizado,
  }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/borrador/generar] done', JSON.stringify({
    plan_id: planId,
    numero_iteracion: numero,
    contexto_chars: iteracion.contexto.length,
    decisiones_count: iteracion.decisiones_priorizacion.length,
    fases_count: iteracion.secuencia_movimientos.length,
    supuestos_count: iteracion.supuestos_criticos.length,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  }))

  return NextResponse.json({
    ok: true,
    iteracion,
    plan_actualizado: planActualizado,
  })
}
