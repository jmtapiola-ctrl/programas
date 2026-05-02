// Insertar MD[73'] (la respuesta regenerada por Opus en el script 12) como
// turno 73 en Turnos_PE, después correr smoke test simulando el endpoint /chat
// con un mensaje neutral "ok, sigamos" y verificar persistencia end-to-end.

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
  // ─── Paso C: insertar MD[73'] regenerado ──────────────────────────────────
  console.log('═'.repeat(72))
  console.log('PASO C — Insertar MD[73\'] regenerado como turno 73 en Turnos_PE')
  console.log('═'.repeat(72))

  const md73Data = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'output', 'md73-regenerated.json'), 'utf8')
  )
  console.log(`Cargado md73-regenerated.json (generado ${md73Data.generated_at})`)
  console.log(`Texto limpio: ${md73Data.texto_limpio.length} chars`)
  console.log(`Tiene PANEL_UPDATE: ${md73Data.panel_update ? 'sí' : 'no'} (no bloqueante — siguiente turno emitirá)`)
  console.log()

  // El endpoint hace: textoLimpio = fullResponse.replace(PANEL_UPDATE_RE, '').trim()
  // Si no hay PANEL_UPDATE, textoLimpio = texto completo trimeado.
  // Para MD[73'] no hubo PANEL_UPDATE, así que el contenido a persistir es el texto completo limpio.
  const turno73: TurnoPE = {
    rol: 'model',
    contenido: md73Data.texto_limpio,  // ya está limpio (sin PANEL_UPDATE)
    timestamp: new Date().toISOString(),
    paso: 2,  // estamos en sub-bloque 2.C (causa raíz)
  }

  const { ids } = await appendTurnosPE(TARGET_ENTREVISTA_ID, [turno73], 73)
  console.log(`✔ MD[73'] insertado: record ${ids[0]}`)

  // Verificar conteo
  let entrevista = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevista) throw new Error('getEntrevistaPE devolvió null')
  console.log(`✔ Conteo total post-paso-C: ${entrevista.historial.length} turnos (esperado 74)`)
  if (entrevista.historial.length !== 74) {
    throw new Error(`Conteo incorrecto: ${entrevista.historial.length} ≠ 74`)
  }

  // ─── PASO 4: SMOKE TEST ───────────────────────────────────────────────────
  console.log()
  console.log('═'.repeat(72))
  console.log('PASO 4 — SMOKE TEST: simular endpoint con "ok, sigamos"')
  console.log('═'.repeat(72))

  const plan = await getPlanEstrategico(TARGET_PLAN_ID)

  // Reproducir EXACTAMENTE lo que hace el endpoint chat:
  //   const messages = historial.map(toMsg)
  //   messages.push({role:'user', content: userContent})
  const userContent = 'ok, sigamos'
  const messages = entrevista.historial.map(t => ({
    role: t.rol === 'model' ? 'assistant' as const : 'user' as const,
    content: t.contenido,
  }))
  messages.push({ role: 'user' as const, content: userContent })
  console.log(`Messages a enviar: ${messages.length} (74 historial + 1 nuevo user)`)

  const systemPrompt = buildSystemPrompt(plan, null)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  console.log('Llamando a claude-opus-4-7...')
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

  const fullText = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  const panelMatch = fullText.match(PANEL_UPDATE_RE)
  const textoLimpio = fullText.replace(PANEL_UPDATE_RE, '').trim()

  console.log()
  console.log('─── RESPUESTA DEL MODELO al "ok, sigamos" ───')
  console.log(textoLimpio)
  console.log()

  if (panelMatch) {
    let panelOk = false
    try {
      const panel = JSON.parse(panelMatch[1].trim())
      panelOk = true
      console.log('─── PANEL_UPDATE emitido ───')
      console.log(`  paso_actual: ${panel.paso_actual}`)
      console.log(`  sub_bloque_actual: ${panel.sub_bloque_actual}`)
      console.log(`  proposito.escena[:80]: "${panel.proposito?.escena?.slice(0, 80)}..."`)
      console.log()
    } catch (e) {
      console.log(`⚠ PANEL_UPDATE malformado: ${e}`)
    }
  } else {
    console.log('(El modelo no emitió PANEL_UPDATE en este turno)')
  }

  // Persistir los 2 nuevos turnos en Turnos_PE simulando saveWithRetry
  const turnoUserSmoke: TurnoPE = {
    rol: 'user',
    contenido: userContent,
    timestamp: new Date().toISOString(),
    paso: 2,
  }
  const turnoModelSmoke: TurnoPE = {
    rol: 'model',
    contenido: textoLimpio,
    timestamp: new Date().toISOString(),
    paso: 2,
  }
  const { ids: smokeIds } = await appendTurnosPE(TARGET_ENTREVISTA_ID, [turnoUserSmoke, turnoModelSmoke], 74)
  console.log(`✔ Smoke turnos persistidos: ${smokeIds.length} records (índices 74, 75)`)

  // Re-cargar y verificar
  entrevista = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevista) throw new Error('post-smoke getEntrevistaPE devolvió null')
  console.log(`✔ Conteo post-smoke: ${entrevista.historial.length} (esperado 76)`)
  if (entrevista.historial.length !== 76) {
    throw new Error(`Smoke test fallido: count ${entrevista.historial.length} ≠ 76`)
  }
  // Verificar que los últimos 2 son los correctos
  const t74 = entrevista.historial[74]
  const t75 = entrevista.historial[75]
  console.log(`  turno[74] rol=${t74.rol}, contenido="${t74.contenido.slice(0, 60)}..."`)
  console.log(`  turno[75] rol=${t75.rol}, contenido="${t75.contenido.slice(0, 60)}..."`)
  if (t74.rol !== 'user' || t74.contenido !== userContent) {
    throw new Error('turno[74] mismatch')
  }
  if (t75.rol !== 'model' || t75.contenido !== textoLimpio) {
    throw new Error('turno[75] mismatch')
  }

  console.log()
  console.log('✔✔✔ SMOKE TEST EXITOSO')
  console.log()

  // Guardar para el reporte final
  fs.writeFileSync(
    path.join(ROOT, 'output', 'smoke-test-result.json'),
    JSON.stringify({
      ran_at: new Date().toISOString(),
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      latency_ms: latency,
      texto_modelo: textoLimpio,
      panel_update: panelMatch?.[1].trim() ?? null,
      total_turnos_post_smoke: entrevista.historial.length,
    }, null, 2)
  )
  console.log('  Guardado: smoke-test-result.json')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
