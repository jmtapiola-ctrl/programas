// Test sintético needle-in-haystack:
// Tomar el historial REAL truncado a niveles que produzcan ~30k, 40k, 50k, 60k
// input tokens. En cada nivel, agregar al final un user input pidiendo un dato
// específico que está en los primeros turnos. Comparar respuestas.

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

// Reconstruir system prompt
const knowledgeSrc = fs.readFileSync(path.resolve(ROOT, '..', 'lib', 'knowledge-pe.ts'), 'utf8')
function extractConst(name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\`([\\s\\S]*?)\``)
  return knowledgeSrc.match(re)[1]
}
const HEADER = `Sos un consultor senior especializado en planificación estratégica.

## Tu rol
- Sos directo, firme y exigente
- Hablás en español rioplatense neutro: "vos"
`
const fullSystem = [
  HEADER,
  '\n## Doctrina\n\n',
  extractConst('K_PE_DEFINICION'),
  '\n\n## Propósito\n\n',
  extractConst('K_PE_PROPOSITO'),
  '\n\n## Situación\n\n',
  extractConst('K_PE_SITUACION'),
  '\n\n## Estrategia vs táctica\n\n',
  extractConst('K_PE_ESTRATEGIA_VS_TACTICA'),
  '\n\n## Fallas\n\n',
  extractConst('K_PE_FALLAS'),
  '\n\n## Cuestionario\n\n',
  extractConst('K_PE_CUESTIONARIO'),
].join('')

const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'turns-md.json'), 'utf8'))

// Curva de tokens medida antes:
//   idx 24 → 27.551 tokens
//   idx 36 → 35.535
//   idx 44 → 43.268
//   idx 52 → 48.399
//   idx 60 → 55.035
//   idx 73 → 65.376
// Truncar a niveles que aproximan 30k, 40k, 50k, 60k:
const levels = [
  { label: '30k', truncateAt: 28 }, // ~30k tokens
  { label: '40k', truncateAt: 38 }, // ~38k tokens
  { label: '50k', truncateAt: 54 }, // ~50k tokens
  { label: '60k', truncateAt: 70 }, // ~62k tokens
]

// Needle: pregunto un dato muy específico de los primeros turnos.
// MD[16] (user) menciona específicamente: "Confianza: 90%+ ... Juanma Tapiola y Más Dueños"
// MD[12] (user): "vamos a crecer a 6000 unidades año en 2026 y unas 12.000-15.000 en 2027"
// MD[26] (user): foco list: "no clase media-alta", "no nuevos modelos constructivos",
//   "no productos para inversores", "no perfil empresarial JMT", "no constructoras",
//   "no asociar desarrolladoras chicas"
// MD[38] (user): "PAI 100 ventas/mes Liniers, churn 50%, 5000 personas/día"

// La needle a usar: pido dos datos puntuales.
// Datos correctos:
//   - El churn de PAI mencionado: 50% (pero no validado, pendiente de PM)
//   - El tráfico de la sucursal de Liniers: 5000+ personas/día
// Estos datos están en MD[38] (truncado a 30k? sí, idx 28 incluye 38? no, 28 < 38).
//
// Voy a usar dos needles distintos según el nivel:
const needles = [
  {
    pregunta: '¿Qué porcentaje exacto de awareness asistido en target mencioné como métrica? Solo el número y a qué marca lo asocié, sin más explicación.',
    respuesta_correcta_keys: ['90', 'juanma', 'tapiola', 'más dueños', 'mas duenos'],
    contiene_en_turno: 16,
  },
  {
    pregunta: '¿Cuántas unidades por mes vendemos hoy y a qué número queremos llegar en 2026? Solo los dos números.',
    respuesta_correcta_keys: ['100', '6000', '6.000', '6,000', '1000', '1.000', '1,000'],
    contiene_en_turno: 12,
  },
]

console.log('='.repeat(78))
console.log('TEST SINTÉTICO needle-in-haystack — Opus 4.7 con historial real truncado')
console.log('='.repeat(78))

const results = []

for (const lvl of levels) {
  for (const needle of needles) {
    if (lvl.truncateAt < needle.contiene_en_turno) continue // skip si la needle no está en el contexto

    console.log()
    console.log(`--- Nivel ${lvl.label} (turnos 0..${lvl.truncateAt}) — Needle del turno ${needle.contiene_en_turno} ---`)
    console.log(`Pregunta: ${needle.pregunta}`)

    // Construir messages: md[0..truncateAt] + needle como nuevo user input
    const messages = md.slice(0, lvl.truncateAt + 1).map(t => ({
      role: t.rol === 'model' ? 'assistant' : 'user',
      content: t.contenido,
    }))
    // Si el último turno es user, agregar un assistant fake (asumamos que respondió "ok"); luego nuevo user.
    // Mejor: aseguro que el último sea model truncando si necesario.
    while (messages.length > 0 && messages.at(-1).role !== 'assistant') {
      messages.pop()
    }
    messages.push({ role: 'user', content: `Pausa. Necesito que me confirmes algo de lo que ya dijimos antes de seguir. ${needle.pregunta}` })

    // Medir tokens
    const tokenCheck = await client.messages.countTokens({ model: MODEL, system: fullSystem, messages })
    console.log(`Input tokens: ${tokenCheck.input_tokens}`)

    // Hacer la llamada
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: fullSystem,
      messages,
    })
    const respText = resp.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
    const respLow = respText.toLowerCase()
    const hits = needle.respuesta_correcta_keys.filter(k => respLow.includes(k.toLowerCase()))
    const correcto = hits.length >= 1
    console.log(`Respuesta (${respText.length} chars):`)
    console.log(`  ${respText.slice(0, 400).replace(/\n/g, ' / ')}${respText.length > 400 ? '...' : ''}`)
    console.log(`Hits de keys correctas: [${hits.join(', ')}]`)
    console.log(`Veredicto: ${correcto ? '✔ RECUPERÓ EL DATO' : '✗ NO RECUPERÓ EL DATO'}`)

    results.push({
      nivel: lvl.label,
      truncateAt: lvl.truncateAt,
      input_tokens: tokenCheck.input_tokens,
      pregunta: needle.pregunta,
      contiene_en_turno: needle.contiene_en_turno,
      respuesta: respText,
      hits,
      correcto,
      output_tokens: resp.usage.output_tokens,
    })
  }
}

console.log()
console.log('='.repeat(78))
console.log('RESUMEN')
console.log('='.repeat(78))
console.log('Nivel | Tokens IN | Turno needle | Veredicto')
console.log('-'.repeat(60))
for (const r of results) {
  console.log(`${r.nivel.padEnd(5)} | ${String(r.input_tokens).padStart(9)} | ${String(r.contiene_en_turno).padStart(12)} | ${r.correcto ? '✔ recuperó' : '✗ NO recuperó'}`)
}

fs.writeFileSync(path.join(ROOT, 'output', 'synthetic-needle.json'), JSON.stringify(results, null, 2))
