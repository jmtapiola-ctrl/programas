// Diagnóstico del último turno del modelo en 3.B:
// ¿Emitió un PANEL_UPDATE? ¿Incluyó plan.palancas.preguntas_principal con P-2?
//
// Esto es para entender el caso donde el chat dice "P-2 — ..." pero en el
// DB solo hay P-1.

import { getTurnosPE } from '@/lib/airtable'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'

async function main() {
  // getTurnosPE espera el id de la entrevista, no del plan. Pero podemos
  // obtenerlo via getEntrevistaPE. Más simple: leer turnos via fetchAll de
  // la tabla de turnos con filtro de plan_id. Skip — uso la helper.
  const { getEntrevistaPE } = await import('@/lib/airtable')
  const entrevista = await getEntrevistaPE(PLAN_SR_ID)
  if (!entrevista) { console.log('No hay entrevista para el plan.'); process.exit(1) }

  const turnos = await getTurnosPE(entrevista.id)
  // Tomamos los últimos 10 (5 user + 5 modelo aprox) para ver el patrón completo.
  const ultimos = turnos.slice(-10)
  console.log(`[diag] Total turnos: ${turnos.length}. Mostrando últimos 6.\n`)

  for (const t of ultimos) {
    console.log(`─── #${t.indice} · ${t.rol} ${t.bloque ? '· ' + t.bloque : ''} ${t.sub_bloque ? '· ' + t.sub_bloque : ''}`)
    const contenido = t.contenido || ''
    const sinHTML = contenido.replace(/<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/g, '«PANEL_UPDATE_OMITIDO»')
    console.log(`  contenido (sin PU): ${sinHTML.slice(0, 200)}${sinHTML.length > 200 ? '…' : ''}`)
    console.log(`  longitud total: ${contenido.length} chars`)
    const tienePanelUpdate = /<!--PANEL_UPDATE-->/.test(contenido)
    console.log(`  ¿tiene PANEL_UPDATE?: ${tienePanelUpdate}`)
    if (tienePanelUpdate) {
      const m = contenido.match(/<!--PANEL_UPDATE-->([\s\S]*?)<!--\/PANEL_UPDATE-->/)
      if (m) {
        try {
          const parsed = JSON.parse(m[1])
          const palancas = parsed.plan?.palancas?.preguntas_principal
          console.log(`  PANEL_UPDATE.plan.palancas.preguntas_principal: ${palancas ? `${palancas.length} preguntas` : 'undefined'}`)
          if (Array.isArray(palancas)) {
            for (const q of palancas) {
              console.log(`    - ${q.id}: modo_interaccion=${q.modo_interaccion ?? 'MISSING'}, respuesta=${q.respuesta ? 'sí' : 'no'}, respuesta_estructurada=${q.respuesta_estructurada ? 'sí' : 'no'}`)
            }
          }
          console.log(`  PANEL_UPDATE.sub_bloque_actual: ${parsed.sub_bloque_actual ?? '(no)'}`)
        } catch (e) {
          console.log(`  PANEL_UPDATE JSON parse error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    console.log('')
  }
}

main().catch(e => { console.error('[diag] FATAL:', e); process.exit(1) })
