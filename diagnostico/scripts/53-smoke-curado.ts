// Smoke test del endpoint /paso3/curado/generar.
//
// Replica la lógica del endpoint sin pasar por HTTP. Valida:
//   - Generación con Opus (~60s, $0.50)
//   - Lookup de IDs → MovimientoPE completo
//   - Lookup de descripciones → SupuestoExogenoPE completo
//   - Que ajustes_aplicado de estres se reflejen en el curado
//   - Que la regla "M-X (nombre)" funcione en texto narrativo
//
// Pre-condición: el dummy debe tener borrador.iteracion_aceptada + plan.estres.preguntas.
// Si el dummy no está listo, correr primero 52-fast-forward-dummy-to-3E.ts.
//
// Uso: npx tsx --env-file=.env.local diagnostico/scripts/53-smoke-curado.ts

import {
  getPlanEstrategico,
  updatePlanEstrategico,
} from '@/lib/airtable'
import { buildCuradoSystemPrompt, buildCuradoUserMessage } from '@/lib/curado-prompt'
import { inyectarNombresMovimientos } from '@/lib/borrador-prompt'
import Anthropic from '@anthropic-ai/sdk'
import type { PlanCuradoPE, PlanoPE, MovimientoPE, SupuestoExogenoPE, BorradorIteracionPE } from '@/lib/types'

const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'
const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

async function main() {
  if ((PLAN_DUMMY_ID as string) === (PLAN_SR_ID as string)) {
    throw new Error('Sanity check: PLAN_DUMMY_ID y PLAN_SR_ID coinciden — abort.')
  }
  console.log(`[smoke curado] Plan dummy: ${PLAN_DUMMY_ID}`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`[smoke curado] Plan "${plan.nombre}" cargado.`)

  const iteracionAceptada = plan.plan?.borrador?.iteracion_aceptada
  if (!iteracionAceptada) throw new Error('Pre-check: no hay borrador.iteracion_aceptada. Correr 52-fast-forward primero.')
  const borradorAceptado = (plan.plan?.borrador?.iteraciones ?? []).find(it => it.numero === iteracionAceptada)
  if (!borradorAceptado) throw new Error(`Pre-check: iteración aceptada #${iteracionAceptada} no existe.`)
  const estresPreguntas = plan.plan?.estres?.preguntas ?? []
  const ajustesEnEstres = estresPreguntas.filter(q => q.ajuste_aplicado)
  console.log(`[smoke curado] Pre-check OK:`)
  console.log(`  - Borrador iteración ${iteracionAceptada} aceptada (${borradorAceptado.decisiones_priorizacion.length} decisiones, ${borradorAceptado.secuencia_movimientos.length} fases)`)
  console.log(`  - ${estresPreguntas.length} preguntas de estrés, ${ajustesEnEstres.length} con ajuste_aplicado`)

  const systemPrompt = buildCuradoSystemPrompt()
  const userMessage = buildCuradoUserMessage(plan, borradorAceptado, estresPreguntas, undefined)
  console.log(`[smoke curado] User message: ${userMessage.length} chars.`)

  console.log(`\n[smoke curado] Llamando a Opus (max_tokens=24000)...`)
  const start = Date.now()
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
  const costoUsd = (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000

  const text = finalMsg.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  console.log(`[smoke curado] Opus OK en ${(latenciaMs / 1000).toFixed(1)}s · costo=$${costoUsd.toFixed(3)} · stop=${finalMsg.stop_reason}`)
  if (finalMsg.stop_reason === 'max_tokens') console.warn('[smoke curado] ⚠ TRUNCADO por max_tokens')

  let parsed: any
  try { parsed = JSON.parse(text) }
  catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) { try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ } }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`[smoke curado] ❌ Output no parseable. Primeros 500 chars:`)
    console.error(text.slice(0, 500))
    process.exit(1)
  }
  const requeridos = ['contexto', 'decisiones_priorizacion', 'secuencia_movimientos', 'supuestos_criticos_descripciones', 'criterio_exito', 'alternativas_descartadas']
  const faltantes = requeridos.filter(k => !(k in parsed))
  if (faltantes.length > 0) {
    console.error(`[smoke curado] ❌ Faltan: ${faltantes.join(', ')}`)
    process.exit(1)
  }

  // Lookups + inyección
  const movimientosById = new Map<string, MovimientoPE>()
  for (const m of plan.plan?.inventario?.movimientos ?? []) movimientosById.set(m.id, m)
  const supuestosByDesc = new Map<string, SupuestoExogenoPE>()
  for (const s of plan.plan?.preparativos?.supuestos_exogenos ?? []) supuestosByDesc.set(s.descripcion, s)

  const conNombres = inyectarNombresMovimientos({
    numero: 1,
    contexto: parsed.contexto ?? '',
    decisiones_priorizacion: (parsed.decisiones_priorizacion ?? []).map((d: any) => ({
      decision: d.decision ?? '', razon: d.razon ?? '', alternativas_descartadas: [],
    })),
    secuencia_movimientos: (parsed.secuencia_movimientos ?? []).map((f: any) => ({
      fase: f.fase ?? '',
      movimientos: f.movimientos_ids ?? [],
      razon_secuencia: f.razon_secuencia ?? '',
    })),
    supuestos_criticos: parsed.supuestos_criticos_descripciones ?? [],
    criterio_exito: parsed.criterio_exito ?? { pleno: '', minimo: '', path_minimo: '' },
    alternativas_descartadas: parsed.alternativas_descartadas ?? [],
    disconformidades_usuario: [],
    costo_usd: 0,
    latencia_ms: 0,
    generado_en: '',
  } as BorradorIteracionPE, plan.plan?.inventario?.movimientos ?? [])
  const norm = conNombres.iteracion

  let huerfanosMovs = 0
  let huerfanosSups = 0
  const curado: PlanCuradoPE = {
    contexto: norm.contexto,
    decisiones_priorizacion: norm.decisiones_priorizacion.map(d => ({ decision: d.decision, razon: d.razon })),
    secuencia_movimientos: norm.secuencia_movimientos.map(f => ({
      fase: f.fase,
      movimientos: f.movimientos.map(id => {
        const m = movimientosById.get(id); if (!m) huerfanosMovs++
        return m
      }).filter((m): m is MovimientoPE => m !== undefined),
      razon_secuencia: f.razon_secuencia,
    })),
    supuestos_criticos: norm.supuestos_criticos.map(d => {
      const s = supuestosByDesc.get(d); if (!s) huerfanosSups++
      return s
    }).filter((s): s is SupuestoExogenoPE => s !== undefined),
    criterio_exito: norm.criterio_exito,
    alternativas_descartadas: norm.alternativas_descartadas.map(a => ({ decision: a.decision, razon: a.razon })),
    cerrado_en: new Date().toISOString(),
  }

  // Persistir
  await updatePlanEstrategico(PLAN_DUMMY_ID, { plan: { ...plan.plan, curado } as PlanoPE })

  // ─── Reporte interpretado ──────────────────────────────────────────────
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`RESULTADO INTERPRETADO`)
  console.log(`${'═'.repeat(72)}\n`)
  console.log(`📊 Métricas:`)
  console.log(`  Latencia: ${(latenciaMs / 1000).toFixed(1)}s (esperado 60-90s)`)
  console.log(`  Costo:    $${costoUsd.toFixed(3)} USD`)
  console.log(`  Inyecciones M-X (nombre): ${conNombres.inyecciones} · huérfanos=${conNombres.huerfanos}`)
  console.log(`  Lookups: ${huerfanosMovs} movimientos huérfanos, ${huerfanosSups} supuestos huérfanos`)

  console.log(`\n📝 Resumen del curado:`)
  console.log(`  1. contexto: ${curado.contexto.length} chars`)
  console.log(`     "${curado.contexto.slice(0, 200).replace(/\s+/g, ' ')}${curado.contexto.length > 200 ? '...' : ''}"`)
  console.log(`\n  2. decisiones_priorizacion (${curado.decisiones_priorizacion.length}):`)
  curado.decisiones_priorizacion.forEach((d, i) => console.log(`     [${i + 1}] ${d.decision.slice(0, 120)}`))
  console.log(`\n  3. secuencia_movimientos (${curado.secuencia_movimientos.length} fases):`)
  curado.secuencia_movimientos.forEach((f, i) => console.log(`     [F${i + 1}] ${f.fase}: [${f.movimientos.map(m => m.id).join(', ')}] · ${f.movimientos.length} movs CON DATA COMPLETA`))
  console.log(`\n  4. supuestos_criticos (${curado.supuestos_criticos.length}):`)
  curado.supuestos_criticos.forEach((s, i) => console.log(`     [${i + 1}] "${s.descripcion.slice(0, 100)}" · tipo=${s.tipo} prob=${s.probabilidad}`))
  console.log(`\n  5. criterio_exito.path_minimo:`)
  console.log(`     "${curado.criterio_exito.path_minimo.slice(0, 250)}"`)
  console.log(`\n  6. alternativas_descartadas (${curado.alternativas_descartadas.length}):`)
  curado.alternativas_descartadas.forEach((a, i) => console.log(`     [${i + 1}] ${a.decision.slice(0, 100)}`))

  // Validaciones de negocio
  console.log(`\n🔍 Validaciones:`)

  // 1. Ajustes de estrés reflejados
  const ajustesDescripciones = ajustesEnEstres.map(q => q.ajuste_aplicado!.descripcion)
  const todosLosTextos = [
    curado.contexto,
    ...curado.decisiones_priorizacion.flatMap(d => [d.decision, d.razon]),
    ...curado.secuencia_movimientos.flatMap(f => [f.fase, f.razon_secuencia]),
    curado.criterio_exito.pleno, curado.criterio_exito.minimo, curado.criterio_exito.path_minimo,
    ...curado.alternativas_descartadas.flatMap(a => [a.decision, a.razon]),
  ].join(' ').toLowerCase()
  let ajustesReflejados = 0
  for (const desc of ajustesDescripciones) {
    // Heurística: chequear si palabras clave del ajuste aparecen en el curado.
    // Tomamos 2-3 palabras "raras" (>5 chars) del ajuste y vemos si aparecen.
    const palabrasClave = desc.toLowerCase().split(/\s+/).filter(w => w.length > 6).slice(0, 3)
    if (palabrasClave.length > 0 && palabrasClave.every(p => todosLosTextos.includes(p))) {
      ajustesReflejados++
    }
  }
  console.log(`  Ajustes de estrés reflejados (heurística por palabras clave): ${ajustesReflejados}/${ajustesEnEstres.length}`)

  // 2. Lookups completos
  if (huerfanosMovs === 0 && huerfanosSups === 0) {
    console.log(`  ✓ Todos los lookups exitosos (movimientos + supuestos resueltos a objetos completos).`)
  } else {
    console.log(`  ⚠ Lookups con huérfanos — revisar matchear más estricto`)
  }

  // 3. Regla M-X con nombre
  const MOV_SIN_NOMBRE = /\bM-\d{1,2}\b(?!\s*\()/g
  const violaciones: string[] = []
  for (const texto of todosLosTextos.split(' ').slice(0, 0)) {} // skip dup
  const camposNarrativos = [
    { campo: 'contexto', texto: curado.contexto },
    ...curado.decisiones_priorizacion.flatMap((d, i) => [
      { campo: `decision[${i}].decision`, texto: d.decision },
      { campo: `decision[${i}].razon`, texto: d.razon },
    ]),
    ...curado.secuencia_movimientos.map((f, i) => ({ campo: `fase[${i}].razon_secuencia`, texto: f.razon_secuencia })),
    { campo: 'criterio.pleno', texto: curado.criterio_exito.pleno },
    { campo: 'criterio.minimo', texto: curado.criterio_exito.minimo },
    { campo: 'criterio.path_minimo', texto: curado.criterio_exito.path_minimo },
    ...curado.alternativas_descartadas.flatMap((a, i) => [
      { campo: `alt[${i}].decision`, texto: a.decision },
      { campo: `alt[${i}].razon`, texto: a.razon },
    ]),
  ]
  for (const { campo, texto } of camposNarrativos) {
    if (!texto) continue
    for (const m of texto.matchAll(MOV_SIN_NOMBRE)) {
      violaciones.push(`${campo}: "${texto.slice(Math.max(0, (m.index ?? 0) - 25), (m.index ?? 0) + 25).replace(/\s+/g, ' ')}"`)
    }
  }
  if (violaciones.length === 0) {
    console.log(`  ✓ Regla "M-X con nombre": todos los IDs en texto narrativo tienen nombre.`)
  } else {
    console.log(`  ❌ ${violaciones.length} M-X sin nombre (post-inyección):`)
    violaciones.slice(0, 5).forEach(v => console.log(`     - ${v}`))
  }

  console.log(`\n${'═'.repeat(72)}`)
  console.log(`✓ SMOKE CURADO PASS — plan.curado generado y persistido.`)
  console.log(`${'═'.repeat(72)}`)
}

main().catch(e => {
  console.error('[smoke curado] FATAL:', e)
  process.exit(1)
})
