// Patchea el snapshot intermedio del 12/5/2026 17:32 UTC (cierre de 3.0 del
// Plan Sr) agregándole cierre_tipo='intermedio_sub_bloque_3.0'. Esto hace que
// el nuevo wrapper del LLM en chat/route.ts lo etiquete correctamente como
// cierre intermedio y NO como cierre formal del Paso 3.

import { getEntrevistaPE, getTurnosPE } from '@/lib/airtable'

const PLAN_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

const TABLA_TURNOS_PE = 'tblWxPv53CRscq18w'
const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`

async function findSnapshotRecord(entrevistaId: string, paso: number, timestampISO: string): Promise<string | null> {
  // Listamos todos los records de Turnos_PE y filtramos por paso + rol + ts.
  // No filtramos por entrevista en la fetch porque ARRAYJOIN sobre linked
  // field es flaky; el filtro de entrevista lo hace getTurnosPE en memoria.
  const tsTarget = new Date(timestampISO).getTime()
  const url = `${BASE_URL}/${TABLA_TURNOS_PE}?pageSize=100`
  let offset: string | undefined
  let totalSnaps = 0
  do {
    const u = offset ? `${url}&offset=${offset}` : url
    const res = await fetch(u, { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } })
    const data = await res.json()
    for (const r of data.records ?? []) {
      const f = r.fields ?? {}
      const rol = f['Rol']?.name ?? f['Rol']
      const pasoR = f['Paso']
      const tsR = f['Timestamp']
      if (rol !== 'snapshot' || pasoR !== paso) continue
      totalSnaps++
      if (!tsR) continue
      const tsMs = new Date(tsR).getTime()
      if (Math.abs(tsMs - tsTarget) < 5000) {
        return r.id
      }
    }
    offset = data.offset
  } while (offset)
  console.log(`[debug] Iteré ${totalSnaps} snapshots paso=${paso} sin match exact timestamp.`)
  return null
}

async function main() {
  if ((PLAN_ID as string) === (PLAN_DUMMY_ID as string)) throw new Error('Sanity check')

  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')

  // El timestamp del rogue snapshot (UTC) que vimos en el script 77
  const timestampObjetivo = '2026-05-12T17:32:50.960Z'

  console.log(`[patch] Buscando snapshot paso=3 con timestamp ${timestampObjetivo} en entrevista ${ent.id}...`)
  const airtableId = await findSnapshotRecord(ent.id!, 3, timestampObjetivo)
  if (!airtableId) {
    console.log('❌ No se encontró el snapshot. Listo todos los snapshots paso=3:')
    const turnos = await getTurnosPE(ent.id!)
    const snaps = turnos.filter(t => t.rol === 'snapshot' && t.paso === 3)
    for (const s of snaps) console.log(`  - timestamp=${(s as any).timestamp}`)
    process.exit(1)
  }
  console.log(`✓ Encontrado: airtableId=${airtableId}`)

  // Leer el record para parsear su contenido actual
  const res1 = await fetch(`${BASE_URL}/${TABLA_TURNOS_PE}/${airtableId}`, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
  })
  const recordRaw = await res1.json()
  const contenidoActual = recordRaw.fields?.['Contenido'] ?? ''
  let parsed: any
  try { parsed = JSON.parse(contenidoActual) } catch { throw new Error('Contenido del snapshot no parsea como JSON') }

  if (parsed.cierre_tipo) {
    console.log(`[patch] Ya tiene cierre_tipo='${parsed.cierre_tipo}'. No-op.`)
    return
  }

  // Patchear: agregar cierre_tipo='intermedio_sub_bloque_3.0'
  parsed.cierre_tipo = 'intermedio_sub_bloque_3.0'
  const nuevoContenido = JSON.stringify(parsed)
  const nuevoResumen = nuevoContenido  // misma estructura para snapshot resumen

  console.log(`[patch] Aplicando PATCH con cierre_tipo='intermedio_sub_bloque_3.0'...`)
  // El campo "Snapshot Resumen JSON" usa el fieldId fldk4WTpCtTPuirUr;
  // PATCH por nombre falla porque el nombre tiene "JSON" al final que no
  // todas las APIs aceptan. Uso fieldId para evitar el issue.
  const res2 = await fetch(`${BASE_URL}/${TABLA_TURNOS_PE}/${airtableId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        Contenido: nuevoContenido,
        fldk4WTpCtTPuirUr: nuevoResumen,
      },
      typecast: true,
    }),
  })
  if (!res2.ok) {
    const err = await res2.text()
    throw new Error(`PATCH falló: ${res2.status} ${err}`)
  }
  console.log('[patch] ✓ Snapshot patcheado. El próximo turno del modelo lo verá como cierre intermedio de 3.0.')
}

main().catch(e => { console.error('[patch] FATAL:', e); process.exit(1) })
