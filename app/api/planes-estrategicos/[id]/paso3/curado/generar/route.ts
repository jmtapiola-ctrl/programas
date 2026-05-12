// POST /api/planes-estrategicos/[id]/paso3/curado/generar
//
// Genera plan.curado integrando borrador aceptado + ajustes de 3.D + opcional
// ajuste narrativo del usuario en 3.E. Persiste como plan.curado (single object).
//
// Body: { ajuste_narrativo?: string }  // pedido del usuario en 3.E
// Response: { ok: true, curado: PlanCuradoPE, plan_actualizado: PlanoPE }
//
// Validaciones:
//   - paso_actual=3, sub_bloque='3.E' (o 3.D si dispara temprano — tolerante)
//   - plan.borrador.iteracion_aceptada está seteado
//   - La iteración aceptada existe en plan.borrador.iteraciones[]
//
// Patrón de retry: idéntico a borrador/generar (UND_ERR_SOCKET + max 3 intentos).
//
// Post-proceso: el endpoint hace el lookup de IDs → MovimientoPE completo y
// descripciones → SupuestoExogenoPE completo. El modelo solo emite el esqueleto
// narrativo. Esto evita errores de transcripción.

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
  buildCuradoSystemPrompt,
  buildCuradoUserMessage,
} from '@/lib/curado-prompt'
import { inyectarNombresMovimientos } from '@/lib/borrador-prompt'
import type { PlanCuradoPE, PlanoPE, MovimientoPE, SupuestoExogenoPE, BorradorIteracionPE } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const body = await req.json().catch(() => null) as { ajuste_narrativo?: string } | null
  const ajusteNarrativoUser = body?.ajuste_narrativo?.trim() || undefined

  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(planId),
    getEntrevistaPE(planId),
  ])
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  if (entrevista.paso_actual !== 3) {
    return NextResponse.json({
      error: `Curado solo se genera en Paso 3. paso_actual actual: ${entrevista.paso_actual}.`,
    }, { status: 409 })
  }

  // Pre-checks de inputs.
  const iteracionAceptada = plan.plan?.borrador?.iteracion_aceptada
  if (!iteracionAceptada) {
    return NextResponse.json({
      error: 'No hay borrador aceptado (plan.borrador.iteracion_aceptada). Acepta una iteración primero en 3.C.',
    }, { status: 409 })
  }
  const iteraciones = plan.plan?.borrador?.iteraciones ?? []
  const borradorAceptado = iteraciones.find(it => it.numero === iteracionAceptada)
  if (!borradorAceptado) {
    return NextResponse.json({
      error: `Iteración aceptada #${iteracionAceptada} no encontrada en plan.borrador.iteraciones[].`,
    }, { status: 409 })
  }
  const estresPreguntas = plan.plan?.estres?.preguntas ?? []
  // 3.E no requiere estres con preguntas — es válido curar solo con el borrador
  // si el modelo decidió saltar 3.D (ej: borrador 100% sólido sin necesidad).

  const systemPrompt = buildCuradoSystemPrompt()
  const userMessage = buildCuradoUserMessage(plan, borradorAceptado, estresPreguntas, ajusteNarrativoUser)

  console.log('[paso3/curado/generar] start', JSON.stringify({
    plan_id: planId,
    user_message_chars: userMessage.length,
    iteracion_aceptada: iteracionAceptada,
    estres_preguntas: estresPreguntas.length,
    ajustes_a_aplicar: estresPreguntas.filter(q => q.ajuste_aplicado).length,
    ajuste_narrativo_user: ajusteNarrativoUser ? `${ajusteNarrativoUser.slice(0, 80)}...` : null,
  }))

  const start = Date.now()
  let costoUsd = 0
  let latenciaMs = 0
  let text = ''

  const MAX_ATTEMPTS = 3
  const BACKOFF_MS = [0, 2000, 5000]
  let lastError: any = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(`[paso3/curado/generar] Reintento ${attempt}/${MAX_ATTEMPTS}. Esperando ${BACKOFF_MS[attempt - 1]}ms...`)
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]))
    }
    try {
      const attemptStart = Date.now()
      const stream = anthropic.messages.stream({
        model: 'claude-opus-4-7',
        max_tokens: 24000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const finalMsg = await stream.finalMessage()
      latenciaMs = Date.now() - start
      console.log(`[paso3/curado/generar] Intento ${attempt}: Opus OK en ${Date.now() - attemptStart}ms · stop_reason=${finalMsg.stop_reason}`)

      const inputTokens = finalMsg.usage.input_tokens
      const outputTokens = finalMsg.usage.output_tokens
      costoUsd += (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

      text = finalMsg.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')

      if (finalMsg.stop_reason === 'max_tokens') {
        console.warn('[paso3/curado/generar] Opus truncó por max_tokens')
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
      console.warn(`[paso3/curado/generar] Intento ${attempt} falló:`, errAny?.message)
      if (!isTransient || attempt === MAX_ATTEMPTS) break
    }
  }

  if (lastError) {
    latenciaMs = Date.now() - start
    return NextResponse.json({
      error: lastError instanceof Error ? lastError.message : String(lastError),
      latencia_ms_total: latenciaMs,
    }, { status: 500 })
  }

  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) { try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ } }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({
      error: 'Opus output no parseable como JSON object.',
      opus_response_preview: text.slice(0, 500),
    }, { status: 500 })
  }

  // Validación mínima de shape.
  const camposRequeridos = ['contexto', 'decisiones_priorizacion', 'secuencia_movimientos', 'supuestos_criticos_descripciones', 'criterio_exito', 'alternativas_descartadas']
  const faltantes = camposRequeridos.filter(k => !(k in parsed))
  if (faltantes.length > 0) {
    return NextResponse.json({
      error: `Output del curado falta campos obligatorios: ${faltantes.join(', ')}.`,
      keys_recibidas: Object.keys(parsed),
    }, { status: 500 })
  }

  // ─── Lookups: IDs → MovimientoPE completo, descripciones → SupuestoExogenoPE
  const movimientosById = new Map<string, MovimientoPE>()
  for (const m of plan.plan?.inventario?.movimientos ?? []) movimientosById.set(m.id, m)

  const supuestosByDesc = new Map<string, SupuestoExogenoPE>()
  for (const s of plan.plan?.preparativos?.supuestos_exogenos ?? []) supuestosByDesc.set(s.descripcion, s)

  // Aplicar inyección de nombres a campos narrativos (regla global "M-X (nombre)").
  // Reusamos el helper de borrador construyendo un objeto compatible.
  const conNombresInjected = inyectarNombresMovimientos({
    numero: 1,  // placeholder, no se usa en la operación
    contexto: typeof parsed.contexto === 'string' ? parsed.contexto : '',
    decisiones_priorizacion: Array.isArray(parsed.decisiones_priorizacion) ? parsed.decisiones_priorizacion.map((d: any) => ({
      decision: d.decision ?? '',
      razon: d.razon ?? '',
      alternativas_descartadas: [],  // PlanCuradoPE no tiene este campo en decision — placeholder
    })) : [],
    secuencia_movimientos: Array.isArray(parsed.secuencia_movimientos) ? parsed.secuencia_movimientos.map((f: any) => ({
      fase: f.fase ?? '',
      movimientos: Array.isArray(f.movimientos_ids) ? f.movimientos_ids : [],
      razon_secuencia: f.razon_secuencia ?? '',
    })) : [],
    supuestos_criticos: Array.isArray(parsed.supuestos_criticos_descripciones) ? parsed.supuestos_criticos_descripciones : [],
    criterio_exito: parsed.criterio_exito ?? { pleno: '', minimo: '', path_minimo: '' },
    alternativas_descartadas: Array.isArray(parsed.alternativas_descartadas) ? parsed.alternativas_descartadas : [],
    disconformidades_usuario: [],
    costo_usd: 0,
    latencia_ms: 0,
    generado_en: '',
  } as BorradorIteracionPE, plan.plan?.inventario?.movimientos ?? [])

  const norm = conNombresInjected.iteracion

  // Construir PlanCuradoPE final con lookups.
  let huerfanosMovimientos = 0
  let huerfanosSupuestos = 0

  const curado: PlanCuradoPE = {
    contexto: norm.contexto,
    decisiones_priorizacion: norm.decisiones_priorizacion.map(d => ({
      decision: d.decision,
      razon: d.razon,
    })),
    secuencia_movimientos: norm.secuencia_movimientos.map(f => ({
      fase: f.fase,
      movimientos: f.movimientos
        .map(id => {
          const mov = movimientosById.get(id)
          if (!mov) huerfanosMovimientos++
          return mov
        })
        .filter((m): m is MovimientoPE => m !== undefined),
      razon_secuencia: f.razon_secuencia,
    })),
    supuestos_criticos: norm.supuestos_criticos
      .map(desc => {
        const sup = supuestosByDesc.get(desc)
        if (!sup) huerfanosSupuestos++
        return sup
      })
      .filter((s): s is SupuestoExogenoPE => s !== undefined),
    criterio_exito: norm.criterio_exito,
    alternativas_descartadas: norm.alternativas_descartadas.map(a => ({
      decision: a.decision,
      razon: a.razon,
    })),
    cerrado_en: new Date().toISOString(),
  }

  if (huerfanosMovimientos > 0 || huerfanosSupuestos > 0) {
    console.warn(`[paso3/curado/generar] Lookups con huérfanos — movimientos=${huerfanosMovimientos} supuestos=${huerfanosSupuestos}. El curado se generó con los matches que sí existieron; revisar si afectan al output.`)
  }

  // Versionado no-destructivo: si ya existe plan.curado, appendeamos la nueva
  // versión al final del array y movemos version_activa al nuevo índice. Las
  // versiones anteriores (incluyendo las "abandonadas" si el user había vuelto
  // a una previa antes de pedir nuevo ajuste) quedan accesibles para navegar.
  const curadoPrev = plan.plan?.curado
  const versionesPrev = curadoPrev?.versiones ?? []
  const nuevasVersiones = [...versionesPrev, curado]
  const curadoVersionado = {
    versiones: nuevasVersiones,
    version_activa: nuevasVersiones.length - 1,
  }

  const planActualizado: PlanoPE = { ...plan.plan, curado: curadoVersionado }
  await updatePlanEstrategico(planId, { plan: planActualizado })

  console.log('[paso3/curado/generar] done', JSON.stringify({
    plan_id: planId,
    version_nueva: curadoVersionado.version_activa,
    total_versiones: nuevasVersiones.length,
    contexto_chars: curado.contexto.length,
    decisiones: curado.decisiones_priorizacion.length,
    fases: curado.secuencia_movimientos.length,
    movs_total: curado.secuencia_movimientos.reduce((acc, f) => acc + f.movimientos.length, 0),
    supuestos: curado.supuestos_criticos.length,
    huerfanos_movimientos: huerfanosMovimientos,
    huerfanos_supuestos: huerfanosSupuestos,
    costo_usd: costoUsd,
    latencia_ms: latenciaMs,
  }))

  return NextResponse.json({
    ok: true,
    curado,
    version_activa: curadoVersionado.version_activa,
    total_versiones: nuevasVersiones.length,
    plan_actualizado: planActualizado,
    metricas: { costo_usd: costoUsd, latencia_ms: latenciaMs },
  })
}
