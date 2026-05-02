// Token curve completo:
//   1. Desglose del system prompt por fragmento (countTokens individual).
//   2. Para cada turno, reconstruye messages cumulativo y mide input tokens.
//   3. Estima panel_update size (tokens por respuesta del modelo no contabilizados en input).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// .env.local loader
const envPath = path.resolve(ROOT, '..', '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-4-7'

// Cargar fragmentos de knowledge-pe.ts dinámicamente
const knowledgeSrc = fs.readFileSync(
  path.resolve(ROOT, '..', 'lib', 'knowledge-pe.ts'),
  'utf8'
)

function extractConst(name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\`([\\s\\S]*?)\``)
  const m = knowledgeSrc.match(re)
  if (!m) throw new Error(`No encontrado: ${name}`)
  return m[1]
}

const K_PE_DEFINICION = extractConst('K_PE_DEFINICION')
const K_PE_PROPOSITO = extractConst('K_PE_PROPOSITO')
const K_PE_SITUACION = extractConst('K_PE_SITUACION')
const K_PE_ESTRATEGIA_VS_TACTICA = extractConst('K_PE_ESTRATEGIA_VS_TACTICA')
const K_PE_FALLAS = extractConst('K_PE_FALLAS')
const K_PE_CUESTIONARIO = extractConst('K_PE_CUESTIONARIO')

// Reproduce buildSystemPrompt de chat/route.ts
// Para el plan target: es Sr (no Jr), entonces planSr = null, planSrResumen = ''
// Estado actual evoluciona — empezamos con plan vacío y el panel se va llenando.
// Para simplicidad: mido system con estado vacío + estado al final, y promedio.

const HEADER = `Sos un consultor senior especializado en planificación estratégica. Tu trabajo es guiar a un ejecutivo a construir un plan estratégico de calidad mediante una entrevista conversacional.

## Tu rol y tono

- Sos directo, firme y exigente. No elogiás gratuitamente ni te conformás con respuestas vagas
- Cuestionás supuestos. Repreguntás antes de avanzar si la respuesta no cumple los criterios
- Hablás en español rioplatense neutro: "vos", nunca "tú" ni "usted" ni "vosotros"
- No usás emojis ni formatos decorativos. Solo texto plano conversacional
- No sos un encuestador amable — sos alguien que genuinamente quiere que el plan quede bien

## Doctrina: qué es un plan estratégico

`

const SECTION_HEADERS = {
  proposito: '\n\n## Criterios de propósito bien formulado\n\n',
  situacion: '\n\n## Criterios de situación bien formulada\n\n',
  estrategia: '\n\n## Diferencia entre estrategia y táctica\n\n',
  fallas: '\n\n## Patrones de falla que tenés que prevenir\n\n',
  cuestionario: '\n\n## Cuestionario que debés seguir (Pasos 0, 1 y 2)\n\n',
  reglas: `

## Reglas del wizard

- Los gates de avance entre sub-bloques y pasos los evaluás vos. No avanzás si los criterios no están cumplidos
- Si el usuario da una respuesta pobre, repreguntás antes de avanzar
- Los ejemplos en el cuestionario son material de referencia para desatascar al usuario. No los mostrás siempre — solo cuando el usuario se traba o responde genérico
- Las preguntas del cuestionario son la guía de qué averiguar. Las reformulás naturalmente según el contexto

`,
}

const PANEL_CONTRATO = `
## Contrato de PANEL_UPDATE

Al final de CADA respuesta tuya, sin excepción, emití exactamente este bloque con los datos actualizados:

<!--PANEL_UPDATE-->
{
  "paso_actual": <número: 0, 1 o 2>,
  "sub_bloque_actual": "<string: '0', '1.A', '1.B', '1.C', '1.D', '1.E', '2.A', '2.B', '2.C', '2.D', '2.E', '2.F', '2.G'>",
  "proposito": {
    "escena": "<string, vacío si aún no se declaró>",
    "metricas": [],
    "fuera": [],
    "horizonte": "<string>",
    "estabilidad": "<string>",
    "alineacion_sr": "<'Verde'|'Amarillo'|'Rojo', solo si el plan es Jr>"
  },
  "situacion": {
    "desvio_principal": "<string>",
    "desvio_cuantificado": "<string>",
    "desvios_secundarios": [],
    "causa_raiz": "<string>",
    "consecuencia_6m": "<string>",
    "consecuencia_12m": "<string>",
    "recursos_actuales": "<string>",
    "recursos_faltantes": "<string>",
    "intentos_previos": "<string>",
    "resistencias": []
  },
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->

Reglas:
- Campos sin datos van como string vacío "" o array vacío [], NUNCA null
- El bloque va siempre al final, después de tu respuesta conversacional
- Para plan Sr: omitir el campo "alineacion_sr" del objeto proposito
- Actualizá los campos con todo lo que el usuario ya declaró en la conversación, no solo el turno actual
`

// Estado actual mock — varía a lo largo de la entrevista. Uso el "estado final" del plan
// (lo que el panel mostraba al final) como upper bound. En la realidad fue creciendo.
// Para simplificar: mido system con estadoActual aprox. ~1k chars (típico mid-late entrevista).
const ESTADO_ACTUAL_MOCK = `
## Estado actual del plan en construcción

Área: Grupo Terravinci
Tipo: Plan Sr

### Propósito construido hasta ahora
Escena ideal: Transformar a Terravinci en la organización líder e indiscutida de hacer dueños en Argentina. Capaz de generar más de 1.000 dueños por mes de manera sostenida hacia fin de 2026 (con un acumulado anual del orden de 6.000), con la confianza del público como activo central, en una posición segura frente a la potencial reactivación del crédito tradicional...
Métricas: [{"metrica":"Volumen","valor_objetivo":"1.000+ dueños/mes","valor_actual":"100/mes"},...]
Fuera de scope: [{"item":"clase media-alta y high-end","razon":"foco estricto en clase media"},...]
Horizonte: 2026
Estabilidad: estable

### Situación construida hasta ahora
Desvío principal: Cobertura geográfica multi-macrozona insuficiente
Causa raíz: (no completada aún)
`

function buildSystemPrompt({ withState = true } = {}) {
  return [
    HEADER,
    K_PE_DEFINICION,
    SECTION_HEADERS.proposito,
    K_PE_PROPOSITO,
    SECTION_HEADERS.situacion,
    K_PE_SITUACION,
    SECTION_HEADERS.estrategia,
    K_PE_ESTRATEGIA_VS_TACTICA,
    SECTION_HEADERS.fallas,
    K_PE_FALLAS,
    SECTION_HEADERS.cuestionario,
    K_PE_CUESTIONARIO,
    SECTION_HEADERS.reglas,
    withState ? ESTADO_ACTUAL_MOCK : '',
    '\n', // planSrResumen vacío para Plan Sr
    PANEL_CONTRATO,
  ].join('')
}

async function countTokens({ system, messages }) {
  const r = await client.messages.countTokens({ model: MODEL, system, messages })
  return r.input_tokens
}

// ============================================================================
// 1. Desglose del system prompt
// ============================================================================
console.log('='.repeat(70))
console.log('1. DESGLOSE DEL SYSTEM PROMPT')
console.log('='.repeat(70))

const fragments = {
  HEADER,
  K_PE_DEFINICION,
  K_PE_PROPOSITO,
  K_PE_SITUACION,
  K_PE_ESTRATEGIA_VS_TACTICA,
  K_PE_FALLAS,
  K_PE_CUESTIONARIO,
  REGLAS_WIZARD: SECTION_HEADERS.reglas,
  ESTADO_ACTUAL: ESTADO_ACTUAL_MOCK,
  PANEL_CONTRATO,
}

const breakdown = {}
for (const [name, content] of Object.entries(fragments)) {
  // Para countTokens, system requiere un mensaje user. Uso un user mensaje mínimo.
  const tokens = await countTokens({
    system: content,
    messages: [{ role: 'user', content: '.' }],
  })
  breakdown[name] = { chars: content.length, tokens }
  console.log(`  ${name.padEnd(28)} chars=${String(content.length).padStart(6)}  tokens=${String(tokens).padStart(5)}`)
}

const fullSystem = buildSystemPrompt()
const fullSystemTokens = await countTokens({
  system: fullSystem,
  messages: [{ role: 'user', content: '.' }],
})
console.log()
console.log(`  TOTAL system (con estado actual mock): chars=${fullSystem.length}, tokens=${fullSystemTokens}`)
breakdown._FULL_SYSTEM = { chars: fullSystem.length, tokens: fullSystemTokens }

fs.writeFileSync(
  path.join(ROOT, 'output', 'system-prompt-breakdown.json'),
  JSON.stringify(breakdown, null, 2)
)

// ============================================================================
// 2. Curva turno a turno
// ============================================================================
console.log()
console.log('='.repeat(70))
console.log('2. CURVA TURNO A TURNO (countTokens cumulativo)')
console.log('='.repeat(70))

const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'turns-md.json'), 'utf8'))

// Reconstruir messages para cada turno user.
// El endpoint hace: const messages = historial.map(toMsg); messages.push({role:'user', content: userContent})
// Entonces para el turno N (user), el payload incluye historial[0..N-1] + el contenido user[N] como último msg.
// Para el turno N (model), el payload se mide al "input" enviado en la llamada que generó ese turno.

const curva = []
let lastInputTokens = null

// Sample sparse to save countTokens calls. We measure every 5 turns + key landmarks.
// User-mentioned landmarks: 64 (last coherent), 66 (first symptom), 74 (severe degradation).
// In 0-index: 63, 65, 73.
const sampleIndexes = new Set()
for (let i = 0; i < md.length; i += 4) sampleIndexes.add(i)
sampleIndexes.add(0)
sampleIndexes.add(md.length - 1)
// Specific landmarks
;[60, 61, 62, 63, 64, 65, 66, 71, 72, 73].forEach(i => sampleIndexes.add(i))

const sortedSamples = [...sampleIndexes].sort((a, b) => a - b)

console.log(`Voy a medir ${sortedSamples.length} turnos (sample). Esto toma ~${sortedSamples.length}s.`)
console.log()
console.log('Idx | Rol   | Chars contenido | Char acumulado | Input tokens (system+history+current)')
console.log('-'.repeat(90))

for (const idx of sortedSamples) {
  const turn = md[idx]
  // El "input" para este turno: si es user, el endpoint envía historial[0..idx-1] + msg user[idx].
  // Si es model, el modelo lo generó después de recibir historial[0..idx-1] + msg user[idx-1] + (no se cuenta su propio mensaje).
  // Para simplificar: medimos el input que llevó AL modelo a generar ese turno (si es model).
  // Si el turno es user, medimos qué hubiera mandado el endpoint al recibir ese user input.

  // Build messages array that the endpoint would have sent:
  // historial = md[0..idx-1]
  // messages.push({role: 'user', content: <next user input>})
  // The "next user input" is md[idx] only if idx is even (user). If idx is odd (model), then
  // the input that generated this model response is the same as the input for md[idx-1] minus the model itself.
  // Cleaner: measure for each turn what the input WAS that produced/preceded it.

  let messages
  if (turn.rol === 'user') {
    // Mido el payload que el endpoint envía cuando el user manda ESTE input.
    // historial = md[0..idx-1] (todos los anteriores)
    // current = md[idx]
    messages = md.slice(0, idx).map(t => ({
      role: t.rol === 'model' ? 'assistant' : 'user',
      content: t.contenido,
    }))
    messages.push({ role: 'user', content: turn.contenido })
  } else {
    // turn.rol === 'model': el input que generó este turno es historial[0..idx-2] + user[idx-1].
    messages = md.slice(0, idx - 1).map(t => ({
      role: t.rol === 'model' ? 'assistant' : 'user',
      content: t.contenido,
    }))
    messages.push({ role: 'user', content: md[idx - 1].contenido })
  }

  const inputTokens = await countTokens({ system: fullSystem, messages })
  const acumChars = md.slice(0, idx + 1).reduce((a, t) => a + t.longitud_chars, 0)
  curva.push({
    idx,
    rol: turn.rol,
    chars_contenido: turn.longitud_chars,
    chars_acumulado: acumChars,
    input_tokens: inputTokens,
    delta_tokens: lastInputTokens != null ? inputTokens - lastInputTokens : null,
  })
  lastInputTokens = inputTokens
  console.log(
    `${String(idx).padStart(3)} | ${turn.rol.padEnd(5)} | ${String(turn.longitud_chars).padStart(15)} | ${String(acumChars).padStart(14)} | ${String(inputTokens).padStart(7)}`
  )
}

fs.writeFileSync(
  path.join(ROOT, 'output', 'token-curve.json'),
  JSON.stringify({ curva, system_prompt_tokens: fullSystemTokens }, null, 2)
)

console.log()
console.log('✔ Guardado: token-curve.json')
