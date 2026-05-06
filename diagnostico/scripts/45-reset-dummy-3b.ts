// Reset del plan dummy `recEsoKMENVQI8NUb` al estado "post-3.A, listo para 3.B".
//
// Mantiene: plan.preparativos + plan.inventario (más todos los campos de Paso 0/1/2).
// Limpia: plan.palancas, plan.borrador, plan.estres, plan.curado.
// Setea: entrevista.sub_bloque_actual = '3.B'.
// Borra: turnos posteriores al último snapshot del Paso 3 (rol='snapshot' con
//        Snapshot Paso = 3 y Snapshot Resumen mencionando 3.A).
//
// Uso: npx tsx --env-file=.env.local diagnostico/scripts/45-reset-dummy-3b.ts
//
// IMPORTANTE: este script SOLO toca el plan dummy (recEsoKMENVQI8NUb), NUNCA el
// Plan Sr de Terravinci (recFMWxoE5gTQQrf7). El ID está hardcoded.

import {
  TABLA_PLANES_PE,
  TABLA_ENTREVISTAS_PE,
  TABLA_TURNOS_PE,
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
} from '../../lib/airtable'

const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'
const PLAN_SR_ID = 'recFMWxoE5gTQQrf7' // hardcoded para asertar que NO lo tocamos

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`
const API_KEY = process.env.AIRTABLE_API_KEY

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function main() {
  if ((PLAN_DUMMY_ID as string) === (PLAN_SR_ID as string)) {
    throw new Error('Sanity check: PLAN_DUMMY_ID y PLAN_SR_ID coinciden — abort.')
  }
  console.log(`[reset] Plan dummy: ${PLAN_DUMMY_ID}`)

  // 1. Leer plan
  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`[reset] Plan "${plan.nombre}" cargado.`)
  if (plan.id !== PLAN_DUMMY_ID) {
    throw new Error(`Plan ID mismatch: esperado ${PLAN_DUMMY_ID}, recibido ${plan.id}`)
  }

  const planJson = plan.plan ?? {}
  const conservar = {
    ...(planJson.preparativos ? { preparativos: planJson.preparativos } : {}),
    ...(planJson.inventario ? { inventario: planJson.inventario } : {}),
  }
  const tienePalancas = !!planJson.palancas
  const tieneBorrador = !!planJson.borrador
  const tieneEstres = !!planJson.estres
  const tieneCurado = !!planJson.curado
  console.log(`[reset] Estado del plan: preparativos=${!!planJson.preparativos}, inventario=${!!planJson.inventario}, palancas=${tienePalancas}, borrador=${tieneBorrador}, estres=${tieneEstres}, curado=${tieneCurado}`)
  console.log(`[reset] Movimientos en inventario: ${planJson.inventario?.movimientos?.length ?? 0}`)

  // 2. Limpiar plan
  await updatePlanEstrategico(PLAN_DUMMY_ID, { plan: conservar as any })
  console.log(`[reset] Plan persistido — palancas/borrador/estres/curado limpiados.`)

  // 3. Setear entrevista.sub_bloque_actual = '3.B'
  const entrevista = await getEntrevistaPE(PLAN_DUMMY_ID)
  if (!entrevista) {
    throw new Error(`Entrevista no encontrada para plan ${PLAN_DUMMY_ID}.`)
  }
  await updateEntrevistaPE(entrevista.id!, { sub_bloque_actual: '3.B', paso_actual: 3 })
  console.log(`[reset] Entrevista actualizada — sub_bloque_actual=3.B, paso_actual=3.`)

  // 4. Borrar turnos post-snapshot Paso 3 (palancas/borrador/etc)
  const params = `sort[0][field]=fldvqiDvekQZHAPm6&sort[0][direction]=asc&pageSize=100`
  const allTurnos: any[] = []
  let offset: string | undefined = undefined
  while (true) {
    const url = `${BASE_URL}/${TABLA_TURNOS_PE}?${params}${offset ? `&offset=${offset}` : ''}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) throw new Error(`fetchAll turnos: ${res.status} ${await res.text()}`)
    const data = await res.json() as any
    allTurnos.push(...data.records)
    if (!data.offset) break
    offset = data.offset
  }
  // Filtrar turnos de esta entrevista. CLAUDE.md aprendizaje: reads usan NOMBRES,
  // no field IDs (Airtable list endpoint devuelve fields por nombre cuando no
  // se pasa returnFieldsByFieldId=true).
  const turnosEnt = allTurnos.filter(r => {
    const ent: string[] = r.fields?.['Entrevista'] ?? []
    return ent.includes(entrevista.id!)
  })
  console.log(`[reset] Turnos en la entrevista: ${turnosEnt.length}`)

  // Encontrar el último snapshot de Paso 3 (el que cerró 3.A)
  let cortIndex = -1
  for (const t of turnosEnt) {
    const rol = t.fields?.['Rol']
    const snapshotPaso = t.fields?.['Snapshot Paso']
    const indice = t.fields?.['Indice']
    if (rol === 'snapshot' && snapshotPaso === 3 && typeof indice === 'number' && indice > cortIndex) {
      cortIndex = indice
    }
  }
  console.log(`[reset] Snapshot Paso 3 encontrado en índice: ${cortIndex} (turnos con índice > ${cortIndex} se borrarán)`)

  if (cortIndex === -1) {
    console.log(`[reset] No hay snapshot Paso 3. Buscando último turno con paso=3 que mencione cierre de 3.A...`)
    let maxIndice3A = -1
    for (const t of turnosEnt) {
      const paso = t.fields?.['Paso']
      const contenido: string = t.fields?.['Contenido'] ?? ''
      const indice = t.fields?.['Indice']
      if (paso === 3 && typeof indice === 'number' && /3\.A/.test(contenido) && /completo|cerr|✅|cumplid|listo/i.test(contenido) && indice > maxIndice3A) {
        maxIndice3A = indice
      }
    }
    if (maxIndice3A === -1) {
      console.log(`[reset] WARNING: no encontré marca de cierre 3.A. Conservando todos los turnos. El user puede igualmente probar — el modelo arrancará 3.B desde el último estado.`)
    } else {
      cortIndex = maxIndice3A
      console.log(`[reset] Fallback: usando índice ${cortIndex} como corte (último turno con paso=3 que menciona cierre de 3.A).`)
    }
  }

  if (cortIndex === -1) {
    console.log(`[reset] No se borrarán turnos.`)
  } else {
    // Refinamiento: además de los turnos > cortIndex, queremos borrar también
    // turnos PREVIOS al snapshot Paso 3 que sean "promesas no cumplidas" del
    // modelo (ej: "Dame un momento que armo el inventario" — el modelo nunca
    // cumple ese commit conversacional porque el inventario se arma en el
    // modal, no en chat). Si dejamos esos turnos, el modelo se confunde al
    // arrancar 3.B porque ve una acción pendiente + snapshot que la contradice.
    //
    // Heurística: borrar turnos del modelo ENTRE el último snapshot Paso 2
    // (o el inicio del historial Paso 3) y el primer snapshot Paso 3, si el
    // contenido tiene patterns de "voy a armar/preparar/generar".
    const PROMESA_RE = /dame un momento|aguardame|voy a (armar|preparar|generar|construir)|listo en un momento/i
    const promesasIncumplidas = turnosEnt.filter(t => {
      const rol = t.fields?.['Rol']
      const paso = t.fields?.['Paso']
      const indice = t.fields?.['Indice']
      const contenido: string = t.fields?.['Contenido'] ?? ''
      return rol === 'model' && paso === 3 && typeof indice === 'number' && indice < cortIndex && PROMESA_RE.test(contenido)
    })
    if (promesasIncumplidas.length > 0) {
      console.log(`[reset] Encontradas ${promesasIncumplidas.length} promesas conversacionales no cumplidas (modelo dijo "voy a armar..." pero la acción ocurrió en modal). Las borro para no confundir al modelo en 3.B.`)
      for (const t of promesasIncumplidas) {
        console.log(`  - índice=${t.fields?.['Indice']}: "${(t.fields?.['Contenido'] ?? '').slice(-150)}"`)
      }
    }
    const aBorrar = [
      ...promesasIncumplidas,
      ...turnosEnt.filter(t => {
        const indice = t.fields?.['Indice']
        return typeof indice === 'number' && indice > cortIndex
      }),
    ]
    console.log(`[reset] Borrando ${aBorrar.length} turnos (promesas + post-corte)...`)
    // Airtable permite delete bulk de hasta 10 records con ?records[]=...
    const ids = aBorrar.map(t => t.id)
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10)
      const qs = chunk.map(id => `records[]=${id}`).join('&')
      const res = await fetch(`${BASE_URL}/${TABLA_TURNOS_PE}?${qs}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!res.ok) throw new Error(`delete chunk: ${res.status} ${await res.text()}`)
    }
    console.log(`[reset] ${aBorrar.length} turnos borrados.`)
  }

  console.log(`\n[reset] ✓ Plan dummy listo para re-prueba de 3.B.`)
  console.log(`[reset] Estado final: sub_bloque_actual=3.B, plan.preparativos+inventario preservados, palancas/borrador/estres/curado limpios.`)
}

main().catch(e => {
  console.error('[reset] ERROR:', e)
  process.exit(1)
})
