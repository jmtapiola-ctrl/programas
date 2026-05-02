// Fase 3 paso 5: smoke test final post-curación.
//
// Simula el endpoint /chat completo recibiendo un mensaje neutral nuevo
// ("Quiero confirmar antes de avanzar al Paso 3 que tenés todo el contexto.
//  Listame los 4 desvíos en una línea cada uno") tras la curación.
//
// Verifica:
//   1. El modelo responde coherente con el contexto curado.
//   2. El parser strict acepta el PANEL_UPDATE emitido.
//   3. El merge protector NO pisa con vacío ningún campo curado.
//   4. Los counters de salud se actualizan correctamente.
//   5. Re-leyendo el plan, todo lo curado sigue ahí.
//
// Es la prueba integral del fix end-to-end.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
  appendTurnosPE,
} from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'
import {
  parsePanelUpdate,
  mergeProposito,
  mergeSituacion,
  mergeDatosFaltantes,
  mergePasoActual,
} from '@/lib/pe-panel-update'
import type { TurnoPE, PanelUpdatePE } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'
const TEST_USER_INPUT = 'Quiero confirmar antes de avanzar al Paso 3 que tenés todo el contexto. Listame los 4 desvíos (principal + 3 secundarios) en una línea cada uno. Después seguimos.'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✔ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++ }
}

async function main() {
  console.log('═'.repeat(72))
  console.log('FASE 3 PASO 5 — Smoke test final post-curación')
  console.log('═'.repeat(72))

  // 1. Estado pre-test (snapshot conceptual)
  const planPre = await getPlanEstrategico(TARGET_PLAN_ID)
  const entrevPre = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevPre) throw new Error('Entrevista no encontrada')
  console.log(`Estado pre-smoke:`)
  console.log(`  proposito.fuera: ${planPre.proposito?.fuera?.length ?? 0} items (esperado 9)`)
  console.log(`  situacion.resistencias: ${planPre.situacion?.resistencias?.length ?? 0} items (esperado 6)`)
  console.log(`  situacion.causa_raiz: ${planPre.situacion?.causa_raiz?.length ?? 0} chars`)
  console.log(`  datos_faltantes: ${planPre.datos_faltantes?.length ?? 0} items (esperado 10)`)
  console.log(`  entrevista.paso_actual: ${entrevPre.paso_actual}, sub: ${entrevPre.sub_bloque_actual}`)
  console.log(`  entrevista.turnos_sin_panel_consecutivos: ${entrevPre.turnos_sin_panel_consecutivos ?? 0}`)
  console.log(`  entrevista.turnos en historial: ${entrevPre.historial.length}`)
  console.log()

  // 2. Construir messages como hace el endpoint
  const messages = entrevPre.historial.map(t => ({
    role: t.rol === 'model' ? 'assistant' as const : 'user' as const,
    content: t.contenido,
  }))
  messages.push({ role: 'user' as const, content: TEST_USER_INPUT })
  const systemPrompt = buildSystemPrompt(planPre, null)
  console.log(`Llamando a Opus con ${messages.length} messages, system ${systemPrompt.length} chars...`)
  console.log(`User input: "${TEST_USER_INPUT}"`)
  console.log()

  // 3. Llamada a Anthropic
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const start = Date.now()
  // max_tokens=8000 (vs 4096 del endpoint real) porque mi simulación NO incluye
  // el retry mechanism — si el modelo trunca, no tengo cómo reintentar.
  // En el endpoint real, max_tokens=4096 + retry cubre los casos de truncación.
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 16000,
    system: systemPrompt,
    messages,
  })
  const latency = Date.now() - start
  console.log(`✔ Respuesta en ${(latency / 1000).toFixed(1)}s — input=${resp.usage.input_tokens} output=${resp.usage.output_tokens} costo aprox $${((resp.usage.input_tokens * 15 + resp.usage.output_tokens * 75) / 1_000_000).toFixed(2)}`)
  console.log()

  const fullText = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  // 4. Parser strict
  const parseResult = parsePanelUpdate(fullText)
  check('Parser acepta el PANEL_UPDATE', parseResult.ok,
    parseResult.ok ? '' : `${parseResult.reason}: ${parseResult.errors.slice(0, 2).join('; ')}`)

  if (!parseResult.ok) {
    console.error('Parse falló — abortando smoke test sin persistir.')
    process.exit(1)
  }

  const panelUpdate: PanelUpdatePE = parseResult.data
  console.log(`  PANEL_UPDATE recibido: paso=${panelUpdate.paso_actual} sub=${panelUpdate.sub_bloque_actual}`)
  console.log(`  proposito.fuera incoming: ${panelUpdate.proposito.fuera.length} items`)
  console.log(`  situacion.resistencias incoming: ${panelUpdate.situacion.resistencias.length} items`)
  console.log(`  situacion.causa_raiz incoming: ${panelUpdate.situacion.causa_raiz.length} chars`)
  console.log()

  // 5. Aplicar merge — verificar que NO pisa con vacío ni shrinkage
  console.log('Aplicando merge protector...')
  const propMerge = mergeProposito(planPre.proposito, panelUpdate.proposito)
  const sitMerge = mergeSituacion(planPre.situacion, panelUpdate.situacion)
  const datosMerge = mergeDatosFaltantes(planPre.datos_faltantes, panelUpdate.datos_faltantes)
  const allEvents = [...propMerge.events, ...sitMerge.events, ...datosMerge.events]
  const preservedEmpty = allEvents.filter(e => e.type === 'preserved_empty')
  const shrinkages = allEvents.filter(e => e.type === 'preserved_shrinkage')
  const updated = allEvents.filter(e => e.type === 'updated')
  console.log(`  updated: ${updated.length}, preserved_empty: ${preservedEmpty.length}, preserved_shrinkage: ${shrinkages.length}`)
  if (preservedEmpty.length > 0) {
    console.log('  ⚠ El merge PROTEGIÓ estos campos (incoming vacío, current preservado):')
    for (const e of preservedEmpty) console.log(`     - ${e.field}`)
    console.log('  → ESTO ES BUENO: significa que el merge protector funcionó como esperaba.')
  }
  if (shrinkages.length > 0) {
    console.log('  ⚠ El merge PROTEGIÓ estos arrays de shrinkage:')
    for (const e of shrinkages) console.log(`     - ${e.field}: current=${(e as any).current_size} incoming=${(e as any).incoming_size}`)
  }

  // CRÍTICO: el plan curado tiene datos completos. El merge resultante DEBE conservarlos.
  check('Post-merge: proposito.fuera tiene 9 items (curados conservados)', propMerge.value.fuera.length === 9, `got ${propMerge.value.fuera.length}`)
  check('Post-merge: situacion.resistencias tiene 6 items', sitMerge.value.resistencias.length === 6, `got ${sitMerge.value.resistencias.length}`)
  check('Post-merge: situacion.causa_raiz no vacía', sitMerge.value.causa_raiz.length > 100, `len=${sitMerge.value.causa_raiz.length}`)
  check('Post-merge: situacion.consecuencia_12m no vacía', sitMerge.value.consecuencia_12m.length > 100)
  check('Post-merge: datos_faltantes tiene 10 items', datosMerge.value.length === 10, `got ${datosMerge.value.length}`)

  // 6. Persistir nuevo turno + update plan/entrevista
  console.log()
  console.log('Persistiendo turno y actualizaciones...')
  const turnoUser: TurnoPE = {
    rol: 'user',
    contenido: TEST_USER_INPUT,
    timestamp: new Date().toISOString(),
    paso: 2,
  }
  const textoLimpio = fullText.replace(/<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/, '').trim()
  const turnoModelo: TurnoPE = {
    rol: 'model',
    contenido: textoLimpio,
    timestamp: new Date().toISOString(),
    paso: 2,
  }
  const indiceInicial = entrevPre.historial.length
  await appendTurnosPE(entrevPre.id, [turnoUser, turnoModelo], indiceInicial)
  console.log(`  ✔ Turnos ${indiceInicial} (user) y ${indiceInicial + 1} (model) persistidos`)

  await updatePlanEstrategico(TARGET_PLAN_ID, {
    proposito: propMerge.value,
    situacion: sitMerge.value,
    datos_faltantes: datosMerge.value,
    horizonte: propMerge.value.horizonte,
  })
  console.log('  ✔ updatePlanEstrategico')

  await updateEntrevistaPE(entrevPre.id, {
    paso_actual: mergePasoActual(entrevPre.paso_actual, panelUpdate.paso_actual),
    sub_bloque_actual: panelUpdate.sub_bloque_actual,
    ultimo_panel_update_ok: new Date().toISOString(),
    turnos_sin_panel_consecutivos: 0,
  })
  console.log('  ✔ updateEntrevistaPE')

  // 7. Re-leer y verificar
  console.log()
  console.log('Verificación post-smoke:')
  const planPost = await getPlanEstrategico(TARGET_PLAN_ID)
  const entrevPost = await getEntrevistaPE(TARGET_PLAN_ID)
  check('proposito.fuera persistido sigue en 9 items', planPost.proposito?.fuera?.length === 9, `got ${planPost.proposito?.fuera?.length}`)
  check('situacion.resistencias persistido sigue en 6 items', planPost.situacion?.resistencias?.length === 6, `got ${planPost.situacion?.resistencias?.length}`)
  check('datos_faltantes persistido sigue en 10 items', planPost.datos_faltantes?.length === 10, `got ${planPost.datos_faltantes?.length}`)
  check('entrevista.turnos en historial = pre + 2', (entrevPost?.historial.length ?? 0) === entrevPre.historial.length + 2)
  check('entrevista.turnos_sin_panel_consecutivos = 0', entrevPost?.turnos_sin_panel_consecutivos === 0)
  check('entrevista.ultimo_panel_update_ok actualizado', !!entrevPost?.ultimo_panel_update_ok)

  // 8. Mostrar la respuesta del modelo para validar coherencia
  console.log()
  console.log('─── Respuesta del modelo (texto limpio) ───')
  console.log(textoLimpio)
  console.log()

  // Guardar todo para auditoría
  fs.writeFileSync(
    path.join(ROOT, 'output', '23-smoke-test-post-curacion.json'),
    JSON.stringify({
      ran_at: new Date().toISOString(),
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      latency_ms: latency,
      user_input: TEST_USER_INPUT,
      model_response: textoLimpio,
      panel_update_received: panelUpdate,
      merge_events: { updated: updated.length, preserved_empty: preservedEmpty.length, preserved_shrinkage: shrinkages.length },
      events_detail: allEvents,
    }, null, 2),
  )
  console.log('✔ Guardado: 23-smoke-test-post-curacion.json')
  console.log()
  console.log('═'.repeat(72))
  console.log(`RESULTADO: ${pass} passed, ${fail} failed`)
  console.log('═'.repeat(72))
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
