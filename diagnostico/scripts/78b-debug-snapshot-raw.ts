// Debug: raw fetch a Turnos_PE para ver qué shape tienen los snapshots.

const TABLA_TURNOS_PE = 'tbloUbjsoiYjxhFvU'
const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`

async function main() {
  // Sin filtro — listar todo y ver qué hay
  let offset: string | undefined
  let total = 0
  let snapshotsCounter = 0
  const allSnapshots: any[] = []
  do {
    const url = `${BASE_URL}/${TABLA_TURNOS_PE}?pageSize=100${offset ? `&offset=${offset}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } })
    const data = await res.json()
    for (const r of data.records ?? []) {
      total++
      const f = r.fields ?? {}
      const rol = f['Rol']
      const rolStr = typeof rol === 'string' ? rol : rol?.name
      if (rolStr === 'snapshot') {
        snapshotsCounter++
        allSnapshots.push(r)
      }
    }
    offset = data.offset
  } while (offset)
  console.log(`Total records iterados: ${total}`)
  console.log(`Records con Rol='snapshot': ${snapshotsCounter}\n`)
  for (const r of allSnapshots) {
    console.log(`\nairtableId=${r.id}`)
    const f = r.fields ?? {}
    console.log(`Fields keys: ${Object.keys(f).join(', ')}`)
    console.log(`Rol: ${JSON.stringify(f['Rol'])}`)
    console.log(`Paso: ${f['Paso']}`)
    console.log(`Timestamp: ${f['Timestamp']}`)
    console.log(`Entrevista: ${JSON.stringify(f['Entrevista'])}`)
    console.log(`Contenido (preview): ${(f['Contenido'] ?? '').slice(0, 100)}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
