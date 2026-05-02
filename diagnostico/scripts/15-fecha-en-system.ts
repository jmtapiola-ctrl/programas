// Verificación end-to-end del fix de awareness temporal del wizard PE.
// Tests en orden de coste creciente: format helpers → no-regresión cuestionario
// → system prompt contiene la sección → smoke test contra Anthropic real.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { getTodayArg, getContextoTemporalArg } from '@/lib/types'
import { K_PE_CUESTIONARIO } from '@/lib/knowledge-pe'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✔ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++ }
}

async function main() {
  console.log('═'.repeat(72))
  console.log('TEST 1 — Format de los helpers (sin red)')
  console.log('═'.repeat(72))
  const today = getTodayArg()
  const contexto = getContextoTemporalArg()
  console.log(`  getTodayArg() = "${today}"`)
  console.log(`  getContextoTemporalArg() = "${contexto}"`)
  check('getTodayArg() formato YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today), today)
  check(
    'getContextoTemporalArg() formato esperado',
    /^\p{L}+ \d{1,2} de \p{L}+ de \d{4} \(Q[1-4] \d{4}\)$/u.test(contexto),
    contexto,
  )

  console.log()
  console.log('═'.repeat(72))
  console.log('TEST 2 — No-regresión sobre K_PE_CUESTIONARIO')
  console.log('═'.repeat(72))
  check('K_PE_CUESTIONARIO no menciona "julio 2025"', !K_PE_CUESTIONARIO.includes('julio 2025'))

  console.log()
  console.log('═'.repeat(72))
  console.log('TEST 3 — System prompt contiene la sección de contexto temporal')
  console.log('═'.repeat(72))
  const planMock = {
    nombre: 'Plan Mock',
    tipo: 'Sr',
    area: 'Marca',
    horizonte: 'Fin de 2026',
    proposito: {
      escena: 'Posicionar la marca como referente de hacer dueños',
      metricas: [],
      fuera: [],
      horizonte: 'Fin de 2026',
      estabilidad: 'estable',
    },
    situacion: undefined,
    datos_faltantes: [],
  }
  const sys = buildSystemPrompt(planMock, null)
  check('system prompt incluye "## Contexto temporal"', sys.includes('## Contexto temporal'))
  check('system prompt incluye "Hoy es "', sys.includes('Hoy es '))
  check('system prompt menciona "Argentina"', sys.includes('Argentina'))
  check('system prompt incluye la regla "NO planifiques ... pasados"', sys.includes('NO planifiques actividades en meses ya pasados'))
  console.log(`  system prompt total: ${sys.length} chars`)

  console.log()
  console.log('═'.repeat(72))
  console.log('TEST 4 — Smoke test contra Anthropic real (~$0.50)')
  console.log('═'.repeat(72))
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  ⚠ ANTHROPIC_API_KEY no seteado — saltando test 4')
    summary()
    return
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const userMessage = 'Estamos en sub-bloque 2.A. ¿Cuántos meses tenemos para ejecutar este plan? Decímelo en una línea, citando explícitamente el mes/año desde el que arrancás y el mes/año en que cierra el horizonte.'
  console.log(`User: "${userMessage}"`)
  console.log('Llamando a claude-opus-4-7...')
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 500,
    system: sys,
    messages: [{ role: 'user', content: userMessage }],
  })
  const latency = Date.now() - start
  console.log(`✔ Respuesta recibida en ${(latency / 1000).toFixed(1)}s`)
  console.log(`  usage: input=${resp.usage.input_tokens}, output=${resp.usage.output_tokens}`)

  const fullText = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  // Limpiar PANEL_UPDATE si vino
  const textoLimpio = fullText.replace(/<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/g, '').trim()
  console.log()
  console.log('─── Respuesta del modelo ───')
  console.log(textoLimpio)
  console.log()

  const lower = textoLimpio.toLowerCase()
  // Mes actual en español
  const mesActual = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', month: 'long' })
    .format(new Date()).toLowerCase()
  const mesActualOk = lower.includes(mesActual)
  const mencionaMesPasadoComoArranque = /(empezando|arrancando|arrancamos|partiendo|desde|inicia)\s+(en\s+)?(enero|febrero|marzo|abril)\b/i.test(textoLimpio) && !lower.includes(mesActual)
  // Sin Q1 como punto de partida
  const noMencionaQ1Arranque = !/q1\s+202[6-9]|primer\s+trimestre/i.test(textoLimpio)

  check(`Menciona el mes actual ("${mesActual}") como punto de partida`, mesActualOk)
  check('NO usa Q1 / primer trimestre como punto de partida', noMencionaQ1Arranque)
  check('NO menciona meses anteriores al actual como arranque', !mencionaMesPasadoComoArranque)

  // Persistir output para auditoría
  const outPath = path.join(ROOT, 'output', '15-fecha-en-system.json')
  fs.writeFileSync(outPath, JSON.stringify({
    ran_at: new Date().toISOString(),
    today: getTodayArg(),
    contexto_temporal: getContextoTemporalArg(),
    system_prompt_len: sys.length,
    user_message: userMessage,
    model_response: textoLimpio,
    usage: resp.usage,
    latency_ms: latency,
    checks: {
      mesActualOk,
      noMencionaQ1Arranque,
      noMesPasadoArranque: !mencionaMesPasadoComoArranque,
    },
  }, null, 2))
  console.log(`  Guardado: ${outPath}`)

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
