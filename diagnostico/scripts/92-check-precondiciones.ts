// Read-only: cuántas precondiciones tiene cada mov del inventario del plan
// activo. Si están casi todas vacías → 3.A.6 (secuenciación) no persistió las
// dependencias, lo que explica que FasesCanvasP4 muestre 1 edge y el Gantt sea
// naive. Si están pobladas → el problema es de render/uso en el canvas de fases.

const KEY = process.env.AIRTABLE_API_KEY!
const BASE = process.env.AIRTABLE_BASE_ID!
const ENTREVISTAS = 'tblbOOk5jvVu3GsPJ'
const PLANES = 'tblPJC1VMQclfCqc7'
async function get(t: string, q: string) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${t}?${q}`, { headers: { Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${t}: ${r.status} ${await r.text()}`)
  return (await r.json()).records
}
async function main() {
  const ent = (await get(ENTREVISTAS, 'sort[0][field]=Ultima Actividad&sort[0][direction]=desc&pageSize=1'))[0]
  const planId = ent.fields['Plan']?.[0]
  const planRec = (await get(PLANES, `filterByFormula=${encodeURIComponent(`RECORD_ID()='${planId}'`)}`))[0]
  const inv = JSON.parse(planRec.fields['Plan Inventario JSON'] || '{}')
  const movs = inv?.movimientos ?? []
  console.log(`Plan ${planId} · inventario (Plan Inventario JSON): ${movs.length} movimientos`)
  console.log(`DAG persistido: ${inv?.dag ? `sí (${inv.dag.movs?.length ?? 0} en canvas)` : 'NO'}`)
  let totalPre = 0, totalDes = 0
  for (const m of movs) {
    const pre = m.precondiciones ?? []
    const des = m.desbloquea ?? []
    totalPre += pre.length; totalDes += des.length
    const dur = m.duracion_meses_ejecucion ?? '—'
    console.log(`  ${m.id} dur=${dur}m · precond=[${pre.join(',')}] · desbloquea=[${des.join(',')}] · tipos=${JSON.stringify(m.precondiciones_tipo ?? {})}`)
  }
  console.log(`\nTOTAL precondiciones: ${totalPre} · desbloquea: ${totalDes}`)
}
main().catch(e => { console.error(e); process.exit(1) })
