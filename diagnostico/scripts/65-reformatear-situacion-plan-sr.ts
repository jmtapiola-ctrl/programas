// Reformatear los campos largos de plan.situacion del Plan Sr con headers
// markdown agrupados por tema (### Categoría) sin inventar info nueva ni
// perder items.
//
// Campos a reformatear (los que sufren el problema de párrafo monolítico):
//   - desvio_cuantificado
//   - causa_raiz
//   - recursos_actuales
//   - recursos_faltantes
//   - intentos_previos
//   - consecuencia_6m
//   - consecuencia_12m
//
// El desvio_principal queda sin tocar (ya es un texto corto compacto y único).
//
// Flow:
//   1. Backup situacion actual → diagnostico/output/situacion-plan-sr-backup-<ts>.json
//   2. 1 llamada a Opus con todos los campos + instrucción estricta.
//   3. Validación: ningún campo cae a 0 chars; cada campo reformateado contiene
//      una proporción mínima de palabras únicas del original (proxy de "no perdí info").
//   4. Persistir en Airtable.
//   5. Reportar diff cuantitativo.
//
// Si algo sale mal, restaurar con: 66-restore-situacion-plan-sr.ts (apunta al .json del backup).

import {
  getPlanEstrategico,
  updatePlanEstrategico,
} from '@/lib/airtable'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'fs'
import { join } from 'path'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

const OPUS_INPUT_PER_M = 15
const OPUS_OUTPUT_PER_M = 75

const SYSTEM_PROMPT = `Sos un editor de planes estratégicos. Tu única tarea es REORGANIZAR campos de texto largo del plan agrupándolos por tema en markdown con subsecciones (### Categoría), sin alterar el contenido.

REGLAS DURAS — son INNEGOCIABLES:

1. **No inventes información que no esté en el original.** Si el original dice "Randy (CEO)", el reformateado dice "Randy (CEO)" — no le agregues "(45 años)" ni "(experiencia en X)" ni nada.

2. **No pierdas ningún item del original.** Cada elemento que aparezca en el texto crudo (cada persona, cada recurso, cada métrica, cada cláusula, cada paréntesis explicativo) DEBE aparecer en el reformateado. Si tenés duda, copiá el texto literal del original.

3. **Agrupá por tema con \`### Subsección\` (heading-3).** Detectá los temas que emergen del contenido (ej. "Gente", "Marcas", "Capital financiero", "Operaciones en marcha", "PR y marketing", "Tierras y proyecto", "Estructura legal", "Gobernanza") y agrupá los items afines bajo cada subsección. NO uses categorías genéricas si el contenido sugiere algo más específico — adaptá al material real.

4. **Dentro de cada subsección, listas con \`-\`** cuando son varios items independientes. Texto narrativo continuo cuando es un solo concepto compuesto.

5. **\`**negrita**\` para nombres propios** (personas, empresas, marcas, puestos) y conceptos clave. \`*itálica*\` para énfasis suave (opcional).

6. **Preservá datos numéricos EXACTOS**: cifras, porcentajes, fechas, montos, métricas, ratios. Si el original dice "US$10M caja + US$30M tierras + US$500M nominal / US$250M VNA", el reformateado debe tener esos mismos números literales.

7. **No combines ni resumas items.** Si el original lista "5 personas desarrollando agentes para puestos del organigrama; equipo creciendo + JMT armando equipo paralelo de apps organizativas", el reformateado mantiene ambos sub-items (los 5 + el paralelo), no los fusiona en "equipo de AI creciendo".

8. **Output: JSON puro, sin texto antes ni después.** Cada campo del input se reformatea separadamente. Devolvé el mismo shape:

\`\`\`json
{
  "desvio_cuantificado": "<reformateado>",
  "causa_raiz": "<reformateado>",
  "recursos_actuales": "<reformateado>",
  "recursos_faltantes": "<reformateado>",
  "intentos_previos": "<reformateado>",
  "consecuencia_6m": "<reformateado>",
  "consecuencia_12m": "<reformateado>"
}
\`\`\`

EJEMPLO de transformación (recursos_actuales abreviado para ilustrar):

Input: "Gente: Randy (CEO), Charly (CFO), Nico (Director Comercial). Capital financiero: US$10M caja + US$30M tierras vendibles. Tres mecanismos de financiación orgánica probados: (1) tierras con financiación del propietario; (2) preventa con financiación a 30 años; (3) proveedores que financian 50% del material."

Output:
\`\`\`
### Gente

- **Randy** (CEO)
- **Charly** (CFO)
- **Nico** (Director Comercial)

### Capital financiero

- US$10M caja
- US$30M tierras vendibles

### Mecanismos de financiación orgánica probados

1. Tierras con financiación del propietario.
2. Preventa con financiación a 30 años.
3. Proveedores que financian 50% del material.
\`\`\`

Recordá: SOLO el JSON con los campos reformateados. Cero texto envolvente.`

function buildUserMessage(situacion: any): string {
  return `Reformateá los siguientes campos. Cada uno es un texto largo monolítico que necesita organización por temas con \`### Subsección\`.

\`\`\`json
${JSON.stringify({
  desvio_cuantificado: situacion.desvio_cuantificado ?? '',
  causa_raiz: situacion.causa_raiz ?? '',
  recursos_actuales: situacion.recursos_actuales ?? '',
  recursos_faltantes: situacion.recursos_faltantes ?? '',
  intentos_previos: situacion.intentos_previos ?? '',
  consecuencia_6m: situacion.consecuencia_6m ?? '',
  consecuencia_12m: situacion.consecuencia_12m ?? '',
}, null, 2)}
\`\`\`

Devolvé el JSON reformateado siguiendo el sistema (cero texto antes/después).`
}

// Extrae palabras únicas de un texto (>4 chars, lowercase, sin puntuación común)
// para usar como check defensivo de "no perdí info".
function palabrasUnicas(texto: string): Set<string> {
  const limpio = texto.toLowerCase().replace(/[.,;:()\[\]{}'"!?¿¡—–-]/g, ' ')
  const palabras = limpio.split(/\s+/).filter(p => p.length > 4)
  return new Set(palabras)
}

async function main() {
  if ((PLAN_SR_ID as string) === (PLAN_DUMMY_ID as string)) {
    throw new Error('Sanity check: PLAN_SR_ID === PLAN_DUMMY_ID')
  }
  console.log(`[reformat] Target: Plan Sr ${PLAN_SR_ID}`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const plan = await getPlanEstrategico(PLAN_SR_ID)
  const sit = plan.situacion
  if (!sit) throw new Error('plan.situacion vacío')

  // ── Backup ──
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(process.cwd(), 'diagnostico/output', `situacion-plan-sr-backup-${timestamp}.json`)
  writeFileSync(backupPath, JSON.stringify(sit, null, 2), 'utf-8')
  console.log(`[reformat] Backup: ${backupPath}`)

  // ── Snapshot de palabras únicas del original para check post-reformat ──
  const camposReformat: Array<keyof typeof sit> = [
    'desvio_cuantificado', 'causa_raiz', 'recursos_actuales',
    'recursos_faltantes', 'intentos_previos', 'consecuencia_6m', 'consecuencia_12m',
  ]
  const palabrasOriginales: Record<string, Set<string>> = {}
  for (const k of camposReformat) {
    palabrasOriginales[k] = palabrasUnicas((sit[k] as string) ?? '')
  }

  // ── Opus call ──
  console.log(`\n[reformat] Llamando a Opus para reformateo...`)
  const start = Date.now()
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 24000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(sit) }],
  })
  const finalMsg = await stream.finalMessage()
  const latenciaMs = Date.now() - start
  const inputTokens = finalMsg.usage.input_tokens
  const outputTokens = finalMsg.usage.output_tokens
  const costoUsd = (inputTokens * OPUS_INPUT_PER_M + outputTokens * OPUS_OUTPUT_PER_M) / 1_000_000
  console.log(`[reformat] Opus OK en ${(latenciaMs / 1000).toFixed(1)}s · costo=$${costoUsd.toFixed(3)} · stop=${finalMsg.stop_reason}`)

  const text = finalMsg.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map(c => c.text).join('\n')
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) { try { parsed = JSON.parse(m[0]) } catch { /* fall-through */ } }
  }
  if (!parsed) {
    console.error('[reformat] Output no parseable. Primeros 500 chars:')
    console.error(text.slice(0, 500))
    process.exit(1)
  }

  // ── Validaciones defensivas ──
  console.log(`\n[reformat] Validaciones defensivas:`)
  let blockingIssues = 0
  for (const k of camposReformat) {
    const original = (sit[k] as string) ?? ''
    const nuevo = parsed[k] ?? ''
    if (!nuevo || nuevo.length === 0) {
      console.log(`  ❌ [${k}] campo nuevo vacío (original tenía ${original.length} chars). BLOQUEA persistencia.`)
      blockingIssues++
      continue
    }
    const palOrig = palabrasOriginales[k]
    const palNuevo = palabrasUnicas(nuevo)
    const palComunes = [...palOrig].filter(p => palNuevo.has(p)).length
    const cobertura = palOrig.size > 0 ? (palComunes / palOrig.size) : 1
    const ratioLen = nuevo.length / Math.max(original.length, 1)
    const status = cobertura >= 0.85 ? '✓' : cobertura >= 0.70 ? '⚠' : '❌'
    console.log(`  ${status} [${k}] orig=${original.length}ch · nuevo=${nuevo.length}ch (${(ratioLen * 100).toFixed(0)}%) · cobertura palabras=${(cobertura * 100).toFixed(0)}%`)
    if (cobertura < 0.70) blockingIssues++
  }

  if (blockingIssues > 0) {
    console.log(`\n[reformat] ❌ ${blockingIssues} issue(s) bloqueante(s). NO se persiste. Revisar output:`)
    for (const k of camposReformat) {
      console.log(`\n── [${k}] preview ──`)
      console.log((parsed[k] ?? '').slice(0, 300))
    }
    process.exit(1)
  }

  // ── Persistir ──
  const situacionReformateada = {
    ...sit,
    desvio_cuantificado: parsed.desvio_cuantificado,
    causa_raiz: parsed.causa_raiz,
    recursos_actuales: parsed.recursos_actuales,
    recursos_faltantes: parsed.recursos_faltantes,
    intentos_previos: parsed.intentos_previos,
    consecuencia_6m: parsed.consecuencia_6m,
    consecuencia_12m: parsed.consecuencia_12m,
  }
  await updatePlanEstrategico(PLAN_SR_ID, { situacion: situacionReformateada })
  console.log(`\n[reformat] ✓ Persistido en Airtable.`)

  // ── Reporte interpretado ──
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`✓ REFORMATEO COMPLETO`)
  console.log(`${'═'.repeat(72)}`)
  console.log(`Métricas:`)
  console.log(`  Latencia: ${(latenciaMs / 1000).toFixed(1)}s`)
  console.log(`  Costo:    $${costoUsd.toFixed(3)} USD`)
  console.log(`  Backup:   ${backupPath}`)
  console.log(`\nPreviews de los reformateados (primeros 400 chars):`)
  for (const k of camposReformat) {
    console.log(`\n── ${k} ──`)
    console.log((parsed[k] ?? '').slice(0, 400) + ((parsed[k] ?? '').length > 400 ? '...' : ''))
  }
  console.log(`\n${'═'.repeat(72)}`)
  console.log(`Si querés rollback, restaurá desde el backup:`)
  console.log(`  npx tsx --env-file=.env.local diagnostico/scripts/66-restore-situacion-plan-sr.ts "${backupPath}"`)
  console.log(`${'═'.repeat(72)}`)
}

main().catch(e => { console.error('[reformat] FATAL:', e); process.exit(1) })
