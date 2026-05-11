// Reset del plan dummy `recEsoKMENVQI8NUb` al estado "post-3.C, listo para 3.D".
//
// Mantiene: plan.preparativos + plan.inventario + plan.palancas (con 5 ppal +
// validador respondidos) + plan.borrador (con iteracion_aceptada) + Pasos 0/1/2.
// Limpia: plan.estres, plan.curado.
// Setea: entrevista.sub_bloque_actual = '3.D'.
// Borra: turnos posteriores al cierre de 3.C (aceptación del borrador).
//
// Uso: npx tsx --env-file=.env.local diagnostico/scripts/50-reset-dummy-3d.ts
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
const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'

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
  console.log(`[reset 3d] Plan dummy: ${PLAN_DUMMY_ID}`)

  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`[reset 3d] Plan "${plan.nombre}" cargado.`)
  if (plan.id !== PLAN_DUMMY_ID) {
    throw new Error(`Plan ID mismatch: esperado ${PLAN_DUMMY_ID}, recibido ${plan.id}`)
  }

  const planJson = plan.plan ?? {}
  const principal = planJson.palancas?.preguntas_principal ?? []
  const principalRespondidas = principal.filter(q => q.respuesta?.trim()).length
  const iteraciones = planJson.borrador?.iteraciones ?? []
  const iteracionAceptada = planJson.borrador?.iteracion_aceptada
  if (principal.length < 5 || principalRespondidas < 5) {
    throw new Error(`No se puede reset a 3.D sin 5 palancas principal respondidas. Estado: ${principalRespondidas}/${principal.length}.`)
  }
  if (iteraciones.length === 0) {
    console.log(`[reset 3d] WARNING: no hay iteraciones de borrador. Reset 3.D igual avanza, pero el modelo va a estar limitado para estresar sin borrador.`)
  }
  console.log(`[reset 3d] Pre-check OK:`)
  console.log(`  - ${principalRespondidas}/5 palancas principal respondidas`)
  console.log(`  - ${planJson.palancas?.preguntas_validador?.length ?? 0} palancas validador respondidas`)
  console.log(`  - ${iteraciones.length} iteración(es) de borrador (aceptada=${iteracionAceptada ?? 'ninguna'})`)

  const conservar = {
    ...(planJson.preparativos ? { preparativos: planJson.preparativos } : {}),
    ...(planJson.inventario ? { inventario: planJson.inventario } : {}),
    ...(planJson.palancas ? { palancas: planJson.palancas } : {}),
    ...(planJson.borrador ? {
      borrador: {
        ...planJson.borrador,
        // Si no hay iteracion_aceptada, marcamos la última para que el modelo
        // sepa cuál es el borrador "vigente" en 3.D.
        iteracion_aceptada: iteracionAceptada ?? (iteraciones.length > 0 ? iteraciones[iteraciones.length - 1].numero : undefined),
      },
    } : {}),
  }
  console.log(`[reset 3d] Limpiando: estres=${!!planJson.estres}, curado=${!!planJson.curado}`)
  await updatePlanEstrategico(PLAN_DUMMY_ID, { plan: conservar as any })
  console.log(`[reset 3d] Plan persistido — estres/curado limpios. Resto preservado.`)

  const entrevista = await getEntrevistaPE(PLAN_DUMMY_ID)
  if (!entrevista) {
    throw new Error(`Entrevista no encontrada para plan ${PLAN_DUMMY_ID}.`)
  }
  await updateEntrevistaPE(entrevista.id!, { sub_bloque_actual: '3.D', paso_actual: 3 })
  console.log(`[reset 3d] Entrevista actualizada — sub_bloque_actual=3.D, paso_actual=3.`)

  // Borrar turnos posteriores al cierre conversacional de 3.C (cuando el user
  // aceptó la iteración → el chat recibe "[Sistema] Acepté la iteración..."
  // y el modelo arranca 3.D). Heurística: buscar el último turno user que
  // contenga "Acepté la iteración del borrador" — todo lo posterior se borra.
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
  console.log(`[reset 3d] Turnos en la entrevista: ${turnosEnt.length}`)

  // Detectar el [Sistema] message inyectado por handleAceptarBorrador. Si
  // existe, lo borramos JUNTO con todo lo que vino después. Razón: ese turno
  // es un side-effect técnico del click "Aceptar borrador" — no es contenido
  // conversacional real que el user quiera ver. Sin esto, al recargar Juan ve
  // su propio "[Sistema] Acepté..." como último turno y le confunde el flow.
  const SISTEMA_ACEPTE_RE = /\[Sistema\][\s\S]*Acept[eé] la iteraci[oó]n del borrador/i
  let indiceCorte = -1
  for (const t of turnosEnt) {
    const rol = t.fields?.['Rol']
    const contenido: string = t.fields?.['Contenido'] ?? ''
    const indice = t.fields?.['Indice']
    if (rol === 'user' && typeof indice === 'number' && SISTEMA_ACEPTE_RE.test(contenido) && indice > indiceCorte) {
      indiceCorte = indice
    }
  }
  console.log(`[reset 3d] Mensaje [Sistema] Acepté detectado en índice: ${indiceCorte}`)

  if (indiceCorte === -1) {
    console.log(`[reset 3d] No hay mensaje [Sistema] Acepté — buscando cierre conversacional alternativo.`)
    // Fallback: buscar última mención conversacional de aceptación.
    const CIERRE_3C_FALLBACK_RE = /borrador acept|avanzar a 3\.D/i
    for (const t of turnosEnt) {
      const paso = t.fields?.['Paso']
      const contenido: string = t.fields?.['Contenido'] ?? ''
      const indice = t.fields?.['Indice']
      if (paso === 3 && typeof indice === 'number' && CIERRE_3C_FALLBACK_RE.test(contenido) && indice > indiceCorte) {
        indiceCorte = indice + 1  // +1 porque queremos borrar DESPUÉS de este turno
      }
    }
  }

  if (indiceCorte === -1) {
    console.log(`[reset 3d] WARNING: no encontré punto de corte. Conservando todos los turnos.`)
  } else {
    // Borrar el turno del corte (si es [Sistema]) Y todo lo posterior.
    const aBorrar = turnosEnt.filter(t => {
      const indice = t.fields?.['Indice']
      return typeof indice === 'number' && indice >= indiceCorte
    })
    console.log(`[reset 3d] Turnos a borrar (incluye [Sistema] si existía): ${aBorrar.length}`)
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
      console.log(`[reset 3d] ${aBorrar.length} turnos borrados.`)
    }
  }

  console.log(`\n[reset 3d] ✓ Plan dummy listo para arrancar 3.D.`)
  console.log(`[reset 3d] Estado final: sub_bloque_actual=3.D, plan.preparativos+inventario+palancas+borrador preservados, estres/curado limpios.`)
}

main().catch(e => {
  console.error('[reset 3d] ERROR:', e)
  process.exit(1)
})
