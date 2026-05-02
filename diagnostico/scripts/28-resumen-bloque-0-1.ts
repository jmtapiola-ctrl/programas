// One-shot a Opus 4.7 para generar el resumen estructurado del Bloque 0-1
// del Plan Sr de Terravinci. Reproduce el setup que tendría el feature real
// de "cierre exhaustivo" cuando se implemente.
//
// System prompt: el del wizard actual (buildSystemPrompt) + instrucciones
// especiales de cierre.
// User message: la conversación completa del Bloque 0-1.
//
// Output: archivo .md con el resumen + métricas (tokens, latencia, costo).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { getPlanEstrategico } from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'

const INSTRUCCIONES_CIERRE = `
═════════════════════════════════════════════════════════════════
INSTRUCCIONES ESPECIALES DE CIERRE DE BLOQUE
═════════════════════════════════════════════════════════════════

Estás siendo invocado para generar el RESUMEN ESTRUCTURADO del cierre formal del Bloque 0-1 (Encuadre + Propósito) de un Plan Estratégico ya completado.

INSTRUCCIONES CRÍTICAS DE COMPLETITUD:

1. Releé COMPLETA la conversación que te paso, no solo el último PANEL_UPDATE persistido. La conversación es la fuente de verdad, el PANEL_UPDATE puede tener omisiones acumuladas.

2. Para cada categoría del resumen, listá TODOS los items que se discutieron en la conversación, no solo los que aparecen en el último PANEL_UPDATE.

3. Si un item se discutió y se acordó pero después se "olvidó" en cierres intermedios, RECUPERALO.

4. Si una decisión se modificó durante la conversación, usá la versión FINAL (la última acordada).

5. NO inventes contenido. Solo incluí lo que el usuario declaró explícitamente o lo que se acordó en el ida-y-vuelta.

6. Si el usuario hizo un pedido específico (ej: "no saques X", "cambiá Y por Z"), VERIFICÁ que el resumen lo respete.

ESTRUCTURA DEL RESUMEN del Bloque 0-1:

## Encuadre
- Tipo de plan (Sr o Jr)
- Quién lo hace (rol del ejecutivo + organización)
- Para qué área/grupo
- Descripción breve del alcance

## Propósito

### Lugar de llegada (escena ideal)
[Texto narrativo de la escena ideal final acordada]

### Métricas (N)
Listar todas con esta estructura para cada una:
- Nombre / título corto
- Valor objetivo (target)
- Valor actual / baseline (si se mencionó en la conversación; si no, indicar "No medido" o "Sin baseline")

### Fuera de scope (N)
Listar todos los items con:
- Item declarado fuera
- Razón / justificación

### Horizonte
[Período de validez del plan]

### Estabilidad
[Bajo qué condiciones el propósito se mantiene; bajo cuáles se replantea]

═════════════════════════════════════════════════════════════════

Tu OUTPUT debe ser exclusivamente este resumen estructurado en markdown limpio. Sin notas meta sobre tu proceso, sin disclaimers, solo el contenido del resumen.
`

async function main() {
  console.log('═'.repeat(72))
  console.log('Resumen Bloque 0-1 — one-shot Opus 4.7')
  console.log('═'.repeat(72))

  // 1. Cargar y normalizar conversación (mojibake fix)
  const rawPath = path.join(ROOT, 'raw-bloque-0-1.md')
  const rawBuf = fs.readFileSync(rawPath)
  const rawStr = rawBuf.toString('utf8')
  // Si el archivo tiene mojibake (UTF-8 doble-codificado), des-doblar.
  // Heurística: si contiene "Ã" o "Â¿", aplicamos el fix.
  let conversacion = rawStr
  if (rawStr.includes('Ã') || rawStr.includes('Â¿')) {
    conversacion = Buffer.from(rawStr, 'latin1').toString('utf8')
    console.log('  ✓ Encoding mojibake detectado y corregido')
  }
  console.log(`  Conversación: ${conversacion.length.toLocaleString()} chars`)

  // 2. Construir el system prompt: el del wizard + instrucciones de cierre
  const plan = await getPlanEstrategico(TARGET_PLAN_ID)
  const systemPromptBase = buildSystemPrompt(plan, null)
  const systemPrompt = systemPromptBase + '\n\n' + INSTRUCCIONES_CIERRE
  console.log(`  System prompt base (wizard): ${systemPromptBase.length.toLocaleString()} chars`)
  console.log(`  System prompt total (con cierre): ${systemPrompt.length.toLocaleString()} chars`)

  // 3. Construir user message
  const userMessage = `Esta es la conversación completa del Bloque 0-1 que tenés que cerrar. Generá el resumen estructurado siguiendo las instrucciones del system prompt.

═════════════════════════════════════════════════════════════
CONVERSACIÓN COMPLETA DEL BLOQUE 0-1
═════════════════════════════════════════════════════════════

${conversacion}`

  console.log(`  User message: ${userMessage.length.toLocaleString()} chars`)
  console.log()

  // 4. Llamada Opus 4.7
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // NOTA: temperature está deprecated en claude-opus-4-7. El spec pedía 0.2
  // pero la API lo rechaza. Corremos con el default del modelo.
  console.log('Llamando a claude-opus-4-7 (max_tokens=4000, sin temperature)...')
  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  const latency = Date.now() - start
  const inputTokens = resp.usage.input_tokens
  const outputTokens = resp.usage.output_tokens
  // Pricing claude-opus-4-7: $15/M input, $75/M output (estimado)
  const costoUsd = (inputTokens * 15 + outputTokens * 75) / 1_000_000
  console.log(`✔ Respuesta en ${(latency / 1000).toFixed(1)}s`)
  console.log(`  input_tokens:  ${inputTokens.toLocaleString()}`)
  console.log(`  output_tokens: ${outputTokens.toLocaleString()}`)
  console.log(`  costo aprox:   $${costoUsd.toFixed(3)} USD`)
  console.log(`  stop_reason:   ${resp.stop_reason}`)

  const textoCompleto = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  // El system prompt del wizard tiene la regla del PANEL_UPDATE.
  // Limpiamos: primero los bloques bien cerrados, después un fallback que
  // strippea cualquier PANEL_UPDATE truncado (sin cierre — pasa cuando max_tokens
  // se consume durante la emisión del bloque).
  const PANEL_RE_COMPLETE = /<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/g
  const PANEL_RE_TRUNCATED = /\n*<!--PANEL_UPDATE-->[\s\S]*$/
  const tienePanel = textoCompleto.includes('<!--PANEL_UPDATE-->')
  const resumenLimpio = textoCompleto
    .replace(PANEL_RE_COMPLETE, '')
    .replace(PANEL_RE_TRUNCATED, '')
    .trim()
  if (tienePanel) {
    console.log('  ⚠ El modelo emitió PANEL_UPDATE pese a las instrucciones de cierre — lo limpio del output.')
  }

  // 5. Guardar a disco
  const outDir = path.join(ROOT, 'output')
  const mdPath = path.join(outDir, '28-resumen-bloque-0-1.md')
  const metaPath = path.join(outDir, '28-resumen-bloque-0-1.json')

  fs.writeFileSync(mdPath, resumenLimpio)
  fs.writeFileSync(metaPath, JSON.stringify({
    ran_at: new Date().toISOString(),
    model: 'claude-opus-4-7',
    temperature: 'default (deprecated en este modelo)',
    max_tokens: 4000,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costoUsd,
    latency_ms: latency,
    stop_reason: resp.stop_reason,
    system_prompt_len_chars: systemPrompt.length,
    user_message_len_chars: userMessage.length,
    resumen_chars: resumenLimpio.length,
    tenia_panel_update: tienePanel,
  }, null, 2))

  console.log()
  console.log(`✔ Guardados:`)
  console.log(`    Resumen:  ${mdPath}`)
  console.log(`    Métricas: ${metaPath}`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
