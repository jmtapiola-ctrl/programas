// Diagnóstico post-error "no_block_persistente" en el plan dummy.
//
// Lee el estado actual del plan + entrevista + último turno del modelo y
// reporta:
//   - plan.palancas.preguntas_principal (cuántas, con qué metadata, con qué
//     respuesta, con qué respuesta_estructurada)
//   - el último turno con rol='model' completo (puede revelar si el modelo
//     emitió texto pero olvidó el bloque PANEL_UPDATE)
//   - contadores de salud: turnos_sin_panel_consecutivos, retries_acumulados,
//     ultimo_panel_update_ok
//
// Read-only, no mutaciones.

import { getPlanEstrategico, getEntrevistaPE, getTurnosPE } from '../../lib/airtable'

const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

async function main() {
  const plan = await getPlanEstrategico(PLAN_DUMMY_ID)
  console.log(`\n=== PLAN ===`)
  console.log(`ID: ${plan.id}, Nombre: "${plan.nombre}"`)

  const palancas = plan.plan?.palancas
  console.log(`\n=== plan.palancas ===`)
  if (!palancas) {
    console.log(`  (vacío)`)
  } else {
    const pp = palancas.preguntas_principal ?? []
    console.log(`  preguntas_principal: ${pp.length}`)
    pp.forEach((q, i) => {
      console.log(`\n  [${i}] id=${q.id} origen=${q.origen}`)
      console.log(`      pregunta: "${q.pregunta?.slice(0, 100)}${(q.pregunta?.length ?? 0) > 100 ? '...' : ''}"`)
      console.log(`      modo_interaccion: ${q.modo_interaccion ?? '(none)'}`)
      console.log(`      restriccion_minima: ${q.restriccion_minima ?? '?'}, restriccion_maxima: ${q.restriccion_maxima ?? '?'}`)
      console.log(`      respuesta_texto: "${q.respuesta?.slice(0, 100)}${(q.respuesta?.length ?? 0) > 100 ? '...' : ''}"`)
      console.log(`      respuesta_estructurada: ${q.respuesta_estructurada ? JSON.stringify(q.respuesta_estructurada) : '(undefined)'}`)
      console.log(`      observacion_modelo: "${q.observacion_modelo?.slice(0, 100) ?? ''}"`)
    })
    console.log(`\n  preguntas_validador: ${(palancas.preguntas_validador ?? []).length}`)
  }

  const entrevista = await getEntrevistaPE(PLAN_DUMMY_ID)
  if (!entrevista) {
    console.log('No hay entrevista.')
    return
  }
  console.log(`\n=== ENTREVISTA ===`)
  console.log(`paso_actual: ${entrevista.paso_actual}, sub_bloque_actual: ${entrevista.sub_bloque_actual}`)
  console.log(`sub_estado_paso: ${entrevista.sub_estado_paso}`)
  console.log(`turnos_sin_panel_consecutivos: ${entrevista.turnos_sin_panel_consecutivos}`)
  console.log(`retries_panel_update_acumulados: ${entrevista.retries_panel_update_acumulados}`)
  console.log(`ultimo_panel_update_ok: ${entrevista.ultimo_panel_update_ok}`)

  console.log(`\n=== TURNOS ===`)
  const turnos = await getTurnosPE(entrevista.id!)
  console.log(`Total turnos: ${turnos.length}`)
  // Últimos 6 turnos
  const ult = turnos.slice(-6)
  for (const t of ult) {
    const head = `[paso=${t.paso}|rol=${t.rol}]`
    const c = t.contenido ?? ''
    const tienePanel = /<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/.test(c)
    console.log(`\n${head} (${c.length} chars) PANEL_UPDATE_in_content=${tienePanel}`)
    console.log(`  ${c.slice(0, 200).replace(/\n/g, ' ⏎ ')}${c.length > 200 ? '...' : ''}`)
    if (t.rol === 'model') {
      // Buscar al final si tiene marca de cierre del bloque
      const fin = c.slice(-300)
      console.log(`  TAIL(últimos 300): ${fin.replace(/\n/g, ' ⏎ ')}`)
    }
  }
}

main().catch(e => {
  console.error('ERROR:', e)
  process.exit(1)
})
