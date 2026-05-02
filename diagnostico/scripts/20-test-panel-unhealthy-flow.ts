// Simula el flow del contador "3 turnos seguidos sin PANEL_UPDATE válido"
// usando una entrevista de prueba (creada y borrada in-line).
//
// Arma 3 escenarios:
//   1. Turno con PANEL_UPDATE OK → contador se resetea a 0, ultimo_panel_update_ok se actualiza.
//   2. Turno SIN PANEL_UPDATE (no_block + retry falla) → contador sube a 1, no dispara aún.
//   3. Tras 3 turnos sin PANEL_UPDATE → contador llega a 3, panel_unhealthy debería dispararse.
//
// NO toca el Plan Sr de Terravinci — usa una entrevista temporal para no contaminar.

import {
  createPlanEstrategico,
  createEntrevistaPE,
  updateEntrevistaPE,
  getEntrevistaPE,
} from '@/lib/airtable'

const TABLA_PLANES_PE = 'tblPJC1VMQclfCqc7'
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✔ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++ }
}

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY

async function deleteRecord(table: string, id: string) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${table}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  if (!r.ok) throw new Error(`Delete ${table}/${id}: ${r.status}`)
}

async function main() {
  console.log('═'.repeat(72))
  console.log('SIMULACIÓN: flow del contador panel_unhealthy + campo Ultimo Panel Update OK')
  console.log('═'.repeat(72))
  console.log()

  // 1. Crear plan + entrevista temporales
  const plan = await createPlanEstrategico({
    nombre: '__TEST_PANEL_UNHEALTHY__',
    tipo: 'Sr',
    responsable_id: 'reczcjwNE4PVLxjVF', // mismo responsable que el Plan Sr Terravinci (real)
  })
  console.log(`Plan temporal creado: ${plan.id}`)

  const entrevista = await createEntrevistaPE(plan.id)
  console.log(`Entrevista temporal creada: ${entrevista.id}`)
  console.log()

  try {
    // ────────────────────────────────────────────────────────────────────
    // Paso 1 — Estado inicial
    // ────────────────────────────────────────────────────────────────────
    console.log('Paso 1 — Estado inicial')
    const e0 = await getEntrevistaPE(plan.id)
    check('contador inicial = 0', (e0?.turnos_sin_panel_consecutivos ?? 0) === 0)
    check('retries iniciales = 0', (e0?.retries_panel_update_acumulados ?? 0) === 0)
    check('ultimo_panel_update_ok = undefined', e0?.ultimo_panel_update_ok === undefined)

    // ────────────────────────────────────────────────────────────────────
    // Paso 2 — Simular turno OK: contador → 0, ultimo_ok se setea
    // ────────────────────────────────────────────────────────────────────
    console.log()
    console.log('Paso 2 — Simulación de turno con PANEL_UPDATE OK')
    const ahora1 = new Date().toISOString()
    await updateEntrevistaPE(entrevista.id, {
      turnos_sin_panel_consecutivos: 0,
      retries_panel_update_acumulados: 0,
      ultimo_panel_update_ok: ahora1,
    })
    const e1 = await getEntrevistaPE(plan.id)
    check('contador permanece en 0', (e1?.turnos_sin_panel_consecutivos ?? -1) === 0)
    check('ultimo_panel_update_ok actualizado', e1?.ultimo_panel_update_ok === ahora1)

    // ────────────────────────────────────────────────────────────────────
    // Paso 3 — Simular 3 turnos seguidos sin PANEL_UPDATE → contador = 3 → trigger
    // ────────────────────────────────────────────────────────────────────
    console.log()
    console.log('Paso 3 — Simulación de 3 turnos sin PANEL_UPDATE (cada uno con retry disparado)')
    let counter = 0
    let retries = 0
    for (let turno = 1; turno <= 3; turno++) {
      counter += 1
      retries += 1 // cada turno fallido dispara un retry
      await updateEntrevistaPE(entrevista.id, {
        turnos_sin_panel_consecutivos: counter,
        retries_panel_update_acumulados: retries,
        // ultimo_panel_update_ok NO se actualiza (porque falló)
      })
      const ev = await getEntrevistaPE(plan.id)
      const triggerEsperado = counter >= 3
      console.log(`  Turno ${turno}: contador=${ev?.turnos_sin_panel_consecutivos} retries=${ev?.retries_panel_update_acumulados} → trigger=${triggerEsperado ? 'SÍ' : 'no'}`)
      check(`     turno ${turno}: contador persistido correctamente`, ev?.turnos_sin_panel_consecutivos === counter)
      check(`     turno ${turno}: retries persistidos correctamente`, ev?.retries_panel_update_acumulados === retries)
    }

    // ────────────────────────────────────────────────────────────────────
    // Paso 4 — Recuperación: turno OK después de los 3 fallidos → contador → 0
    // ────────────────────────────────────────────────────────────────────
    console.log()
    console.log('Paso 4 — Simulación de recuperación (turno OK después de 3 fallidos)')
    const ahora4 = new Date().toISOString()
    await updateEntrevistaPE(entrevista.id, {
      turnos_sin_panel_consecutivos: 0, // reset porque el turno fue OK
      retries_panel_update_acumulados: retries, // retries acumulados se mantienen
      ultimo_panel_update_ok: ahora4,
    })
    const e4 = await getEntrevistaPE(plan.id)
    check('contador reseteado a 0', e4?.turnos_sin_panel_consecutivos === 0)
    check('retries acumulados se mantienen', e4?.retries_panel_update_acumulados === retries)
    check('ultimo_panel_update_ok actualizado', e4?.ultimo_panel_update_ok === ahora4)
  } finally {
    // Cleanup
    console.log()
    console.log('Cleanup — borrando entrevista y plan temporales')
    await deleteRecord(TABLA_ENTREVISTAS_PE, entrevista.id)
    await deleteRecord(TABLA_PLANES_PE, plan.id)
    console.log('  ✔ Borrados')
  }

  console.log()
  console.log('═'.repeat(72))
  console.log(`RESULTADO: ${pass} passed, ${fail} failed`)
  console.log('═'.repeat(72))
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
