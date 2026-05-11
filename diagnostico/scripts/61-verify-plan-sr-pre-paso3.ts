// Verificación pre-arranque Paso 3 sobre Plan Sr Terravinci real.
//
// IMPORTANTE: este script SOLO LEE. NO escribe nada. Si encuentra desviación
// del estado esperado, reporta — Augusto decide qué limpiar manualmente con
// el OK del usuario.
//
// Plan target: recFMWxoE5gTQQrf7 (Plan Sr Terravinci).
// NO el dummy recEsoKMENVQI8NUb.
//
// Estado esperado para arrancar Paso 3 limpio:
//   - paso_actual = 3
//   - sub_bloque_actual = '3.0'
//   - sub_estado_paso = 'en_curso'
//   - plan.* sin preparativos/inventario/palancas/borrador/estres/curado/warnings_retroactivos
//   - Turnos_PE: solo Pasos 0/1/2 + snapshots de cierre. Sin turnos huérfanos de Paso 3.

import { getPlanEstrategico, getEntrevistaPE, getTurnosPE, getReviewerTurnos } from '@/lib/airtable'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'  // sanity check — NUNCA confundirlos

async function main() {
  if ((PLAN_SR_ID as string) === (PLAN_DUMMY_ID as string)) {
    throw new Error('Sanity check fail: PLAN_SR_ID === PLAN_DUMMY_ID. Abort.')
  }
  console.log(`[verify Plan Sr] Plan target: ${PLAN_SR_ID}`)
  console.log(`[verify Plan Sr] (NOT touching dummy: ${PLAN_DUMMY_ID})\n`)

  const plan = await getPlanEstrategico(PLAN_SR_ID)
  console.log(`Plan cargado: "${plan.nombre}" (tipo=${plan.tipo})`)
  if (plan.id !== PLAN_SR_ID) {
    throw new Error(`Plan ID mismatch: esperado ${PLAN_SR_ID}, recibido ${plan.id}`)
  }

  const entrevista = await getEntrevistaPE(PLAN_SR_ID)
  if (!entrevista) {
    console.log('❌ Entrevista no encontrada.')
    return
  }

  console.log(`\n=== ENTREVISTA ===`)
  console.log(`  id: ${entrevista.id}`)
  console.log(`  paso_actual: ${entrevista.paso_actual}`)
  console.log(`  sub_bloque_actual: ${entrevista.sub_bloque_actual}`)
  console.log(`  sub_estado_paso: ${entrevista.sub_estado_paso}`)
  console.log(`  total turnos en historial: ${entrevista.historial?.length ?? 0}`)

  // Validar shape esperado.
  const issues: string[] = []
  if (entrevista.paso_actual !== 3) issues.push(`paso_actual=${entrevista.paso_actual} (esperado: 3)`)
  if (entrevista.sub_bloque_actual !== '3.0') issues.push(`sub_bloque_actual='${entrevista.sub_bloque_actual}' (esperado: '3.0')`)
  if (entrevista.sub_estado_paso !== 'en_curso') issues.push(`sub_estado_paso='${entrevista.sub_estado_paso}' (esperado: 'en_curso')`)

  console.log(`\n=== PASOS 0/1/2 (NO TOCAR) ===`)
  console.log(`  proposito: ${plan.proposito?.escena ? '✓ poblado' : '⚠ vacío'}`)
  console.log(`  situacion: ${plan.situacion?.desvio_principal ? '✓ poblado' : '⚠ vacío'}`)
  console.log(`  datos_faltantes: ${plan.datos_faltantes?.length ?? 0} items`)

  console.log(`\n=== PLAN PASO 3 (debe estar vacío) ===`)
  const p3 = plan.plan
  console.log(`  preparativos: ${p3?.preparativos ? '⚠ poblado' : '✓ vacío'}`)
  console.log(`  inventario:   ${p3?.inventario?.movimientos?.length ? `⚠ ${p3.inventario.movimientos.length} movs` : '✓ vacío'}`)
  console.log(`  palancas:     ${(p3?.palancas?.preguntas_principal?.length ?? 0) > 0 ? `⚠ ${p3?.palancas?.preguntas_principal?.length} preguntas_principal` : '✓ vacío'}`)
  console.log(`  borrador:     ${(p3?.borrador?.iteraciones?.length ?? 0) > 0 ? `⚠ ${p3?.borrador?.iteraciones?.length} iteraciones` : '✓ vacío'}`)
  console.log(`  estres:       ${(p3?.estres?.preguntas?.length ?? 0) > 0 ? `⚠ ${p3?.estres?.preguntas?.length} preguntas` : '✓ vacío'}`)
  console.log(`  curado:       ${p3?.curado ? '⚠ poblado' : '✓ vacío'}`)
  console.log(`  warnings_retroactivos: ${(p3?.warnings_retroactivos?.length ?? 0) > 0 ? `⚠ ${p3?.warnings_retroactivos?.length} warnings` : '✓ vacío'}`)

  if (p3?.preparativos) issues.push('plan.preparativos poblado')
  if (p3?.inventario?.movimientos?.length) issues.push(`plan.inventario con ${p3.inventario.movimientos.length} movimientos`)
  if ((p3?.palancas?.preguntas_principal?.length ?? 0) > 0) issues.push(`plan.palancas con ${p3?.palancas?.preguntas_principal?.length} preguntas`)
  if ((p3?.borrador?.iteraciones?.length ?? 0) > 0) issues.push(`plan.borrador con ${p3?.borrador?.iteraciones?.length} iteraciones`)
  if ((p3?.estres?.preguntas?.length ?? 0) > 0) issues.push(`plan.estres con ${p3?.estres?.preguntas?.length} preguntas`)
  if (p3?.curado) issues.push('plan.curado poblado')
  if ((p3?.warnings_retroactivos?.length ?? 0) > 0) issues.push(`plan.warnings_retroactivos con ${p3?.warnings_retroactivos?.length} entries`)

  // Turnos de la entrevista
  console.log(`\n=== TURNOS DE LA ENTREVISTA ===`)
  const allTurnos = await getTurnosPE(entrevista.id)
  console.log(`  total: ${allTurnos.length}`)
  const porPaso: Record<string, { user: number; model: number; reviewer: number; snapshot: number }> = {}
  for (const t of allTurnos) {
    const k = String(t.paso ?? '?')
    if (!porPaso[k]) porPaso[k] = { user: 0, model: 0, reviewer: 0, snapshot: 0 }
    porPaso[k][t.rol as keyof typeof porPaso[string]] = (porPaso[k][t.rol as keyof typeof porPaso[string]] ?? 0) + 1
  }
  for (const [paso, counts] of Object.entries(porPaso).sort()) {
    console.log(`  paso=${paso}: user=${counts.user}, model=${counts.model}, reviewer=${counts.reviewer}, snapshot=${counts.snapshot}`)
  }

  // Detectar turnos huérfanos de Paso 3 — no debería haber ninguno todavía.
  const turnosPaso3 = allTurnos.filter(t => t.paso === 3)
  if (turnosPaso3.length > 0) {
    console.log(`\n  ⚠ ${turnosPaso3.length} turnos de paso=3 detectados:`)
    for (const t of turnosPaso3.slice(0, 10)) {
      console.log(`    idx=${(t as any).indice ?? '?'} rol=${t.rol} "${(t.contenido ?? '').slice(0, 80)}..."`)
    }
    if (turnosPaso3.length > 10) console.log(`    ... y ${turnosPaso3.length - 10} más.`)
    issues.push(`${turnosPaso3.length} turnos de paso=3 (esperado: 0 — Paso 3 todavía no arrancó)`)
  }

  // Reviewer turnos (audit-reviewer)
  console.log(`\n=== REVIEWER TURNOS (audit) ===`)
  const [rev1, rev2, rev3] = await Promise.all([
    getReviewerTurnos(entrevista.id, 1),
    getReviewerTurnos(entrevista.id, 2),
    getReviewerTurnos(entrevista.id, 3),
  ])
  console.log(`  paso 1: ${rev1.length} turnos reviewer`)
  console.log(`  paso 2: ${rev2.length} turnos reviewer`)
  console.log(`  paso 3: ${rev3.length} turnos reviewer ${rev3.length > 0 ? '⚠ NO ESPERADO' : '✓'}`)
  if (rev3.length > 0) issues.push(`${rev3.length} reviewer turnos de paso=3 (esperado: 0)`)

  console.log(`\n=== COUNTERS DE AUDIT ===`)
  console.log(`  auditorias_paso_1_count: ${entrevista.auditorias_paso_1_count ?? 0}`)
  console.log(`  auditorias_paso_2_count: ${entrevista.auditorias_paso_2_count ?? 0}`)
  console.log(`  auditorias_paso_3_count: ${entrevista.auditorias_paso_3_count ?? 0} ${(entrevista.auditorias_paso_3_count ?? 0) > 0 ? '⚠' : '✓'}`)
  if ((entrevista.auditorias_paso_3_count ?? 0) > 0) issues.push(`auditorias_paso_3_count=${entrevista.auditorias_paso_3_count} (esperado: 0)`)

  // ─── VEREDICTO ────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(72)}`)
  if (issues.length === 0) {
    console.log(`✓ PLAN SR LISTO PARA ARRANCAR PASO 3`)
    console.log(`${'═'.repeat(72)}`)
    console.log(`  Estado limpio — Juan puede arrancar la entrevista en browser.`)
  } else {
    console.log(`⚠ DESVIACIONES DETECTADAS (${issues.length}):`)
    console.log(`${'═'.repeat(72)}`)
    for (const i of issues) console.log(`  - ${i}`)
    console.log(`\nAugusto debe limpiar manualmente con OK del usuario antes de avanzar.`)
  }
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
