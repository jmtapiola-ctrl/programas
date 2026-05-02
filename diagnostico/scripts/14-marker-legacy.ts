// Reemplaza el contenido del campo Historial (legacy multilineText) en
// la entrevista migrada por un texto-marker que documenta in-situ qué pasó.
// El backup queda en diagnostico/output/snapshot-pre-migracion-*.json.

const TARGET_ENTREVISTA_ID = 'recDkuVIOeqsMMhJj'
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'

const MARKER = `MIGRADO 2026-05-01 — los 62 turnos originales fueron migrados a la tabla Turnos_PE (linked field "Entrevista"). Este campo legacy se mantiene como backup. Los turnos posteriores al 62 NO están en este campo (se perdieron por bug de almacenamiento, recuperados desde MD del usuario y agregados a Turnos_PE como índices 62-72; turno 73 regenerado vía API de Opus).`

async function main() {
  const BASE_ID = process.env.AIRTABLE_BASE_ID
  const API_KEY = process.env.AIRTABLE_API_KEY
  if (!BASE_ID || !API_KEY) throw new Error('Faltan creds')

  console.log(`Marcando campo legacy Historial de ${TARGET_ENTREVISTA_ID}...`)
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_ENTREVISTAS_PE}/${TARGET_ENTREVISTA_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { Historial: MARKER } }),
  })
  const text = await res.text()
  console.log('HTTP', res.status)
  if (!res.ok) {
    console.error(text)
    process.exit(1)
  }
  console.log('✔ Marker escrito')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {} // marca este script como módulo para que tsc no lo vea en scope global
