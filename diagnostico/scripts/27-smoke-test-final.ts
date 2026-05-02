// Smoke test final integral post Pieza 1+2+3.
//
// Simula el endpoint /chat completo (con retry mechanism) usando un mensaje
// neutral. Verifica:
//   1. El modelo responde coherente con el plan curado.
//   2. El parser strict (Pieza 2) acepta el PANEL_UPDATE — o si emite strings
//      sueltos en arrays, dispara retry mechanism.
//   3. El system prompt reforzado (Pieza 3) hace que el modelo emita objetos
//      con shape correcto desde el primer intento (idealmente).
//   4. El merge protector NO pisa los datos curados con vacío ni shrinkage.
//   5. La persistencia mantiene los datos como objetos shapeados.

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
  type ParseResult,
} from '@/lib/pe-panel-update'
import type { TurnoPE, PanelUpdatePE } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'
// Pregunta dentro del scope conocido (Paso 0-2) para forzar al modelo a emitir
// PANEL_UPDATE como respuesta de turno regular. El edge case de "fuera de scope"
// (donde el modelo legítimamente no actualiza el panel) lo cubre panel_unhealthy.
const TEST_USER_INPUT = 'Antes de cerrar definitivamente, resumime el desvío principal y los 3 secundarios en una línea cada uno.'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✔ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++ }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Replica de la función del endpoint chat/route.ts
async function retryPanelUpdate(
  systemPrompt: string,
  originalMessages: Anthropic.MessageParam[],
  failedAssistantResponse: string,
  parseResult: ParseResult & { ok: false },
): Promise<{ ok: true; data: PanelUpdatePE } | { ok: false; errors: string[] }> {
  const errorDescription =
    parseResult.reason === 'no_block'
      ? `Tu respuesta NO incluyó el bloque PANEL_UPDATE. El bloque es OBLIGATORIO en cada turno tuyo, sin excepción. Re-emitilo con TODO lo acumulado.`
      : parseResult.reason === 'malformed_json'
      ? `Tu bloque PANEL_UPDATE contiene JSON malformado. Error: ${parseResult.errors.join('; ')}`
      : `Tu bloque PANEL_UPDATE no cumple el contrato. Errores: ${parseResult.errors.join('; ')}`

  const retryMessages: Anthropic.MessageParam[] = [
    ...originalMessages,
    { role: 'assistant', content: failedAssistantResponse },
    {
      role: 'user',
      content: `${errorDescription}

Re-emití SOLO el bloque PANEL_UPDATE entre los marcadores <!--PANEL_UPDATE-->...<!--/PANEL_UPDATE-->, sin ningún texto fuera del bloque. JSON válido, todos los campos del contrato presentes, items de arrays como objetos con sus propiedades específicas.`,
    },
  ]

  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 12000,  // espejo del endpoint para retry
    system: systemPrompt,
    messages: retryMessages,
  })
  const text = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')
  const result = parsePanelUpdate(text)
  if (result.ok) return { ok: true, data: result.data }
  return { ok: false, errors: result.errors }
}

async function main() {
  console.log('═'.repeat(72))
  console.log('SMOKE TEST FINAL — Pieza 1+2+3 integradas')
  console.log('═'.repeat(72))

  const planPre = await getPlanEstrategico(TARGET_PLAN_ID)
  const entrevPre = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevPre) throw new Error('Entrevista no encontrada')
  console.log(`Estado pre-smoke:`)
  console.log(`  proposito.fuera: ${planPre.proposito?.fuera?.length ?? 0} items`)
  console.log(`  situacion.resistencias: ${planPre.situacion?.resistencias?.length ?? 0} items`)
  console.log(`  turnos en historial: ${entrevPre.historial.length}`)

  // Verificar que los items son objetos (post Pieza 1)
  const fuera0 = planPre.proposito?.fuera?.[0] as any
  const res0 = planPre.situacion?.resistencias?.[0] as any
  check('Pre-smoke: fuera[0] es objeto con .item', typeof fuera0 === 'object' && 'item' in fuera0)
  check('Pre-smoke: resistencias[0] es objeto con .actor + .descripcion + .mitigacion', typeof res0 === 'object' && 'actor' in res0 && 'descripcion' in res0 && 'mitigacion' in res0)

  console.log()
  console.log(`User input: "${TEST_USER_INPUT}"`)

  const messages: Anthropic.MessageParam[] = entrevPre.historial.map(t => ({
    role: t.rol === 'model' ? 'assistant' as const : 'user' as const,
    content: t.contenido,
  }))
  messages.push({ role: 'user' as const, content: TEST_USER_INPUT })
  const systemPrompt = buildSystemPrompt(planPre, null)
  console.log(`System prompt: ${systemPrompt.length} chars (con Pieza 3)`)
  console.log()

  // Llamada inicial — replica el endpoint real (max_tokens=4096)
  console.log('Llamada inicial a Opus (max_tokens=4096)...')
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 16000,  // espejo del endpoint
    system: systemPrompt,
    messages,
  })
  console.log(`✔ ${((Date.now() - start) / 1000).toFixed(1)}s — input=${resp.usage.input_tokens} output=${resp.usage.output_tokens} stop=${resp.stop_reason}`)

  const fullText = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  // Parser strict (Pieza 2)
  const parseResult = parsePanelUpdate(fullText)
  console.log()
  console.log(`Parser inicial: ${parseResult.ok ? '✔ OK' : `✗ ${parseResult.reason}`}`)

  let panelUpdate: PanelUpdatePE | null = null
  let retryDisparado = false

  if (parseResult.ok) {
    panelUpdate = parseResult.data
  } else {
    retryDisparado = true
    console.log(`  Errores: ${parseResult.errors.slice(0, 3).join('; ')}${parseResult.errors.length > 3 ? '...' : ''}`)
    console.log()
    console.log('─── Respuesta del modelo (primer intento, completa) ───')
    console.log(fullText)
    console.log('─── /respuesta ───')
    console.log()
    console.log('Disparando retry mechanism...')
    const retryResp = await retryPanelUpdate(systemPrompt, messages, fullText, parseResult)
    if (retryResp.ok) {
      panelUpdate = retryResp.data
      console.log('  ✔ Retry recuperó PANEL_UPDATE válido con shape correcto')
    } else {
      console.log(`  ✗ Retry también falló: ${retryResp.errors.slice(0, 3).join('; ')}`)
    }
  }

  check('PANEL_UPDATE final válido (con o sin retry)', panelUpdate !== null)
  if (!panelUpdate) {
    console.error('Sin PANEL_UPDATE — abortando sin persistir')
    summary()
    return
  }

  // Verificar shape de items recibidos
  const incomingFuera0 = panelUpdate.proposito.fuera[0] as any
  const incomingRes0 = panelUpdate.situacion.resistencias[0] as any
  check('Incoming fuera[0] es objeto con .item + .razon',
    typeof incomingFuera0 === 'object' && 'item' in incomingFuera0 && 'razon' in incomingFuera0)
  check('Incoming resistencias[0] es objeto con shape extendido (5 props)',
    typeof incomingRes0 === 'object' && 'actor' in incomingRes0 && 'descripcion' in incomingRes0 && 'mitigacion' in incomingRes0 && 'tipo' in incomingRes0 && 'criticidad' in incomingRes0)

  // Merge
  const propMerge = mergeProposito(planPre.proposito, panelUpdate.proposito)
  const sitMerge = mergeSituacion(planPre.situacion, panelUpdate.situacion)
  const datosMerge = mergeDatosFaltantes(planPre.datos_faltantes, panelUpdate.datos_faltantes)
  const allEvents = [...propMerge.events, ...sitMerge.events, ...datosMerge.events]
  const preservedEmpty = allEvents.filter(e => e.type === 'preserved_empty')
  const shrinkages = allEvents.filter(e => e.type === 'preserved_shrinkage')
  const updated = allEvents.filter(e => e.type === 'updated')
  console.log()
  console.log(`Merge: updated=${updated.length} preserved_empty=${preservedEmpty.length} shrinkages=${shrinkages.length}`)
  if (shrinkages.length > 0) {
    for (const e of shrinkages) console.log(`  ⚠ ${e.field}: current=${(e as any).current_size} incoming=${(e as any).incoming_size}`)
  }

  // Datos curados intactos
  check('Post-merge: fuera mantiene 9 items', propMerge.value.fuera.length === 9, `got ${propMerge.value.fuera.length}`)
  check('Post-merge: resistencias mantiene 6 items', sitMerge.value.resistencias.length === 6, `got ${sitMerge.value.resistencias.length}`)
  check('Post-merge: causa_raiz no vacía', sitMerge.value.causa_raiz.length > 100)

  // Verificar shape del merge final
  const mergedRes0 = sitMerge.value.resistencias[0] as any
  check('Post-merge: resistencias[0] mantiene shape extendido',
    typeof mergedRes0 === 'object' && 'descripcion' in mergedRes0 && 'mitigacion' in mergedRes0)

  // Persistir
  console.log()
  console.log('Persistiendo...')
  const turnoUser: TurnoPE = { rol: 'user', contenido: TEST_USER_INPUT, timestamp: new Date().toISOString(), paso: 2 }
  const textoLimpio = fullText.replace(/<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/, '').trim()
  const turnoModelo: TurnoPE = { rol: 'model', contenido: textoLimpio, timestamp: new Date().toISOString(), paso: 2 }
  await appendTurnosPE(entrevPre.id, [turnoUser, turnoModelo], entrevPre.historial.length)
  await updatePlanEstrategico(TARGET_PLAN_ID, {
    proposito: propMerge.value,
    situacion: sitMerge.value,
    datos_faltantes: datosMerge.value,
    horizonte: propMerge.value.horizonte,
  })
  await updateEntrevistaPE(entrevPre.id, {
    paso_actual: mergePasoActual(entrevPre.paso_actual, panelUpdate.paso_actual),
    sub_bloque_actual: panelUpdate.sub_bloque_actual,
    ultimo_panel_update_ok: new Date().toISOString(),
    turnos_sin_panel_consecutivos: 0,
    retries_panel_update_acumulados: (entrevPre.retries_panel_update_acumulados ?? 0) + (retryDisparado ? 1 : 0),
  })
  console.log('  ✔ Persistido')

  // Verificar leyendo de nuevo
  const planPost = await getPlanEstrategico(TARGET_PLAN_ID)
  const fuera0Post = planPost.proposito?.fuera?.[0] as any
  const res0Post = planPost.situacion?.resistencias?.[0] as any
  check('Post-persist: fuera[0] sigue siendo objeto con .item', typeof fuera0Post === 'object' && 'item' in fuera0Post)
  check('Post-persist: resistencias[0] sigue siendo objeto con shape extendido', typeof res0Post === 'object' && 'descripcion' in res0Post && 'mitigacion' in res0Post)
  check('Post-persist: fuera mantiene 9 items', planPost.proposito?.fuera?.length === 9)
  check('Post-persist: resistencias mantiene 6 items', planPost.situacion?.resistencias?.length === 6)

  console.log()
  console.log('─── Respuesta del modelo ───')
  console.log(textoLimpio)

  fs.writeFileSync(
    path.join(ROOT, 'output', '27-smoke-test-final.json'),
    JSON.stringify({
      ran_at: new Date().toISOString(),
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      retry_disparado: retryDisparado,
      texto_modelo: textoLimpio,
      panel_update_recibido: panelUpdate,
    }, null, 2)
  )

  summary()
}

function summary() {
  console.log()
  console.log('═'.repeat(72))
  console.log(`RESULTADO: ${pass} passed, ${fail} failed`)
  console.log('═'.repeat(72))
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
