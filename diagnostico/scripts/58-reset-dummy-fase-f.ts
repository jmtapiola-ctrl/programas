// Reset del dummy para testing de Fase F (H7 retroactividad con control suave).
//
// Estado objetivo: paso=3, sub_bloque=3.D, sub_estado_paso='en_curso'.
// Razón: 3.D tiene material variado validado al que Juan puede pedir cambios
// retroactivos (preparativos cerrado con snapshot, inventario cerrado, palancas
// cerrado con validador, borrador aceptado). Cualquier cambio que pida sobre
// estos sub-bloques debería disparar la lógica de control suave.
//
// Preserva: plan.preparativos + plan.inventario + plan.palancas + plan.borrador
//           (con iteracion_aceptada=1) + plan.estres (con preguntas mock)
//           + paso 0/1/2 + historial hasta cierre conversacional de 3.D.
// Limpia:   plan.curado, plan.warnings_retroactivos, sub_estado_paso a 'en_curso',
//           paso_actual=3, sub_bloque_actual=3.D, auditorias_paso_3_count=0.
//
// Uso: npx tsx --env-file=.env.local diagnostico/scripts/58-reset-dummy-fase-f.ts
//
// IMPORTANTE: solo toca el dummy (recEsoKMENVQI8NUb). NUNCA el Plan Sr.

import {
  TABLA_TURNOS_PE,
  getPlanEstrategico,
  getEntrevistaPE,
  updatePlanEstrategico,
  updateEntrevistaPE,
} from '@/lib/airtable'

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
  console.log(`[reset fase-f] Plan dummy: ${PLAN_DUMMY_ID}`)

  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`[reset fase-f] Plan "${plan.nombre}" cargado.`)

  const planJson = plan.plan ?? {}
  const principal = planJson.palancas?.preguntas_principal ?? []
  const principalRespondidas = principal.filter(q => q.respuesta?.trim()).length
  if (principal.length < 5 || principalRespondidas < 5) {
    throw new Error(`Pre-check falló: necesito 5 palancas principal respondidas. Estado: ${principalRespondidas}/${principal.length}.`)
  }
  console.log(`[reset fase-f] Pre-check OK:`)
  console.log(`  - 5/5 palancas principal respondidas`)
  console.log(`  - ${planJson.palancas?.preguntas_validador?.length ?? 0} palancas validador respondidas`)
  console.log(`  - ${planJson.borrador?.iteraciones?.length ?? 0} iteración(es) de borrador (aceptada=${planJson.borrador?.iteracion_aceptada ?? '—'})`)
  console.log(`  - ${planJson.estres?.preguntas?.length ?? 0} preguntas de estrés`)
  console.log(`  - Limpiando: curado=${!!planJson.curado}, warnings_retroactivos=${planJson.warnings_retroactivos?.length ?? 0}`)

  // Conservar todo excepto curado + warnings_retroactivos.
  const { curado: _c, warnings_retroactivos: _w, ...resto } = planJson
  const planActualizado = {
    ...resto,
    // Asegurar borrador tiene iteracion_aceptada — el modelo lo usa para saber
    // que el borrador es material validado al cual el user podría querer
    // cambios retroactivos.
    borrador: planJson.borrador ? {
      ...planJson.borrador,
      iteracion_aceptada: planJson.borrador.iteracion_aceptada ?? (planJson.borrador.iteraciones?.length ? planJson.borrador.iteraciones[planJson.borrador.iteraciones.length - 1].numero : undefined),
    } : undefined,
  }
  await updatePlanEstrategico(PLAN_DUMMY_ID, { plan: planActualizado as any })
  console.log(`[reset fase-f] Plan persistido — curado/warnings_retroactivos limpios.`)

  const entrevista = await getEntrevistaPE(PLAN_DUMMY_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada.')

  // Reset entrevista a estado conversacional limpio en 3.D.
  await updateEntrevistaPE(entrevista.id!, {
    sub_bloque_actual: '3.D',
    paso_actual: 3,
    sub_estado_paso: 'en_curso',
    auditorias_paso_3_count: 0,
  })
  console.log(`[reset fase-f] Entrevista actualizada — paso=3, sub_bloque=3.D, sub_estado=en_curso, auditorias_paso_3_count=0.`)

  // Borrar turnos posteriores al cierre conversacional de 3.D (incluye los
  // turnos de aceptación curado, audit, mensajes [Sistema], etc.).
  // Heurística: el último turno del modelo de paso=3 cerrando 3.D contiene
  // típicamente "ya estresamos lo suficiente" o "vamos a curar" o
  // "Avanzamos a 3.E". Tomamos el último que matchee.
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
  console.log(`[reset fase-f] Turnos en la entrevista: ${turnosEnt.length}`)

  // Patron de cierre 3.D conversacional.
  const CIERRE_3D_RE = /ya estresamos|vamos a curar|Avanzamos a 3\.E|3\.D.*cerr|cerramos.*3\.D/i
  let indiceCorte = -1
  for (const t of turnosEnt) {
    const rol = t.fields?.['Rol']
    const paso = t.fields?.['Paso']
    const contenido: string = t.fields?.['Contenido'] ?? ''
    const indice = t.fields?.['Indice']
    if (rol === 'model' && paso === 3 && typeof indice === 'number' && CIERRE_3D_RE.test(contenido) && indice > indiceCorte) {
      indiceCorte = indice
    }
  }
  console.log(`[reset fase-f] Cierre conversacional 3.D detectado en índice: ${indiceCorte}`)

  if (indiceCorte === -1) {
    console.log(`[reset fase-f] WARNING: no encontré marca de cierre 3.D. Conservando todos los turnos. El user puede igualmente probar.`)
  } else {
    const aBorrar = turnosEnt.filter(t => {
      const indice = t.fields?.['Indice']
      return typeof indice === 'number' && indice > indiceCorte
    })
    console.log(`[reset fase-f] Turnos post-cierre 3.D a borrar: ${aBorrar.length}`)
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
      console.log(`[reset fase-f] ${aBorrar.length} turnos borrados.`)
    }
  }

  console.log(`\n[reset fase-f] ✓ Dummy listo para testing Fase F.`)
  console.log(`[reset fase-f] Estado: paso=3, sub_bloque=3.D, material validado disponible (0+1+2+3.0+3.A+3.B+3.C+3.D parciales).`)
  console.log(`[reset fase-f] Para probar:`)
  console.log(`  1. Recargá la entrevista en browser.`)
  console.log(`  2. Tipeá un cambio retroactivo. Ejemplos:`)
  console.log(`     a) No estructural: "ojo, en 3.0 el responsable de RRHH era Vicky con tilde"`)
  console.log(`        → modelo debería aplicar directo sin modal.`)
  console.log(`     b) Estructural en validado: "el desvío principal del Paso 2 era cobertura técnica, no falta de capacidad QA"`)
  console.log(`        → modelo debería detectar + emitir cambio_retroactivo + modal aparece.`)
}

main().catch(e => {
  console.error('[reset fase-f] ERROR:', e)
  process.exit(1)
})
