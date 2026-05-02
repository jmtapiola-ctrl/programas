// Una llamada real a claude-opus-4-7 con un payload mínimo,
// para inspeccionar usage.thinking_tokens (si existe en este modelo).
// El endpoint actual NO habilita extended thinking; queremos confirmar que
// el modelo tampoco emite thinking implícito en sus responses.

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

console.log('Llamada real a claude-opus-4-7 SIN thinking habilitado...')
const r1 = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 200,
  system: 'Sos asistente directo.',
  messages: [{ role: 'user', content: '¿Cuánto es 12 * 13? Solo el número.' }],
})

console.log('\n--- Sin thinking habilitado ---')
console.log('content blocks:', r1.content.map(b => ({ type: b.type, text: 'text' in b ? b.text.slice(0, 50) : null })))
console.log('usage:', r1.usage)
console.log('stop_reason:', r1.stop_reason)

console.log()
console.log('Llamada real CON thinking habilitado...')
try {
  const r2 = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    thinking: { type: 'enabled', budget_tokens: 2000 },
    system: 'Sos asistente directo.',
    messages: [{ role: 'user', content: '¿Cuánto es 12 * 13? Solo el número.' }],
  })
  console.log('\n--- Con thinking habilitado ---')
  console.log('content blocks:', r2.content.map(b => ({ type: b.type, hasThinking: b.type === 'thinking', text: 'text' in b ? b.text.slice(0, 50) : null })))
  console.log('usage:', r2.usage)
} catch (e) {
  console.log('Error con thinking habilitado:', e.message)
}

fs.writeFileSync(
  path.join(ROOT, 'output', 'thinking-check.json'),
  JSON.stringify({ r1: { content: r1.content, usage: r1.usage } }, null, 2)
)

console.log()
console.log('Conclusión: el endpoint /chat NO habilita thinking. Verificar arriba si la')
console.log('llamada SIN thinking habilitado emite algún content block tipo "thinking" o')
console.log('reporta thinking_tokens > 0 en usage. Si todo es text + 0 thinking, la')
console.log('hipótesis "thinking tokens reinyectados" queda descartada.')
