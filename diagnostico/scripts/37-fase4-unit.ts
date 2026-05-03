// Unit-tests Fase 4 — feat/audit-reviewer.
//
// Sin red, sin Airtable, sin LLM. Cobertura de la lógica pura del apply
// splitteado + diff de Pantalla 4. $0 USD, segundos de runtime.
//
// Cobertura:
//   1. splitDecisiones (reparte por tipo y filtra ignorados/sin decision)
//   2. applyErrorsDeterministicamente (busca cita textual + reemplaza, warning si no encuentra)
//   3. computeFieldsModificados (diff entre snapshot pre-apply y plan actual)
//
// Criterio: 100% de assertions pasan. Si falla, NO-GO de release de Fase 4-5.

import { splitDecisiones, applyErrorsDeterministicamente, computeFieldsModificados } from '@/lib/audit-apply'
import type { ReviewerReport, DecisionUsuario, PlanEstrategico } from '@/lib/types'

let total = 0
let pasados = 0
const fallas: string[] = []

function assertEq(label: string, actual: unknown, expected: unknown): void {
  total++
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pasados++
    console.log(`  ✅ ${label}`)
  } else {
    fallas.push(label)
    console.log(`  ❌ ${label}`)
    console.log(`       expected: ${JSON.stringify(expected)}`)
    console.log(`       actual:   ${JSON.stringify(actual)}`)
  }
}

function assertOk(label: string, cond: boolean, detail?: string): void {
  total++
  if (cond) {
    pasados++
    console.log(`  ✅ ${label}`)
  } else {
    fallas.push(label)
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function reportFixture(): ReviewerReport {
  return {
    errors: [
      { id: 'E1', tipo: 1, severidad: 'Alta', que_dice_resumen: 'foo', que_se_dijo_en_conversacion: 'bar', turno_referencia: 1, cambio_propuesto: 'baz' },
      { id: 'E2', tipo: 4, severidad: 'Media', que_dice_resumen: 'qux', que_se_dijo_en_conversacion: 'quux', turno_referencia: 2, cambio_propuesto: 'corge' },
      { id: 'E3', tipo: 3, severidad: 'Baja', que_dice_resumen: 'no_aprobado', que_se_dijo_en_conversacion: 'x', turno_referencia: 3, cambio_propuesto: 'y' },
    ],
    questions: [
      { id: 'Q1', categoria: 'CRITICA', pregunta: 'p1', por_que_importa: 'r1', relacion_con_plan: 'rp1', placeholder_ejemplo_respuesta: 'e1' },
      { id: 'Q2', categoria: 'RECOMENDADA', pregunta: 'p2', por_que_importa: 'r2', relacion_con_plan: 'rp2', placeholder_ejemplo_respuesta: 'e2' },
    ],
    cross_block_changes: [
      { id: 'CB1', bloque_afectado: 1, seccion_afectada: 'Propósito', severidad: 'Media', que_dice_actualmente: 'a', que_se_declaro_que_lo_modifica: 'b', turno_referencia: 4, cambio_propuesto: 'c' },
    ],
    meta: {
      errores_alta: 1, errores_media: 1, errores_baja: 1,
      preguntas_criticas: 1, preguntas_recomendadas: 1,
      cross_block_changes_total: 1,
      confianza_general: 'Alta', justificacion_confianza: 'OK',
    },
  }
}

function planFixture(overrides: Partial<PlanEstrategico> = {}): PlanEstrategico {
  return {
    id: 'rec123',
    nombre: 'Plan Test',
    area: 'Testing',
    tipo: 'Sr',
    estado: 'En entrevista',
    version: 1,
    responsable_id: 'recU',
    horizonte: 'Fin 2026',
    proposito: {
      escena: 'La escena ideal del propósito.',
      metricas: [
        { metrica: 'M1', valor_objetivo: 'objetivo viejo', valor_actual: '0' },
      ],
      fuera: [{ item: 'Cosa fuera', razon: 'foo razón' }],
      horizonte: 'Fin 2026',
      estabilidad: 'Estable.',
    },
    situacion: {
      desvio_principal: 'El desvío principal vigente.',
      desvio_cuantificado: '',
      desvios_secundarios: [],
      causa_raiz: '',
      consecuencia_6m: '',
      consecuencia_12m: '',
      recursos_actuales: '',
      recursos_faltantes: '',
      intentos_previos: '',
      resistencias: [],
    },
    datos_faltantes: ['original 1', 'original 2'],
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 1: splitDecisiones
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 1: splitDecisiones ──')

// 1.1 — Reparte por tipo + decisión.
{
  const report = reportFixture()
  const decisiones: DecisionUsuario[] = [
    { hallazgo_id: 'E1', tipo: 'error', decision: 'aprobado' },
    { hallazgo_id: 'E2', tipo: 'error', decision: 'aprobado_con_cambios', texto_editado: 'editado' },
    { hallazgo_id: 'E3', tipo: 'error', decision: 'ignorado' },
    { hallazgo_id: 'Q1', tipo: 'pregunta', decision: 'respondido', respuesta_usuario: 'resp1' },
    { hallazgo_id: 'Q2', tipo: 'pregunta', decision: 'ignorado' },
    { hallazgo_id: 'CB1', tipo: 'cross_block', decision: 'aprobado' },
  ]
  const split = splitDecisiones(decisiones, report)
  assertEq('1.1.a errorsAprobados.length === 2', split.errorsAprobados.length, 2)
  assertEq('1.1.b questionsRespondidas.length === 1', split.questionsRespondidas.length, 1)
  assertEq('1.1.c crossBlockAprobados.length === 1', split.crossBlockAprobados.length, 1)
  assertEq('1.1.d ignorados === 2 (E3 + Q2)', split.ignorados, 2)
}

// 1.2 — Decisiones faltantes (hallazgo sin decision) cuentan como ignorados.
{
  const report = reportFixture()
  const decisiones: DecisionUsuario[] = [
    { hallazgo_id: 'E1', tipo: 'error', decision: 'aprobado' },
    // E2, E3, Q1, Q2, CB1 sin decision
  ]
  const split = splitDecisiones(decisiones, report)
  assertEq('1.2.a solo 1 error aprobado', split.errorsAprobados.length, 1)
  assertEq('1.2.b 5 ignorados (los hallazgos sin decision)', split.ignorados, 5)
}

// 1.3 — Pregunta respondida con respuesta vacía NO cuenta como respondida.
{
  const report = reportFixture()
  const decisiones: DecisionUsuario[] = [
    { hallazgo_id: 'Q1', tipo: 'pregunta', decision: 'respondido', respuesta_usuario: '   ' },
  ]
  const split = splitDecisiones(decisiones, report)
  assertEq('1.3 pregunta con respuesta whitespace-only NO se incluye en questionsRespondidas',
    split.questionsRespondidas.length, 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 2: applyErrorsDeterministicamente
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 2: applyErrorsDeterministicamente ──')

// 2.1 — Sustitución exacta en escena.
{
  const plan = planFixture()
  const decisiones: DecisionUsuario[] = [{ hallazgo_id: 'E1', tipo: 'error', decision: 'aprobado' }]
  const split = splitDecisiones(decisiones, {
    ...reportFixture(),
    errors: [{ id: 'E1', tipo: 1, severidad: 'Alta',
      que_dice_resumen: 'La escena ideal del propósito.',
      que_se_dijo_en_conversacion: 'X',
      turno_referencia: 1,
      cambio_propuesto: 'La escena ideal mejorada.' }],
    questions: [], cross_block_changes: [],
    meta: { errores_alta: 1, errores_media: 0, errores_baja: 0, preguntas_criticas: 0, preguntas_recomendadas: 0, cross_block_changes_total: 0, confianza_general: 'Alta', justificacion_confianza: 'X' },
  })
  const r = applyErrorsDeterministicamente(plan, split.errorsAprobados)
  assertEq('2.1.a escena reemplazada', r.planActualizado.proposito?.escena, 'La escena ideal mejorada.')
  assertEq('2.1.b errorsAplicados === 1', r.errorsAplicados, 1)
  assertEq('2.1.c errorsNoEncontrados === 0', r.errorsNoEncontrados, 0)
  assertEq('2.1.d fieldsModificados incluye proposito.escena', r.fieldsModificados, ['proposito.escena'])
  assertEq('2.1.e plan original NO mutado', plan.proposito?.escena, 'La escena ideal del propósito.')
}

// 2.2 — Sustitución en item de array (métrica).
{
  const plan = planFixture()
  const decisiones: DecisionUsuario[] = [{ hallazgo_id: 'E1', tipo: 'error', decision: 'aprobado' }]
  const split = splitDecisiones(decisiones, {
    ...reportFixture(),
    errors: [{ id: 'E1', tipo: 4, severidad: 'Media',
      que_dice_resumen: 'objetivo viejo',
      que_se_dijo_en_conversacion: 'X',
      turno_referencia: 1,
      cambio_propuesto: 'objetivo nuevo' }],
    questions: [], cross_block_changes: [],
    meta: { errores_alta: 0, errores_media: 1, errores_baja: 0, preguntas_criticas: 0, preguntas_recomendadas: 0, cross_block_changes_total: 0, confianza_general: 'Alta', justificacion_confianza: 'X' },
  })
  const r = applyErrorsDeterministicamente(plan, split.errorsAprobados)
  assertEq('2.2.a métrica.valor_objetivo modificado', r.planActualizado.proposito?.metricas[0].valor_objetivo, 'objetivo nuevo')
  assertOk('2.2.b fieldsModificados incluye path con array index', r.fieldsModificados.some(f => /metricas\[0\]/.test(f)))
}

// 2.3 — Texto editado por user (decision aprobado_con_cambios) reemplaza el cambio_propuesto.
{
  const plan = planFixture()
  const decisiones: DecisionUsuario[] = [{
    hallazgo_id: 'E1', tipo: 'error',
    decision: 'aprobado_con_cambios',
    texto_editado: 'la versión editada por el user',
  }]
  const split = splitDecisiones(decisiones, {
    ...reportFixture(),
    errors: [{ id: 'E1', tipo: 1, severidad: 'Alta',
      que_dice_resumen: 'La escena ideal del propósito.',
      que_se_dijo_en_conversacion: 'X',
      turno_referencia: 1,
      cambio_propuesto: 'el cambio propuesto por el reviewer (ignorado)' }],
    questions: [], cross_block_changes: [],
    meta: { errores_alta: 1, errores_media: 0, errores_baja: 0, preguntas_criticas: 0, preguntas_recomendadas: 0, cross_block_changes_total: 0, confianza_general: 'Alta', justificacion_confianza: 'X' },
  })
  const r = applyErrorsDeterministicamente(plan, split.errorsAprobados)
  assertEq('2.3 texto_editado del user gana sobre cambio_propuesto del reviewer',
    r.planActualizado.proposito?.escena, 'la versión editada por el user')
}

// 2.4 — Error con que_dice_resumen NO encontrado en plan → warning, no aplica.
{
  const plan = planFixture()
  const decisiones: DecisionUsuario[] = [{ hallazgo_id: 'E1', tipo: 'error', decision: 'aprobado' }]
  const split = splitDecisiones(decisiones, {
    ...reportFixture(),
    errors: [{ id: 'E1', tipo: 1, severidad: 'Alta',
      que_dice_resumen: 'No incluye responsable',  // descripción de OMISIÓN, no cita textual
      que_se_dijo_en_conversacion: 'X',
      turno_referencia: 1,
      cambio_propuesto: 'agregar responsable' }],
    questions: [], cross_block_changes: [],
    meta: { errores_alta: 1, errores_media: 0, errores_baja: 0, preguntas_criticas: 0, preguntas_recomendadas: 0, cross_block_changes_total: 0, confianza_general: 'Alta', justificacion_confianza: 'X' },
  })
  const r = applyErrorsDeterministicamente(plan, split.errorsAprobados)
  assertEq('2.4.a errorsAplicados === 0', r.errorsAplicados, 0)
  assertEq('2.4.b errorsNoEncontrados === 1', r.errorsNoEncontrados, 1)
  assertOk('2.4.c warning generado', r.warnings.length === 1)
  assertOk('2.4.d warning menciona el id E1', r.warnings[0].includes('E1'))
  assertEq('2.4.e plan NO modificado', r.planActualizado.proposito?.escena, plan.proposito?.escena)
}

// 2.5 — Múltiples matches: gana el campo con valor más largo (cita más específica).
{
  const plan = planFixture({
    proposito: {
      escena: 'foo aparece acá pero también más texto largo y específico',
      metricas: [{ metrica: 'foo', valor_objetivo: 'x', valor_actual: '' }],
      fuera: [],
      horizonte: '',
      estabilidad: '',
    },
  })
  const decisiones: DecisionUsuario[] = [{ hallazgo_id: 'E1', tipo: 'error', decision: 'aprobado' }]
  const split = splitDecisiones(decisiones, {
    ...reportFixture(),
    errors: [{ id: 'E1', tipo: 1, severidad: 'Alta',
      que_dice_resumen: 'foo',  // aparece en 2 lugares
      que_se_dijo_en_conversacion: 'X',
      turno_referencia: 1,
      cambio_propuesto: 'BAR' }],
    questions: [], cross_block_changes: [],
    meta: { errores_alta: 1, errores_media: 0, errores_baja: 0, preguntas_criticas: 0, preguntas_recomendadas: 0, cross_block_changes_total: 0, confianza_general: 'Alta', justificacion_confianza: 'X' },
  })
  const r = applyErrorsDeterministicamente(plan, split.errorsAprobados)
  assertEq('2.5 ganó el match más largo (escena)', r.fieldsModificados, ['proposito.escena'])
  assertEq('2.5.b métrica.metrica intacta', r.planActualizado.proposito?.metricas[0].metrica, 'foo')
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 3: computeFieldsModificados
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 3: computeFieldsModificados (diff Pantalla 4) ──')

// 3.1 — Plan idéntico al snapshot → 0 cambios.
{
  const plan = planFixture()
  const snapshot = {
    proposito: plan.proposito,
    situacion: plan.situacion,
    datos_faltantes: plan.datos_faltantes,
  }
  const mod = computeFieldsModificados(snapshot, plan)
  assertEq('3.1 plan === snapshot → set vacío', [...mod], [])
}

// 3.2 — escena cambia → modifica solo proposito.escena.
{
  const plan = planFixture({
    proposito: { ...planFixture().proposito!, escena: 'NUEVA escena' },
  })
  const snapshot = {
    proposito: planFixture().proposito,
    situacion: planFixture().situacion,
    datos_faltantes: planFixture().datos_faltantes,
  }
  const mod = computeFieldsModificados(snapshot, plan)
  assertEq('3.2 solo proposito.escena modificada', [...mod], ['proposito.escena'])
}

// 3.3 — Métricas array cambia (1 item agregado) → modifica proposito.metricas.
{
  const plan = planFixture({
    proposito: {
      ...planFixture().proposito!,
      metricas: [
        ...planFixture().proposito!.metricas,
        { metrica: 'M2 nueva', valor_objetivo: 'X', valor_actual: '' },
      ],
    },
  })
  const snapshot = {
    proposito: planFixture().proposito,
    situacion: planFixture().situacion,
    datos_faltantes: planFixture().datos_faltantes,
  }
  const mod = computeFieldsModificados(snapshot, plan)
  assertEq('3.3 proposito.metricas modificada', [...mod], ['proposito.metricas'])
}

// 3.4 — datos_faltantes cambia → modifica datos_faltantes.
{
  const plan = planFixture({ datos_faltantes: ['original 1', 'original 2', 'nuevo 3'] })
  const snapshot = {
    proposito: planFixture().proposito,
    situacion: planFixture().situacion,
    datos_faltantes: planFixture().datos_faltantes,
  }
  const mod = computeFieldsModificados(snapshot, plan)
  assertEq('3.4 datos_faltantes modificada', [...mod], ['datos_faltantes'])
}

// 3.5 — Múltiples cambios.
{
  const plan = planFixture({
    proposito: {
      ...planFixture().proposito!,
      escena: 'NUEVA',
      horizonte: 'NUEVO',
    },
    situacion: {
      ...planFixture().situacion!,
      causa_raiz: 'identificada',
    },
  })
  const snapshot = {
    proposito: planFixture().proposito,
    situacion: planFixture().situacion,
    datos_faltantes: planFixture().datos_faltantes,
  }
  const mod = computeFieldsModificados(snapshot, plan)
  assertEq('3.5 modifica 3 paths',
    [...mod].sort(),
    ['proposito.escena', 'proposito.horizonte', 'situacion.causa_raiz'].sort())
}

// 3.6 — Snapshot sin proposito (Bloque sin proposito declarado) vs plan con proposito.
{
  const plan = planFixture()
  const snapshot = {
    proposito: undefined,
    situacion: planFixture().situacion,
    datos_faltantes: planFixture().datos_faltantes,
  }
  const mod = computeFieldsModificados(snapshot, plan)
  assertOk('3.6 detecta cambios cuando snapshot.proposito es undefined',
    mod.has('proposito.escena') && mod.has('proposito.metricas') && mod.has('proposito.fuera'))
}

// ═══════════════════════════════════════════════════════════════════════════
// Resumen
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(72))
console.log(`Total: ${pasados}/${total} assertions pasaron`)
if (fallas.length > 0) {
  console.log(`\n❌ FALLAS:`)
  for (const f of fallas) console.log(`  - ${f}`)
  console.log('\nVERDICT: NO-GO sobre release de Fase 4-5.')
  process.exit(1)
} else {
  console.log('\nVERDICT: ✅ GO — Fase 4 lógica pura validada.')
}

export {}
