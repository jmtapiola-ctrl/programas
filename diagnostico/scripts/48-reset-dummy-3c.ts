// Reset del plan dummy `recEsoKMENVQI8NUb` al estado "post-3.B, listo para 3.C".
//
// Mantiene: plan.preparativos + plan.inventario + plan.palancas (con 5 preguntas
// principal respondidas + N validador respondidas) + Paso 0/1/2 completos.
// Limpia: plan.borrador, plan.estres, plan.curado.
// Setea: entrevista.sub_bloque_actual = '3.C'.
// Borra: turnos posteriores al cierre conversacional del 3.B (último turno del
//        modelo que cierra el bloque "Tengo las 5 respuestas..." + cualquier
//        turno conversacional posterior).
//
// Uso: npx tsx --env-file=.env.local diagnostico/scripts/48-reset-dummy-3c.ts
//
// IMPORTANTE: solo toca el plan dummy (recEsoKMENVQI8NUb), NUNCA el Plan Sr
// (recFMWxoE5gTQQrf7). IDs hardcoded.

import {
  TABLA_TURNOS_PE,
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
} from '../../lib/airtable'

const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'
const PLAN_SR_ID = 'recFMWxoE5gTQQrf7' // sanity check — nunca tocar

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
  console.log(`[reset 3c] Plan dummy: ${PLAN_DUMMY_ID}`)

  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`[reset 3c] Plan "${plan.nombre}" cargado.`)
  if (plan.id !== PLAN_DUMMY_ID) {
    throw new Error(`Plan ID mismatch: esperado ${PLAN_DUMMY_ID}, recibido ${plan.id}`)
  }

  const planJson = plan.plan ?? {}
  // Validar que tenemos lo necesario para arrancar 3.C
  const principal = planJson.palancas?.preguntas_principal ?? []
  const principalRespondidas = principal.filter(q => q.respuesta?.trim()).length
  if (principal.length < 5 || principalRespondidas < 5) {
    throw new Error(`No se puede reset a 3.C sin 5 preguntas_principal respondidas. Estado: ${principalRespondidas}/${principal.length}.`)
  }
  console.log(`[reset 3c] Pre-check OK: ${principalRespondidas}/5 palancas principal respondidas, ${planJson.palancas?.preguntas_validador?.length ?? 0} validador.`)

  const conservar = {
    ...(planJson.preparativos ? { preparativos: planJson.preparativos } : {}),
    ...(planJson.inventario ? { inventario: planJson.inventario } : {}),
    ...(planJson.palancas ? { palancas: planJson.palancas } : {}),
  }
  console.log(`[reset 3c] Limpiando: borrador=${!!planJson.borrador}, estres=${!!planJson.estres}, curado=${!!planJson.curado}`)
  await updatePlanEstrategico(PLAN_DUMMY_ID, { plan: conservar as any })
  console.log(`[reset 3c] Plan persistido — borrador/estres/curado limpios. Preparativos + inventario + palancas preservados.`)

  const entrevista = await getEntrevistaPE(PLAN_DUMMY_ID)
  if (!entrevista) {
    throw new Error(`Entrevista no encontrada para plan ${PLAN_DUMMY_ID}.`)
  }
  await updateEntrevistaPE(entrevista.id!, { sub_bloque_actual: '3.C', paso_actual: 3 })
  console.log(`[reset 3c] Entrevista actualizada — sub_bloque_actual=3.C, paso_actual=3.`)

  // Borrar turnos conversacionales posteriores al cierre del 3.B principal.
  // Heurística: buscar el primer turno del modelo (rol='model', paso=3) que
  // contenga "Tengo las 5 respuestas" o "voy a hacer una revisión de control"
  // — ese es el cierre canónico del 3.B principal antes del validador.
  // Todo lo posterior a ese turno se borra (incluye los turnos post-validador
  // que se pudieron pollutar con loops "esperando validador").
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
  const turnosEnt = allTurnos.filter(r => {
    const ent: string[] = r.fields?.['Entrevista'] ?? []
    return ent.includes(entrevista.id!)
  })
  console.log(`[reset 3c] Turnos en la entrevista: ${turnosEnt.length}`)

  // Buscar el último turno con paso=3 que contenga el cierre canónico del 3.B.
  // Si el user re-corrió 3.B varias veces, queremos el ÚLTIMO cierre.
  const CIERRE_3B_RE = /Tengo las 5 respuestas|revisi[oó]n de control|preguntas?\s+complementarias?/i
  let indiceCierre3B = -1
  for (const t of turnosEnt) {
    const rol = t.fields?.['Rol']
    const paso = t.fields?.['Paso']
    const contenido: string = t.fields?.['Contenido'] ?? ''
    const indice = t.fields?.['Indice']
    if (rol === 'model' && paso === 3 && typeof indice === 'number' && CIERRE_3B_RE.test(contenido) && indice > indiceCierre3B) {
      indiceCierre3B = indice
    }
  }
  console.log(`[reset 3c] Cierre del 3.B detectado en índice: ${indiceCierre3B}`)

  if (indiceCierre3B === -1) {
    console.log(`[reset 3c] WARNING: no encontré marca de cierre 3.B en el historial. No se borran turnos.`)
  } else {
    const aBorrar = turnosEnt.filter(t => {
      const indice = t.fields?.['Indice']
      return typeof indice === 'number' && indice > indiceCierre3B
    })
    console.log(`[reset 3c] Turnos post-cierre 3.B a borrar: ${aBorrar.length}`)
    if (aBorrar.length > 0) {
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
      console.log(`[reset 3c] ${aBorrar.length} turnos post-3.B borrados.`)
    }
  }

  console.log(`\n[reset 3c] ✓ Plan dummy listo para arrancar 3.C.`)
  console.log(`[reset 3c] Estado final: sub_bloque_actual=3.C, plan.preparativos+inventario+palancas preservados, borrador/estres/curado limpios.`)
  console.log(`[reset 3c]   - Movimientos activos en inventario: ${(planJson.inventario?.movimientos ?? []).filter(m => m.estado_usuario !== 'quitado').length}`)
  console.log(`[reset 3c]   - Palancas principal con respuesta: ${principalRespondidas}/5`)
  console.log(`[reset 3c]   - Palancas validador con respuesta: ${(planJson.palancas?.preguntas_validador ?? []).filter(q => q.respuesta?.trim()).length}`)
}

main().catch(e => {
  console.error('[reset 3c] ERROR:', e)
  process.exit(1)
})
