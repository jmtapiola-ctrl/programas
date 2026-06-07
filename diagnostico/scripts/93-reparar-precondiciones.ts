// REPARACIÓN (escribe en Airtable) — reconcilia precondiciones desde
// precondiciones_tipo en el inventario del plan activo. Causa: las dependencias
// quedaron desincronizadas (precondiciones_tipo poblado, precondiciones casi
// vacío) → el canvas y el Gantt (que leen precondiciones) solo veían 1 edge.
//
// Qué hace, por mov:
//   - precondiciones = UNIÓN(precondiciones actuales, claves de precondiciones_tipo)
//   - precondiciones_tipo: completa con 'sugerida' las precondiciones sin tipo
//   - desbloquea = reverso (X desbloquea Y si X ∈ Y.precondiciones)
//   - tipo_dependencia = 'sugerida' si tiene precondiciones y estaba en 'ninguna'
//
// SEGURIDAD: hace backup del 'Plan Inventario JSON' original a diagnostico/output/
// ANTES de escribir. Idempotente (correrlo dos veces no cambia nada).
//
// Correr: npx tsx --env-file=.env.local diagnostico/scripts/93-reparar-precondiciones.ts

import { writeFileSync } from 'fs'

const KEY = process.env.AIRTABLE_API_KEY!
const BASE = process.env.AIRTABLE_BASE_ID!
const ENTREVISTAS = 'tblbOOk5jvVu3GsPJ'
const PLANES = 'tblPJC1VMQclfCqc7'

async function get(t: string, q: string) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${t}?${q}`, { headers: { Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${t}: ${r.status} ${await r.text()}`)
  return (await r.json()).records
}
async function patch(t: string, id: string, fields: Record<string, unknown>) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${t}/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) throw new Error(`PATCH ${t}: ${r.status} ${await r.text()}`)
  return r.json()
}

async function main() {
  const ent = (await get(ENTREVISTAS, 'sort[0][field]=Ultima Actividad&sort[0][direction]=desc&pageSize=1'))[0]
  const planId = ent.fields['Plan']?.[0]
  const planRec = (await get(PLANES, `filterByFormula=${encodeURIComponent(`RECORD_ID()='${planId}'`)}`))[0]
  const raw = planRec.fields['Plan Inventario JSON'] || '{}'

  // Backup
  const backupPath = `diagnostico/output/backup-inventario-${planId}-${ent.fields['Ultima Actividad'] ? '' : ''}pre-reparacion.json`
  writeFileSync(backupPath, raw, 'utf8')
  console.log(`Backup escrito: ${backupPath} (${raw.length} chars)`)

  const inv = JSON.parse(raw)
  const movs: any[] = inv.movimientos ?? []
  console.log(`Inventario: ${movs.length} movs`)

  let edgesAntes = 0, edgesDespues = 0
  // 1) Unir precondiciones desde tipo + completar tipos faltantes.
  for (const m of movs) {
    edgesAntes += (m.precondiciones ?? []).length
    const tipo = (m.precondiciones_tipo && typeof m.precondiciones_tipo === 'object') ? m.precondiciones_tipo : {}
    const union = new Set<string>([...(m.precondiciones ?? []), ...Object.keys(tipo)])
    // sacar auto-referencias por las dudas
    union.delete(m.id)
    m.precondiciones = [...union]
    const tipoNuevo: Record<string, string> = {}
    for (const p of m.precondiciones) tipoNuevo[p] = tipo[p] ?? 'sugerida'
    m.precondiciones_tipo = m.precondiciones.length > 0 ? tipoNuevo : undefined
    if (m.precondiciones.length > 0 && (!m.tipo_dependencia || m.tipo_dependencia === 'ninguna')) {
      m.tipo_dependencia = 'sugerida'
    }
    edgesDespues += m.precondiciones.length
  }
  // 2) Reconstruir desbloquea (reverso).
  const desbl = new Map<string, Set<string>>()
  for (const m of movs) desbl.set(m.id, new Set())
  for (const m of movs) for (const p of m.precondiciones) desbl.get(p)?.add(m.id)
  for (const m of movs) m.desbloquea = [...(desbl.get(m.id) ?? [])]

  console.log(`Edges (precondiciones): ${edgesAntes} → ${edgesDespues}`)
  for (const m of movs) {
    console.log(`  ${m.id} precond=[${m.precondiciones.join(',')}] desbloquea=[${m.desbloquea.join(',')}]`)
  }

  await patch(PLANES, planId, { 'Plan Inventario JSON': JSON.stringify(inv) })
  console.log('\n✅ Inventario reparado y persistido.')
}
main().catch(e => { console.error(e); process.exit(1) })
