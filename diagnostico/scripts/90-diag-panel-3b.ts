// Diagnóstico read-only: ¿cuántas preguntas de 3.B se PERSISTIERON en el plan?
// El bloque PANEL_UPDATE se strippea del Contenido de los turnos, así que el
// único lugar fiable es plan.palancas.preguntas_principal en 'Plan Paso 3 JSON'.
// Si solo está P-1 → el modelo no está sumando P-2/P-3 al array (bug de emisión).
// Si están P-1..P-3 → el problema es del frontend (no las renderiza).
//
// Correr: npx tsx --env-file=.env.local diagnostico/scripts/90-diag-panel-3b.ts
// NO escribe nada.

const KEY = process.env.AIRTABLE_API_KEY!
const BASE = process.env.AIRTABLE_BASE_ID!
const ENTREVISTAS = 'tblbOOk5jvVu3GsPJ'
const PLANES = 'tblPJC1VMQclfCqc7'

async function get(table: string, query: string): Promise<any[]> {
  const url = `https://api.airtable.com/v0/${BASE}/${table}?${query}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`)
  return (await res.json()).records
}

async function main() {
  const ents = await get(ENTREVISTAS, 'sort[0][field]=Ultima Actividad&sort[0][direction]=desc&pageSize=3')
  const ent = ents[0]
  const planId = ent.fields['Plan']?.[0]
  console.log('Entrevista:', ent.id, '· paso_actual:', ent.fields['Paso Actual'], '· sub_bloque:', ent.fields['Sub Bloque Actual'])
  console.log('Plan id:', planId)

  const planRec = (await get(PLANES, `filterByFormula=${encodeURIComponent(`RECORD_ID()='${planId}'`)}`))[0]
  const raw = planRec.fields['Plan Paso 3 JSON']
  if (!raw) { console.log('Plan Paso 3 JSON VACÍO'); return }
  const plan = JSON.parse(raw)
  const pp = plan?.palancas?.preguntas_principal
  console.log('\npalancas.preguntas_principal:', Array.isArray(pp) ? `${pp.length} preguntas` : '(no es array / ausente)')
  if (Array.isArray(pp)) {
    for (const q of pp) {
      console.log(`  · ${q.id} modo=${q.modo_interaccion ?? '—'} | resp_estr=${q.respuesta_estructurada ? 'sí' : 'no'} | resp_txt=${q.respuesta ? 'sí' : 'no'}`)
      console.log(`     pregunta: "${(q.pregunta ?? '').slice(0, 70)}…"`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
