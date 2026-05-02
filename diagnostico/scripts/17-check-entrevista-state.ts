// Check actual state of entrevista + count turnos in Turnos_PE
const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY

async function main() {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/tblbOOk5jvVu3GsPJ/recDkuVIOeqsMMhJj`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  const e = await r.json()
  console.log('Entrevista state:')
  console.log('  Estado:', e.fields.Estado)
  console.log('  Paso Actual:', e.fields['Paso Actual'])
  console.log('  Sub Bloque Actual:', e.fields['Sub Bloque Actual'])
  console.log('  Ultima Actividad:', e.fields['Ultima Actividad'])
  console.log()

  // Fetch all turnos
  const all: any[] = []
  let offset: string | undefined
  do {
    const u = `https://api.airtable.com/v0/${BASE_ID}/tblWxPv53CRscq18w?pageSize=100&sort[0][field]=Indice&sort[0][direction]=asc${offset ? '&offset=' + offset : ''}`
    const rr = await fetch(u, { headers: { Authorization: `Bearer ${API_KEY}` } })
    const d = await rr.json()
    all.push(...d.records)
    offset = d.offset
  } while (offset)

  const mine = all.filter(r => (r.fields.Entrevista ?? []).includes('recDkuVIOeqsMMhJj'))
  console.log(`Turnos en Turnos_PE para esta entrevista: ${mine.length}`)
  if (mine.length > 0) {
    console.log(`  Primer turno: idx=${mine[0].fields.Indice} rol=${mine[0].fields.Rol?.name} ts=${mine[0].fields.Timestamp}`)
    console.log(`  Último turno: idx=${mine.at(-1)!.fields.Indice} rol=${mine.at(-1)!.fields.Rol?.name} ts=${mine.at(-1)!.fields.Timestamp}`)
  }

  // Distribución por timestamp (día) — para ver qué turnos vinieron post-fix
  const byDate: Record<string, number> = {}
  for (const t of mine) {
    const d = (t.fields.Timestamp ?? '').slice(0, 10)
    byDate[d] = (byDate[d] ?? 0) + 1
  }
  console.log()
  console.log('Distribución por fecha de timestamp:')
  for (const [d, n] of Object.entries(byDate).sort()) {
    console.log(`  ${d}: ${n} turnos`)
  }

  // Últimos 10 turnos preview
  console.log()
  console.log('Últimos 10 turnos:')
  for (const t of mine.slice(-10)) {
    const c = (t.fields.Contenido ?? '') as string
    console.log(`  [${String(t.fields.Indice).padStart(3)}] ${t.fields.Rol?.name?.padEnd(5)} (${c.length} chars): ${c.slice(0, 90).replace(/\n/g, ' ')}...`)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {} // marca este script como módulo para que tsc no lo vea en scope global
