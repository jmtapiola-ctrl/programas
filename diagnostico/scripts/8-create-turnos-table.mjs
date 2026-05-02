// Crea la tabla Turnos_PE en Airtable vía REST API.
// Schema:
//   Indice (number, primary)
//   Entrevista (multipleRecordLinks → Entrevistas_PE)
//   Rol (singleSelect: user / model)
//   Contenido (multilineText)
//   Timestamp (dateTime)
//   Paso (number)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const envPath = path.resolve(ROOT, '..', '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const BASE_ID = env.AIRTABLE_BASE_ID
const API_KEY = env.AIRTABLE_API_KEY
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'

const tableSpec = {
  name: 'Turnos_PE',
  description: 'Turnos individuales de las entrevistas del wizard de Plan Estratégico. Reemplaza el campo Historial JSON-blob de Entrevistas_PE para evitar el límite de 100k chars del multilineText.',
  fields: [
    // Primary field debe ser non-link. Uso un singleLineText computable como "{IdxPadded}|{Rol}".
    // Eso nos da algo legible en la UI (ej: "0042|model") y único.
    { name: 'Etiqueta', type: 'singleLineText', description: 'Etiqueta auto-generada (índice padded + rol). Se usa solo como primary key visible.' },
    { name: 'Entrevista', type: 'multipleRecordLinks', options: { linkedTableId: TABLA_ENTREVISTAS_PE } },
    { name: 'Indice', type: 'number', options: { precision: 0 }, description: 'Índice del turno dentro de la entrevista (0, 1, 2, ...). Define el orden cronológico.' },
    { name: 'Rol', type: 'singleSelect', options: { choices: [{ name: 'user' }, { name: 'model' }] } },
    { name: 'Contenido', type: 'multilineText', description: 'Texto del turno. Para el modelo, ya viene LIMPIO (sin bloque PANEL_UPDATE).' },
    { name: 'Timestamp', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'client' } },
    { name: 'Paso', type: 'number', options: { precision: 0 } },
  ],
}

console.log('Creando tabla Turnos_PE en base', BASE_ID)
const r = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(tableSpec),
})
const text = await r.text()
console.log('HTTP', r.status)
console.log(text)
if (!r.ok) {
  console.error('\n⚠ Falló. Probablemente el token no tenga el scope schema.bases:write.')
  console.error('Solución: en https://airtable.com/create/tokens, editar el token y agregar el scope.')
  process.exit(1)
}
const result = JSON.parse(text)
console.log()
console.log('✔ Tabla creada:', result.id)
console.log('Field IDs:')
for (const f of result.fields) {
  console.log(`  ${f.name.padEnd(15)} = ${f.id}  (${f.type})`)
}

// Guardar IDs para usar en el código
fs.writeFileSync(
  path.join(ROOT, 'output', 'turnos-pe-table.json'),
  JSON.stringify(result, null, 2)
)
