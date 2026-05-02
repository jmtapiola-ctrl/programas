// Snapshot defensivo: dump completo del estado de planes_pe + entrevistas_pe
// + turnos_pe ANTES de tocar nada. Permite rollback manual si algo sale mal.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ts = new Date().toISOString().replace(/[:.]/g, '-')

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
if (!BASE_ID || !API_KEY) throw new Error('Faltan creds Airtable en env')

async function fetchAll(table: string, params = ''): Promise<any[]> {
  const records: any[] = []
  let offset: string | undefined
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/${table}?pageSize=100`
    if (params) url += `&${params}`
    if (offset) url += `&offset=${offset}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } })
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`)
    const data = await r.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

async function main() {
  const planes = await fetchAll('tblPJC1VMQclfCqc7')
  const entrevistas = await fetchAll('tblbOOk5jvVu3GsPJ')
  const turnos = await fetchAll('tblWxPv53CRscq18w')

  const snapshot = { taken_at: ts, planes, entrevistas, turnos }
  const outPath = path.join(ROOT, 'output', `snapshot-pre-migracion-${ts}.json`)
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2))

  console.log(`✔ Snapshot guardado: ${outPath}`)
  console.log(`   Planes: ${planes.length}, Entrevistas: ${entrevistas.length}, Turnos: ${turnos.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
