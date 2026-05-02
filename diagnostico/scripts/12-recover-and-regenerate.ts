// Recuperación de los 12 turnos perdidos del 28-30/4.
//
// Paso A: insertar MD[62..72] (11 turnos del MD del usuario) en Turnos_PE.
// Paso B: regenerar MD[73'] llamando a claude-opus-4-7 con el contexto completo
//         (los 73 turnos = 62 migrados + 11 recuperados, último = user "confirmada opcion 1").
// Paso C: NO insertar MD[73']. Solo guardarlo a archivo para verificación humana.
//         Después del read manual, ejecutar 13-insert-md73.ts para insertar.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { appendTurnosPE, getEntrevistaPE, getPlanEstrategico } from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'
import type { TurnoPE } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'
const TARGET_ENTREVISTA_ID = 'recDkuVIOeqsMMhJj'
const PANEL_UPDATE_RE = /<!--PANEL_UPDATE-->([\s\S]*?)<!--\/PANEL_UPDATE-->/

async function main() {
  const md = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'output', 'turns-md.json'), 'utf8')
  )

  // ─── Paso A: insertar MD[62..72] ──────────────────────────────────────────
  console.log('═'.repeat(72))
  console.log('PASO A — Insertar MD[62..72] (11 turnos perdidos del 28-30/4)')
  console.log('═'.repeat(72))

  const turnosPerdidos: TurnoPE[] = md.slice(62, 73).map((t: any) => ({
    rol: t.rol as 'user' | 'model',
    contenido: t.contenido,
    timestamp: '2026-04-29T12:00:00.000Z', // timestamp aproximado entre 28/4 y 30/4
    paso: 2, // todos están en paso 2 (cuantificando desvíos)
  }))
  console.log(`Turnos a insertar: ${turnosPerdidos.length}`)

  const CHUNK = 10
  for (let i = 0; i < turnosPerdidos.length; i += CHUNK) {
    const chunk = turnosPerdidos.slice(i, i + CHUNK)
    const indiceInicial = 62 + i
    process.stdout.write(`  Insertando MD[${indiceInicial}..${indiceInicial + chunk.length - 1}]... `)
    const { ids } = await appendTurnosPE(TARGET_ENTREVISTA_ID, chunk, indiceInicial)
    console.log(`✔ ${ids.length} records creados`)
  }

  // Verificar conteo
  const entrevista = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevista) throw new Error('getEntrevistaPE devolvió null')
  console.log(`✔ Conteo total post-paso-A: ${entrevista.historial.length} turnos (esperado 73)`)
  if (entrevista.historial.length !== 73) {
    throw new Error(`Conteo incorrecto: ${entrevista.historial.length} ≠ 73`)
  }

  // ─── Paso B: regenerar MD[73'] ────────────────────────────────────────────
  console.log()
  console.log('═'.repeat(72))
  console.log('PASO B — Regenerar MD[73\'] con contexto completo')
  console.log('═'.repeat(72))

  const plan = await getPlanEstrategico(TARGET_PLAN_ID)
  console.log(`Plan: ${plan.nombre} (tipo ${plan.tipo})`)
  console.log(`Plan.area: "${plan.area}"`)
  console.log(`Plan.proposito.escena[:100]: "${plan.proposito?.escena?.slice(0, 100) ?? '(vacío)'}..."`)
  console.log()

  // El historial tiene 73 turnos, el último es md[72] = user "confirmada opcion 1".
  // Le pedimos al modelo que genere la respuesta a ese último user.
  const messages = entrevista.historial.map(t => ({
    role: t.rol === 'model' ? 'assistant' as const : 'user' as const,
    content: t.contenido,
  }))
  const lastTurno = entrevista.historial[entrevista.historial.length - 1]
  console.log(`Último turno (será el input al que el modelo responde):`)
  console.log(`  rol=${lastTurno.rol}: "${lastTurno.contenido.slice(0, 80)}..."`)
  console.log()

  if (lastTurno.rol !== 'user') {
    throw new Error('El último turno no es user — algo está mal con el orden')
  }

  const systemPrompt = buildSystemPrompt(plan, null)
  console.log(`System prompt: ${systemPrompt.length.toLocaleString()} chars`)
  console.log(`Messages: ${messages.length} (último=user, va a generar assistant)`)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  console.log()
  console.log('Llamando a claude-opus-4-7 (max_tokens=4000)...')
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    system: systemPrompt,
    messages,
  })
  const latency = Date.now() - start
  console.log(`✔ Respuesta recibida en ${(latency / 1000).toFixed(1)}s`)
  console.log(`  usage: input=${resp.usage.input_tokens}, output=${resp.usage.output_tokens}`)
  console.log(`  stop_reason: ${resp.stop_reason}`)

  const fullText = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  const panelMatch = fullText.match(PANEL_UPDATE_RE)
  const textoLimpio = fullText.replace(PANEL_UPDATE_RE, '').trim()

  // Heurísticas básicas de coherencia
  const checks: { name: string; ok: boolean; detail?: string }[] = [
    { name: 'Respuesta no vacía', ok: textoLimpio.length > 100, detail: `len=${textoLimpio.length}` },
    { name: 'Tiene bloque PANEL_UPDATE', ok: !!panelMatch },
    { name: 'PANEL_UPDATE parseable como JSON', ok: false },
    { name: 'No dice "no entiendo" / "no corresponde"', ok: !/no entiendo|no corresponde|no encaja|no me cierra/i.test(textoLimpio) },
    { name: 'Menciona desvío #3 o liquidez', ok: /desv[ií]o\s*(#?3|secundario\s*#?3)|liquidez|tierras\s*2027|2028|land\s*bank|cuantific/i.test(textoLimpio) },
    { name: 'Avanza (no repite la pregunta original)', ok: !/¿cuánta plata necesit/i.test(textoLimpio.slice(0, 300)) },
  ]
  if (panelMatch) {
    try {
      JSON.parse(panelMatch[1].trim())
      checks[2].ok = true
    } catch (e) {
      checks[2].detail = String(e).slice(0, 100)
    }
  }

  console.log()
  console.log('─── HEURÍSTICAS DE COHERENCIA ───')
  for (const c of checks) {
    console.log(`  ${c.ok ? '✔' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`)
  }
  const allOk = checks.every(c => c.ok)
  console.log()
  console.log(`Veredicto heurístico: ${allOk ? '✔ TODAS las heurísticas OK' : '✗ HAY heurísticas fallidas'}`)

  console.log()
  console.log('═'.repeat(72))
  console.log('RESPUESTA REGENERADA (texto limpio, sin PANEL_UPDATE)')
  console.log('═'.repeat(72))
  console.log(textoLimpio)
  console.log()

  if (panelMatch) {
    console.log('═'.repeat(72))
    console.log('PANEL_UPDATE emitido')
    console.log('═'.repeat(72))
    console.log(panelMatch[1].trim().slice(0, 1000))
    console.log()
  }

  // Guardar todo para revisión + posterior insert
  const outPath = path.join(ROOT, 'output', 'md73-regenerated.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      generated_at: new Date().toISOString(),
      heuristic_checks: checks,
      heuristics_all_ok: allOk,
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      latency_ms: latency,
      stop_reason: resp.stop_reason,
      panel_update: panelMatch?.[1].trim() ?? null,
      texto_limpio: textoLimpio,
      texto_completo: fullText,
    }, null, 2)
  )
  console.log(`✔ Respuesta guardada en: ${outPath}`)
  console.log()
  console.log('SIGUIENTE PASO:')
  console.log('  Si la respuesta de arriba es coherente, ejecutar:')
  console.log('    npx tsx --env-file=.env.local diagnostico/scripts/13-insert-md73.ts')
  console.log('  Si la respuesta es incoherente, decidir entre:')
  console.log('    (a) re-ejecutar este script para regenerar')
  console.log('    (b) plan B: dropear MD[72] desde Turnos_PE (script aparte)')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
