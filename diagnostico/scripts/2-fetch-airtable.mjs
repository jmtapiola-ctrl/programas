// Lee planes_estrategicos y entrevistas_pe de Airtable.
// Identifica el plan + entrevista del usuario y guarda el estado real.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Cargar .env.local manualmente (sin dotenv)
const envPath = path.resolve(ROOT, '..', '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const BASE_ID = env.AIRTABLE_BASE_ID
const API_KEY = env.AIRTABLE_API_KEY
if (!BASE_ID || !API_KEY) {
  console.error('Faltan AIRTABLE_BASE_ID o AIRTABLE_API_KEY en .env.local')
  process.exit(1)
}

const TABLA_PLANES_PE = 'tblPJC1VMQclfCqc7'
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'

async function fetchAll(table) {
  const records = []
  let offset
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/${table}?pageSize=100`
    if (offset) url += `&offset=${offset}`
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    })
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`)
    const data = await r.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

console.log('='.repeat(70))
console.log('FETCH AIRTABLE')
console.log('='.repeat(70))

const planes = await fetchAll(TABLA_PLANES_PE)
console.log(`Planes encontrados: ${planes.length}`)
for (const p of planes) {
  console.log(`  - ${p.id}  Nombre="${p.fields['Nombre'] ?? ''}" Tipo=${p.fields['Tipo']} Estado=${p.fields['Estado']} Area="${p.fields['Area'] ?? ''}"`)
}

const entrevistas = await fetchAll(TABLA_ENTREVISTAS_PE)
console.log(`\nEntrevistas encontradas: ${entrevistas.length}`)
for (const e of entrevistas) {
  const histRaw = e.fields['Historial'] ?? '[]'
  const histLen = histRaw.length
  let histArr = []
  try { histArr = JSON.parse(histRaw) } catch {}
  const planId = (e.fields['Plan'] ?? [])[0]
  console.log(`  - ${e.id}  Plan=${planId} Estado=${e.fields['Estado']} Paso=${e.fields['Paso Actual']} SubBloque=${e.fields['Sub Bloque Actual']} UltAct=${e.fields['Ultima Actividad']}`)
  console.log(`         Turnos en Historial: ${histArr.length}, Chars del campo: ${histLen.toLocaleString()}`)
}

// Guardar todo crudo
fs.writeFileSync(
  path.join(ROOT, 'output', 'airtable-planes-raw.json'),
  JSON.stringify(planes, null, 2)
)
fs.writeFileSync(
  path.join(ROOT, 'output', 'airtable-entrevistas-raw.json'),
  JSON.stringify(entrevistas, null, 2)
)

// Detectar la entrevista "principal" — la que más turnos tiene (probablemente Terravinci)
let target = null
let maxTurns = -1
for (const e of entrevistas) {
  let arr = []
  try { arr = JSON.parse(e.fields['Historial'] ?? '[]') } catch {}
  if (arr.length > maxTurns) { maxTurns = arr.length; target = e }
}

if (target) {
  console.log()
  console.log('='.repeat(70))
  console.log(`Entrevista target (la que más turnos tiene): ${target.id}`)
  console.log('='.repeat(70))
  const histRaw = target.fields['Historial'] ?? '[]'
  let arr = []
  try { arr = JSON.parse(histRaw) } catch (e) { console.error('JSON.parse fallo:', e) }

  console.log(`Turnos:                ${arr.length}`)
  console.log(`Tamaño campo Historial: ${histRaw.length.toLocaleString()} chars`)
  console.log(`Límite multilineText Airtable: 100.000 chars (aprox.)`)
  console.log(`% del límite usado: ${((histRaw.length / 100000) * 100).toFixed(1)}%`)
  console.log()
  if (arr.length > 0) {
    console.log(`Primer turno (rol=${arr[0].rol}, ts=${arr[0].timestamp}):`)
    console.log(`  "${(arr[0].contenido ?? '').slice(0, 80)}..."`)
    console.log(`Último turno (rol=${arr.at(-1).rol}, ts=${arr.at(-1).timestamp}):`)
    console.log(`  "${(arr.at(-1).contenido ?? '').slice(0, 80)}..."`)
  }

  // Buscar PANEL_UPDATEs en turnos del modelo (CRÍTICO)
  const conPanel = arr.filter(t => t.rol === 'model' && /<!--\s*PANEL_UPDATE\s*-->/.test(t.contenido ?? ''))
  console.log()
  console.log(`Turnos del modelo con PANEL_UPDATE filtrado en contenido: ${conPanel.length} / ${arr.filter(t => t.rol === 'model').length}`)
  if (conPanel.length > 0) {
    console.log(`  ⚠ HAY LEAK DE PANEL_UPDATE en historial. Indices: ${conPanel.slice(0, 5).map(t => arr.indexOf(t)).join(', ')}`)
  }

  // Distribución de timestamps por día (para ver donde paró el guardado)
  const byDate = {}
  for (const t of arr) {
    const d = (t.timestamp ?? '').slice(0, 10)
    byDate[d] = (byDate[d] ?? 0) + 1
  }
  console.log()
  console.log('Distribución de turnos por fecha (timestamp del turno):')
  for (const [d, n] of Object.entries(byDate).sort()) {
    console.log(`  ${d}: ${n} turnos`)
  }

  // Guardar el historial extracto
  fs.writeFileSync(
    path.join(ROOT, 'output', 'airtable-historial-real.json'),
    JSON.stringify({
      entrevista_id: target.id,
      plan_id: (target.fields['Plan'] ?? [])[0],
      paso_actual: target.fields['Paso Actual'],
      sub_bloque_actual: target.fields['Sub Bloque Actual'],
      ultima_actividad: target.fields['Ultima Actividad'],
      tamaño_campo_chars: histRaw.length,
      cantidad_turnos: arr.length,
      historial: arr,
    }, null, 2)
  )
}
