// Diagnóstico: ¿por qué no se abre el panel interactivo en 3.B del Plan Sr?
//
// Lee plan.plan.palancas.preguntas_principal del Plan Sr y reporta cada
// pregunta: id, pregunta (snippet), respuesta (snippet), si tiene
// modo_interaccion + campos_a_mostrar + instruccion_panel (que son lo que
// gatea el render del panel lateral en entrevista/page.tsx:1456).
//
// Output esperado (caso bug): última pregunta tiene id="P-1", pregunta poblada,
// respuesta vacía, modo_interaccion=undefined. Significa que Opus emitió la
// pregunta pero no la metadata del panel.

import { getPlanEstrategico, getEntrevistaPE } from '@/lib/airtable'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'

async function main() {
  const [plan, entrevista] = await Promise.all([
    getPlanEstrategico(PLAN_SR_ID),
    getEntrevistaPE(PLAN_SR_ID),
  ])

  console.log('[diag] sub_bloque_actual:', entrevista?.sub_bloque_actual)
  console.log('[diag] paso_actual:', entrevista?.paso_actual)

  const palancas = plan.plan?.palancas
  const principal = palancas?.preguntas_principal ?? []
  console.log(`\n[diag] preguntas_principal: ${principal.length} preguntas\n`)

  for (const q of principal) {
    console.log(`─── ${q.id} (origen=${q.origen}) ────────────────────────`)
    console.log(`pregunta: ${q.pregunta.slice(0, 120)}${q.pregunta.length > 120 ? '…' : ''}`)
    console.log(`respuesta: ${q.respuesta ? q.respuesta.slice(0, 60) + '…' : '(vacía)'}`)
    console.log(`modo_interaccion: ${q.modo_interaccion ?? '⚠ MISSING'}`)
    console.log(`campos_a_mostrar: ${JSON.stringify(q.campos_a_mostrar ?? '⚠ MISSING')}`)
    console.log(`instruccion_panel: ${q.instruccion_panel ?? '⚠ MISSING'}`)
    console.log(`restriccion_minima: ${q.restriccion_minima ?? '(none)'}`)
    console.log(`restriccion_maxima: ${q.restriccion_maxima ?? '(none)'}`)
    console.log(`respuesta_estructurada: ${q.respuesta_estructurada ? '(presente)' : '(vacía)'}`)
    console.log('')
  }

  // ¿Cuál es la última y por qué el panel decide no abrirse?
  const ultima = principal[principal.length - 1]
  if (!ultima) {
    console.log('\n[diag] CONCLUSIÓN: no hay preguntas todavía — Opus aún no emitió P-1.')
    return
  }
  const tienePanel = ultima.modo_interaccion || ultima.respuesta_estructurada
  console.log('\n[diag] Última pregunta:', ultima.id)
  if (tienePanel) {
    console.log('[diag] ✓ Tiene metadata del panel → debería renderizarse.')
    console.log('[diag] Si NO se ve, el problema está del lado del cliente (state stale, sub_bloque incorrecto).')
  } else {
    console.log('[diag] ⚠ FALTA metadata del panel (modo_interaccion + campos_a_mostrar + instruccion_panel).')
    console.log('[diag] Opus emitió la pregunta de texto pero NO el bloque interactivo. Bug del modelo.')
    console.log('\n[diag] FIX MANUAL sugerido: pedirle al modelo en el chat:')
    console.log('       "Re-emití P-1 con el panel interactivo completo: modo_interaccion=\'seleccion_unica\',')
    console.log('        campos_a_mostrar=[\'nombre\',\'que_resuelve\',\'banda_ancha\',\'dueno\',\'cantidad_precondiciones\',\'cantidad_desbloqueos\'],')
    console.log('        instruccion_panel=\'Iluminá la ficha que considerás la palanca primaria\',')
    console.log('        restriccion_minima=1, restriccion_maxima=1."')
  }
}

main().catch(e => { console.error('[diag] FATAL:', e); process.exit(1) })
