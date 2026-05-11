// Smoke test del endpoint /paso3/borrador/generar (iteración 1).
//
// Replica la lógica del endpoint sin pasar por HTTP — usa env vars de
// AIRTABLE_API_KEY y ANTHROPIC_API_KEY directamente. NO requiere session
// token (auth-less). Pensado para que Augusto lo corra solo.
//
// Toca el plan dummy (recEsoKMENVQI8NUb) — NO el Plan Sr.
//
// Costo esperado: $2-4 USD.
// Latencia esperada: 60-120s.
//
// Uso: npx tsx --env-file=.env.local diagnostico/scripts/49-smoke-borrador-iter1.ts

import {
  getPlanEstrategico,
  updatePlanEstrategico,
} from '@/lib/airtable'
import {
  buildBorradorSystemPrompt,
  buildBorradorUserMessage,
  inyectarNombresMovimientos,
} from '@/lib/borrador-prompt'
import Anthropic from '@anthropic-ai/sdk'
import type { BorradorIteracionPE, PlanoPE } from '@/lib/types'

const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'
const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'

const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

async function main() {
  if ((PLAN_DUMMY_ID as string) === (PLAN_SR_ID as string)) {
    throw new Error('Sanity check: PLAN_DUMMY_ID y PLAN_SR_ID coinciden — abort.')
  }
  console.log(`[smoke borrador i1] Plan dummy: ${PLAN_DUMMY_ID}`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`[smoke borrador i1] Plan "${plan.nombre}" cargado.`)

  // Validaciones de estado (mismas que el endpoint)
  const principal = plan.plan?.palancas?.preguntas_principal ?? []
  if (principal.length < 5 || principal.some(q => !q.respuesta?.trim())) {
    throw new Error(`Pre-check falló: necesito 5 palancas_principal con respuesta. Estado: ${principal.filter(q => q.respuesta?.trim()).length}/${principal.length}.`)
  }

  const movsActivos = (plan.plan?.inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado')
  const movsQuitados = (plan.plan?.inventario?.movimientos ?? []).filter(m => m.estado_usuario === 'quitado')
  console.log(`[smoke borrador i1] Pre-check OK:`)
  console.log(`  - ${movsActivos.length} movimientos activos en inventario`)
  console.log(`  - ${movsQuitados.length} movimientos quitados (NO deberían aparecer en el borrador): ${movsQuitados.map(m => m.id).join(', ')}`)
  console.log(`  - ${principal.length} palancas principal respondidas`)
  console.log(`  - ${plan.plan?.palancas?.preguntas_validador?.length ?? 0} palancas validador respondidas`)

  const iteracionesPrevias = plan.plan?.borrador?.iteraciones ?? []
  if (iteracionesPrevias.length > 0) {
    console.log(`[smoke borrador i1] WARNING: ya hay ${iteracionesPrevias.length} iteración(es) previa(s). Sobrescribo para test limpio.`)
  }

  const systemPrompt = buildBorradorSystemPrompt()
  const userMessage = buildBorradorUserMessage(plan, 1, undefined, undefined)
  console.log(`[smoke borrador i1] User message: ${userMessage.length} chars.`)

  console.log(`\n[smoke borrador i1] Llamando a Opus (max_tokens=24000)...`)
  const start = Date.now()

  let costoUsd = 0
  let text = ''
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 24000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
    const finalMsg = await stream.finalMessage()
    const latenciaMs = Date.now() - start

    const inputTokens = finalMsg.usage.input_tokens
    const outputTokens = finalMsg.usage.output_tokens
    costoUsd = (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

    text = finalMsg.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('\n')

    console.log(`[smoke borrador i1] Opus OK en ${(latenciaMs / 1000).toFixed(1)}s · stop_reason=${finalMsg.stop_reason} · in=${inputTokens} out=${outputTokens} · costo=$${costoUsd.toFixed(3)}`)

    if (finalMsg.stop_reason === 'max_tokens') {
      console.error(`[smoke borrador i1] ⚠ TRUNCADO por max_tokens — JSON probablemente inválido.`)
    }

    // Parsear JSON
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
      console.error(`[smoke borrador i1] ❌ Output no parseable como JSON object. Primeros 500 chars:`)
      console.error(text.slice(0, 500))
      process.exit(1)
    }

    // Validación de shape
    const camposRequeridos = ['contexto', 'decisiones_priorizacion', 'secuencia_movimientos', 'supuestos_criticos', 'criterio_exito', 'alternativas_descartadas']
    const faltantes = camposRequeridos.filter(k => !(k in parsed))
    if (faltantes.length > 0) {
      console.error(`[smoke borrador i1] ❌ Faltan campos: ${faltantes.join(', ')}`)
      console.error(`Keys recibidas: ${Object.keys(parsed).join(', ')}`)
      process.exit(1)
    }

    // Construir la iteración cruda
    const iteracionRaw: BorradorIteracionPE = {
      numero: 1,
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

    // Post-proceso: inyectar nombres en M-X huérfanos (mismo que el endpoint).
    const { iteracion, inyecciones, huerfanos } = inyectarNombresMovimientos(
      iteracionRaw,
      plan.plan?.inventario?.movimientos ?? [],
    )
    console.log(`[smoke borrador i1] Post-proceso M-X: inyectados=${inyecciones} huerfanos=${huerfanos}`)

    // Persistir
    const planActualizado: PlanoPE = {
      ...plan.plan,
      borrador: {
        iteraciones: [iteracion],
        iteracion_aceptada: undefined,
      },
    }
    await updatePlanEstrategico(PLAN_DUMMY_ID, { plan: planActualizado })
    console.log(`[smoke borrador i1] ✓ Iteración persistida en plan.borrador.iteraciones[0].`)

    // ─── ANÁLISIS INTERPRETADO ─────────────────────────────────────────
    console.log(`\n${'═'.repeat(72)}`)
    console.log(`RESULTADO INTERPRETADO`)
    console.log(`${'═'.repeat(72)}\n`)

    console.log(`📊 Métricas:`)
    console.log(`  Latencia: ${(latenciaMs / 1000).toFixed(1)}s (esperado 60-120s)`)
    console.log(`  Costo:    $${costoUsd.toFixed(3)} USD`)
    console.log(`  Tokens:   in=${inputTokens} out=${outputTokens}`)

    console.log(`\n📝 Resumen de las 6 secciones:`)
    console.log(`  1. contexto: ${iteracion.contexto.length} chars`)
    console.log(`     "${iteracion.contexto.slice(0, 200).replace(/\s+/g, ' ')}${iteracion.contexto.length > 200 ? '...' : ''}"`)

    console.log(`\n  2. decisiones_priorizacion: ${iteracion.decisiones_priorizacion.length} decisiones`)
    iteracion.decisiones_priorizacion.forEach((d, i) => {
      console.log(`     [${i + 1}] ${d.decision?.slice(0, 120)}`)
    })

    console.log(`\n  3. secuencia_movimientos: ${iteracion.secuencia_movimientos.length} fases`)
    iteracion.secuencia_movimientos.forEach((f, i) => {
      console.log(`     [${i + 1}] ${f.fase}: [${(f.movimientos ?? []).join(', ')}]`)
    })

    console.log(`\n  4. supuestos_criticos: ${iteracion.supuestos_criticos.length} supuestos`)
    iteracion.supuestos_criticos.forEach((s, i) => {
      console.log(`     [${i + 1}] ${s.slice(0, 120)}`)
    })

    console.log(`\n  5. criterio_exito:`)
    console.log(`     pleno:        ${iteracion.criterio_exito.pleno?.slice(0, 150)}`)
    console.log(`     minimo:       ${iteracion.criterio_exito.minimo?.slice(0, 150)}`)
    console.log(`     path_minimo:  ${iteracion.criterio_exito.path_minimo?.slice(0, 200)}`)

    console.log(`\n  6. alternativas_descartadas: ${iteracion.alternativas_descartadas.length} alternativas`)
    iteracion.alternativas_descartadas.forEach((a, i) => {
      console.log(`     [${i + 1}] ${a.decision?.slice(0, 120)}`)
    })

    // ─── VALIDACIONES DE NEGOCIO ───────────────────────────────────────
    console.log(`\n🔍 Validaciones de negocio:`)

    // 1. ¿Respeta movimientos quitados (NO los incluye)?
    const todosLosMovsEnSecuencia = new Set<string>()
    for (const fase of iteracion.secuencia_movimientos) {
      for (const movId of (fase.movimientos ?? [])) {
        todosLosMovsEnSecuencia.add(movId)
      }
    }
    const quitadosIncluidos = movsQuitados.filter(m => todosLosMovsEnSecuencia.has(m.id))
    if (quitadosIncluidos.length === 0) {
      console.log(`  ✓ Respeta movimientos quitados: NINGUNO de [${movsQuitados.map(m => m.id).join(', ')}] aparece en secuencia.`)
    } else {
      console.log(`  ❌ VIOLACIÓN: ${quitadosIncluidos.length} movimientos quitados aparecen en secuencia: ${quitadosIncluidos.map(m => m.id).join(', ')}`)
    }

    // 2. ¿Respeta la cadena crítica M-3 → M-4 → M-1?
    // Buscamos en qué fase aparece cada uno y verificamos el orden.
    const posicionEnSecuencia = new Map<string, number>()
    iteracion.secuencia_movimientos.forEach((fase, i) => {
      for (const movId of (fase.movimientos ?? [])) {
        if (!posicionEnSecuencia.has(movId)) posicionEnSecuencia.set(movId, i)
      }
    })
    const m3 = posicionEnSecuencia.get('M-3')
    const m4 = posicionEnSecuencia.get('M-4')
    const m1 = posicionEnSecuencia.get('M-1')
    console.log(`  Cadena crítica M-3 → M-4 → M-1:`)
    console.log(`    M-3 en fase ${m3 !== undefined ? m3 : 'NO INCLUIDO'}`)
    console.log(`    M-4 en fase ${m4 !== undefined ? m4 : 'NO INCLUIDO'}`)
    console.log(`    M-1 en fase ${m1 !== undefined ? m1 : 'NO INCLUIDO'}`)
    if (m3 !== undefined && m4 !== undefined && m1 !== undefined) {
      if (m3 <= m4 && m4 <= m1) {
        console.log(`    ✓ Orden respetado: M-3 ≤ M-4 ≤ M-1`)
      } else {
        console.log(`    ❌ Orden VIOLADO: la cadena crítica del 3.B no se respetó`)
      }
    } else {
      console.log(`    ⚠ Cadena incompleta — alguno de M-3/M-4/M-1 no aparece`)
    }

    // 3. Movs activos cubiertos
    const activosNoIncluidos = movsActivos.filter(m => !todosLosMovsEnSecuencia.has(m.id))
    if (activosNoIncluidos.length === 0) {
      console.log(`  ✓ Todos los movimientos activos están en la secuencia.`)
    } else {
      console.log(`  ⚠ ${activosNoIncluidos.length} movimientos activos NO están en la secuencia: ${activosNoIncluidos.map(m => m.id).join(', ')} (puede ser intencional)`)
    }

    // 4. IDs con nombre entre paréntesis (regla nueva).
    // Recolectar todos los campos de texto narrativo del output. Por cada M-X que
    // aparezca, chequear que vaya seguido de " (nombre del movimiento)". Si NO
    // tiene el nombre, es violación de la regla.
    const camposNarrativos: Array<{ campo: string; texto: string }> = [
      { campo: 'contexto', texto: iteracion.contexto },
      ...iteracion.decisiones_priorizacion.flatMap((d, i) => [
        { campo: `decisiones_priorizacion[${i}].decision`, texto: d.decision ?? '' },
        { campo: `decisiones_priorizacion[${i}].razon`, texto: d.razon ?? '' },
        ...((d.alternativas_descartadas ?? []).map((a, j) => ({ campo: `decisiones_priorizacion[${i}].alternativas_descartadas[${j}]`, texto: a }))),
      ]),
      ...iteracion.secuencia_movimientos.map((f, i) => ({ campo: `secuencia_movimientos[${i}].razon_secuencia`, texto: f.razon_secuencia ?? '' })),
      ...iteracion.supuestos_criticos.map((s, i) => ({ campo: `supuestos_criticos[${i}]`, texto: s })),
      { campo: 'criterio_exito.pleno', texto: iteracion.criterio_exito.pleno },
      { campo: 'criterio_exito.minimo', texto: iteracion.criterio_exito.minimo },
      { campo: 'criterio_exito.path_minimo', texto: iteracion.criterio_exito.path_minimo },
      ...iteracion.alternativas_descartadas.flatMap((a, i) => [
        { campo: `alternativas_descartadas[${i}].decision`, texto: a.decision ?? '' },
        { campo: `alternativas_descartadas[${i}].razon`, texto: a.razon ?? '' },
      ]),
    ]
    // Regex: encuentra M-X (sin nombre después). El \b después de los dígitos
    // es crítico: sin él, la regex matchea "M-1" como substring de "M-10" porque
    // \d{1,2} backtrackea de 2 a 1 dígito cuando el lookahead falla. Mismo
    // pattern que inyectarNombresMovimientos en lib/borrador-prompt.ts.
    const MOV_SIN_NOMBRE_RE = /\bM-\d{1,2}\b(?!\s*\()/g
    const violaciones: Array<{ campo: string; movId: string; contexto: string }> = []
    for (const { campo, texto } of camposNarrativos) {
      if (!texto) continue
      for (const match of texto.matchAll(MOV_SIN_NOMBRE_RE)) {
        const movId = match[0]
        const idx = match.index ?? 0
        const ctx = texto.slice(Math.max(0, idx - 30), Math.min(texto.length, idx + 30))
        violaciones.push({ campo, movId, contexto: `...${ctx}...` })
      }
    }
    if (violaciones.length === 0) {
      console.log(`  ✓ Regla "IDs con nombre": TODOS los M-X en texto narrativo tienen nombre entre paréntesis.`)
    } else {
      console.log(`  ❌ Regla "IDs con nombre": ${violaciones.length} M-X sin nombre detectado(s):`)
      // Mostrar primeras 10 violaciones para no spamear
      for (const v of violaciones.slice(0, 10)) {
        console.log(`     - [${v.campo}] ${v.movId} → "${v.contexto.replace(/\s+/g, ' ')}"`)
      }
      if (violaciones.length > 10) {
        console.log(`     ... y ${violaciones.length - 10} más.`)
      }
    }

    console.log(`\n${'═'.repeat(72)}`)
    console.log(`✓ B.1 SMOKE PASS — iteración 1 generada y persistida correctamente.`)
    console.log(`${'═'.repeat(72)}`)
  } catch (e) {
    console.error(`[smoke borrador i1] ERROR:`, e)
    if (text) {
      console.error(`[smoke borrador i1] Opus response preview (primeros 1000 chars):`)
      console.error(text.slice(0, 1000))
    }
    process.exit(1)
  }
}

main().catch(e => {
  console.error('[smoke borrador i1] FATAL:', e)
  process.exit(1)
})
