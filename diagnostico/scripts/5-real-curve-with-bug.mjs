// Recalcula la curva de tokens APLICANDO la dinámica real del bug:
// A partir de cierto punto, Airtable se atascó en 62 turnos. El endpoint sigue
// leyendo "historial = entrevista.historial" (62 turnos), y agrega solo el
// nuevo user input. Resultado: el modelo deja de ver md[62..N-1].

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const envPath = path.resolve(ROOT, '..', '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const MODEL = 'claude-opus-4-7'

const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'turns-md.json'), 'utf8'))
const breakdown = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'system-prompt-breakdown.json'), 'utf8'))
const fullSystemTokens = breakdown._FULL_SYSTEM.tokens

// Reconstruir el system prompt completo (igual que el script anterior)
const knowledgeSrc = fs.readFileSync(path.resolve(ROOT, '..', 'lib', 'knowledge-pe.ts'), 'utf8')
function extractConst(name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\`([\\s\\S]*?)\``)
  return knowledgeSrc.match(re)[1]
}
const HEADER = `Sos un consultor senior especializado en planificación estratégica. Tu trabajo es guiar a un ejecutivo a construir un plan estratégico de calidad mediante una entrevista conversacional.

## Tu rol y tono

- Sos directo, firme y exigente. No elogiás gratuitamente ni te conformás con respuestas vagas
- Cuestionás supuestos. Repreguntás antes de avanzar si la respuesta no cumple los criterios
- Hablás en español rioplatense neutro: "vos", nunca "tú" ni "usted" ni "vosotros"
- No usás emojis ni formatos decorativos. Solo texto plano conversacional
- No sos un encuestador amable — sos alguien que genuinamente quiere que el plan quede bien

## Doctrina: qué es un plan estratégico

`
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
const PANEL_CONTRATO = `
## Contrato de PANEL_UPDATE

Al final de CADA respuesta tuya, sin excepción, emití exactamente este bloque con los datos actualizados:

<!--PANEL_UPDATE-->
{
  "paso_actual": <número: 0, 1 o 2>,
  "sub_bloque_actual": "<string>",
  "proposito": {"escena":"","metricas":[],"fuera":[],"horizonte":"","estabilidad":""},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->

Reglas:
- Campos sin datos van como string vacío "" o array vacío [], NUNCA null
- El bloque va siempre al final
- Para plan Sr: omitir alineacion_sr
`
const fullSystem = [
  HEADER,
  extractConst('K_PE_DEFINICION'),
  '\n\n## Criterios de propósito bien formulado\n\n',
  extractConst('K_PE_PROPOSITO'),
  '\n\n## Criterios de situación bien formulada\n\n',
  extractConst('K_PE_SITUACION'),
  '\n\n## Diferencia entre estrategia y táctica\n\n',
  extractConst('K_PE_ESTRATEGIA_VS_TACTICA'),
  '\n\n## Patrones de falla que tenés que prevenir\n\n',
  extractConst('K_PE_FALLAS'),
  '\n\n## Cuestionario que debés seguir (Pasos 0, 1 y 2)\n\n',
  extractConst('K_PE_CUESTIONARIO'),
  '\n\n## Reglas del wizard\n\n- Los gates de avance entre sub-bloques y pasos los evaluás vos. No avanzás si los criterios no están cumplidos\n- Si el usuario da una respuesta pobre, repreguntás antes de avanzar\n\n',
  ESTADO_ACTUAL_MOCK,
  '\n',
  PANEL_CONTRATO,
].join('')

async function countTokens(messages) {
  const r = await client.messages.countTokens({ model: MODEL, system: fullSystem, messages })
  return r.input_tokens
}

// El bug se activó después de guardar md[0..61]. Para los turnos md[62..73],
// el endpoint lee historial de Airtable = md[0..61] y agrega el nuevo user.
// Entonces el modelo, al generar md[63], md[65], md[67]... ve:
//   md[0..61] + md[user input que generó md[63]]
// Es decir, NO ve los user inputs intermedios ni las respuestas perdidas del modelo.

const SAVED_BOUNDARY = 62 // turnos persistidos en Airtable (índices 0..61)

console.log('='.repeat(70))
console.log('CURVA REAL DEL BUG: ¿qué vio el modelo realmente en cada turno?')
console.log('='.repeat(70))
console.log()
console.log(`Bug se activa después del turno MD[${SAVED_BOUNDARY - 1}] (último guardado).`)
console.log(`A partir de ahí, el modelo siempre ve md[0..${SAVED_BOUNDARY - 1}] + el último user input.`)
console.log()
console.log('Para cada turno DEL MODELO en md[63, 65, 67, 69, 71, 73], comparo:')
console.log('  - INPUT IDEAL: el modelo ve md[0..idx-2] + user[idx-1]')
console.log('  - INPUT REAL CON BUG: el modelo ve md[0..61] + user[idx-1]')
console.log()
console.log('Idx | Rol   | Tokens IDEAL | Tokens REAL (bug) | Delta (perdidos por bug)')
console.log('-'.repeat(82))

const modelTurnsAfterBug = [63, 65, 67, 69, 71, 73]
const realCurve = []

for (const idx of modelTurnsAfterBug) {
  // IDEAL
  const idealMessages = md.slice(0, idx - 1).map(t => ({
    role: t.rol === 'model' ? 'assistant' : 'user',
    content: t.contenido,
  }))
  idealMessages.push({ role: 'user', content: md[idx - 1].contenido })
  const idealTokens = await countTokens(idealMessages)

  // REAL CON BUG
  const realMessages = md.slice(0, SAVED_BOUNDARY).map(t => ({
    role: t.rol === 'model' ? 'assistant' : 'user',
    content: t.contenido,
  }))
  realMessages.push({ role: 'user', content: md[idx - 1].contenido })
  const realTokens = await countTokens(realMessages)

  const delta = idealTokens - realTokens
  realCurve.push({ idx, idealTokens, realTokens, delta })
  console.log(
    `${String(idx).padStart(3)} | ${md[idx].rol.padEnd(5)} | ${String(idealTokens).padStart(12)} | ${String(realTokens).padStart(17)} | ${String(delta).padStart(9)} (${md[idx - 1 - 0].rol === 'user' ? 'user input "' + md[idx - 1].contenido.slice(0, 40).replace(/\n/g, ' ') + '..."' : ''})`
  )
}

fs.writeFileSync(
  path.join(ROOT, 'output', 'real-curve-with-bug.json'),
  JSON.stringify({ realCurve, savedBoundary: SAVED_BOUNDARY }, null, 2)
)

console.log()
console.log('='.repeat(70))
console.log('LECTURA')
console.log('='.repeat(70))
console.log(`
A partir del turno 63 (model), el modelo recibió un payload SIGNIFICATIVAMENTE
MÁS CHICO de lo "ideal", porque el endpoint le pasó los 62 turnos persistidos
en lugar de los 62..N-1 reales. La diferencia es exactamente el contenido de
los turnos perdidos (los del 28-30/4 que no llegaron a Airtable).

Esto explica perfectamente la "degradación cognitiva": el modelo no estaba
saturado por tokens — estaba RESPONDIENDO A UNA CONVERSACIÓN INCOMPLETA. Cada
nuevo input de user respondía a una pregunta que el modelo (con su contexto
truncado) no había hecho.

Confirmación: la última pregunta que el modelo "ve" en su contexto al final
es la del turno 61 ("Necesito tres datos: a) Estado actual..."). Cuando recibe
el último user input "confirmada opcion 1" (md[72]), su respuesta correcta
desde su punto de vista es: "Esa respuesta no corresponde". Y eso es exactamente
lo que dijo (md[73]).
`)
