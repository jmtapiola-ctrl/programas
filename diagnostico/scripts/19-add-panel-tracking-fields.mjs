// Agrega 3 campos nuevos a entrevistas_pe para tracking del PANEL_UPDATE health.
//
//   Ultimo Panel Update OK             dateTime    cuándo se procesó OK por última vez
//   Turnos Sin Panel Consecutivos      number      contador para trigger del panel_unhealthy
//   Retries Panel Update Acumulados    number      telemetría: cuántos retries totales

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'

const fields = [
  {
    name: 'Ultimo Panel Update OK',
    type: 'dateTime',
    description: 'Timestamp del último turno donde el PANEL_UPDATE se procesó correctamente.',
    options: {
      dateFormat: { name: 'iso' },
      timeFormat: { name: '24hour' },
      timeZone: 'client',
    },
  },
  {
    name: 'Turnos Sin Panel Consecutivos',
    type: 'number',
    description: 'Contador de turnos seguidos sin PANEL_UPDATE válido. >=3 dispara alerta panel_unhealthy.',
    options: { precision: 0 },
  },
  {
    name: 'Retries Panel Update Acumulados',
    type: 'number',
    description: 'Telemetría: cuántas veces se disparó retry de PANEL_UPDATE en total para esta entrevista.',
    options: { precision: 0 },
  },
]

const ids = {}
for (const field of fields) {
  process.stdout.write(`Creando campo "${field.name}"... `)
  const r = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${TABLA_ENTREVISTAS_PE}/fields`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(field),
  })
  const text = await r.text()
  if (!r.ok) {
    if (text.includes('DUPLICATE_OR_EMPTY_FIELD_NAME')) {
      console.log('YA EXISTE — saltando')
      continue
    }
    console.log(`HTTP ${r.status}\n${text}`)
    process.exit(1)
  }
  const created = JSON.parse(text)
  ids[field.name] = created.id
  console.log(`✔ ${created.id}`)
}

console.log('\nField IDs creados (copiar a lib/airtable.ts):')
for (const [name, id] of Object.entries(ids)) {
  console.log(`  ${name.padEnd(35)} ${id}`)
}
