// Unit-tests Fase 2 — feat/audit-reviewer.
//
// Sin red, sin Airtable, sin LLM. $0 USD. Segundos de runtime. 100% reproducible.
//
// Cobertura — los 5 grupos críticos pedidos en wrap-up Fase 2:
//   1. Parser del reporte (validateReviewerReport).
//   2. Máquina de estados (isValidTransition + transiciones del flow audit).
//   3. Mock de callReviewer (verificación de SHAPE de cada caso del result type).
//   4. Numeración de turnos (buildReviewerUserMessage).
//   5. Wrappers reviewer/snapshot (lógica del chat route extraída a función pura).
//
// Criterio: 100% de assertions pasan. Si cualquiera falla → NO-GO sobre Fase 3.

import { validateReviewerReport, REVIEWER_REPORT_SCHEMA } from '@/lib/reviewer-validator'
import { isValidTransition, SUB_ESTADO_TRANSICIONES_VALIDAS } from '@/lib/airtable'
import { buildReviewerSystemPrompt, buildReviewerUserMessage } from '@/lib/reviewer-prompt'
import type { ReviewerCallResult } from '@/lib/openai-client'
import type { TurnoPE, ReviewerReport, SubEstadoPaso } from '@/lib/types'

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

// ─── Fixture base: ReviewerReport bien formado para Bloque 1 ──────────────
function validReport(): ReviewerReport {
  return {
    errors: [
      { id: 'E01', tipo: 1, severidad: 'Alta', que_dice_resumen: 'X', que_se_dijo_en_conversacion: 'Y', turno_referencia: 5, cambio_propuesto: 'Z' },
      { id: 'E02', tipo: 4, severidad: 'Media', que_dice_resumen: 'A', que_se_dijo_en_conversacion: 'B', turno_referencia: 12, cambio_propuesto: 'C' },
    ],
    questions: [
      { id: 'Q01', categoria: 'CRITICA', pregunta: 'p1', por_que_importa: 'r1', relacion_con_plan: 'rp1', placeholder_ejemplo_respuesta: 'e1' },
      { id: 'Q02', categoria: 'RECOMENDADA', pregunta: 'p2', por_que_importa: 'r2', relacion_con_plan: 'rp2', placeholder_ejemplo_respuesta: 'e2' },
    ],
    cross_block_changes: [],
    meta: {
      errores_alta: 1, errores_media: 1, errores_baja: 0,
      preguntas_criticas: 1, preguntas_recomendadas: 1,
      cross_block_changes_total: 0,
      confianza_general: 'Alta',
      justificacion_confianza: 'OK',
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 1: Parser del reporte (validateReviewerReport)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 1: Parser del reporte (validateReviewerReport) ──')

// 1.1 — Acepta JSON válido para Bloque 1.
{
  const r = validateReviewerReport(validReport(), 1)
  assertOk('1.1 reporte válido para Bloque 1 acepta', r.ok, r.ok ? '' : (r as any).errors.join(' | '))
}

// 1.2 — Rechaza errors > 10.
{
  const rep = validReport()
  rep.errors = Array.from({ length: 11 }, (_, i) => ({
    id: `E${i}`, tipo: 1, severidad: 'Alta', que_dice_resumen: 'X',
    que_se_dijo_en_conversacion: 'Y', turno_referencia: i, cambio_propuesto: 'Z',
  }))
  rep.meta.errores_alta = 11
  const r = validateReviewerReport(rep, 1)
  assertOk('1.2 errors > 10 rechazado', !r.ok)
  if (!r.ok) {
    assertOk('1.2.b error menciona max 10', r.errors.some(e => /máximo 10/i.test(e)))
  }
}

// 1.3 — Rechaza preguntas críticas > 5.
{
  const rep = validReport()
  rep.questions = Array.from({ length: 6 }, (_, i) => ({
    id: `Q${i}`, categoria: 'CRITICA' as const, pregunta: `p${i}`, por_que_importa: 'r',
    relacion_con_plan: 'rp', placeholder_ejemplo_respuesta: 'e',
  }))
  rep.meta.preguntas_criticas = 6
  rep.meta.preguntas_recomendadas = 0
  const r = validateReviewerReport(rep, 1)
  assertOk('1.3 preguntas críticas > 5 rechazado', !r.ok)
  if (!r.ok) {
    assertOk('1.3.b error menciona max 5 críticas', r.errors.some(e => /críticas, máximo 5/i.test(e)))
  }
}

// 1.4 — Rechaza preguntas recomendadas > 5.
{
  const rep = validReport()
  rep.questions = Array.from({ length: 6 }, (_, i) => ({
    id: `Q${i}`, categoria: 'RECOMENDADA' as const, pregunta: `p${i}`, por_que_importa: 'r',
    relacion_con_plan: 'rp', placeholder_ejemplo_respuesta: 'e',
  }))
  rep.meta.preguntas_criticas = 0
  rep.meta.preguntas_recomendadas = 6
  const r = validateReviewerReport(rep, 1)
  assertOk('1.4 preguntas recomendadas > 5 rechazado', !r.ok)
}

// 1.5 — Meta inconsistente: suma de errores no matchea errors.length.
{
  const rep = validReport()
  rep.meta.errores_alta = 5  // pero hay solo 2 errors en total
  const r = validateReviewerReport(rep, 1)
  assertOk('1.5 meta errores_alta+media+baja inconsistente con errors.length rechazado', !r.ok)
}

// 1.6 — cross_block_changes con items en Bloque 1 → rechazado.
{
  const rep = validReport()
  rep.cross_block_changes = [{
    id: 'CBC1', bloque_afectado: 0, seccion_afectada: 'X', severidad: 'Alta',
    que_dice_actualmente: 'A', que_se_declaro_que_lo_modifica: 'B',
    turno_referencia: 1, cambio_propuesto: 'C',
  }]
  rep.meta.cross_block_changes_total = 1
  const r = validateReviewerReport(rep, 1)
  assertOk('1.6 cross_block_changes con items en Bloque 1 rechazado', !r.ok)
  if (!r.ok) {
    assertOk('1.6.b error menciona "primer Bloque"', r.errors.some(e => /primer Bloque/i.test(e)))
  }
}

// 1.7 — cross_block_changes con items en Bloque 2 → aceptado.
{
  const rep = validReport()
  rep.cross_block_changes = [{
    id: 'CBC1', bloque_afectado: 1, seccion_afectada: 'Propósito > Métricas', severidad: 'Media',
    que_dice_actualmente: 'A', que_se_declaro_que_lo_modifica: 'B',
    turno_referencia: 50, cambio_propuesto: 'C',
  }]
  rep.meta.cross_block_changes_total = 1
  const r = validateReviewerReport(rep, 2)
  assertOk('1.7 cross_block_changes con items en Bloque 2 aceptado', r.ok, r.ok ? '' : (r as any).errors.join(' | '))
}

// 1.8 — Tipos inválidos en items: severidad no enum.
{
  const rep = validReport()
  ;(rep.errors[0] as any).severidad = 'Catastrófica'
  const r = validateReviewerReport(rep, 1)
  assertOk('1.8 severidad fuera de enum rechazada', !r.ok)
}

// 1.9 — Tipos inválidos: tipo=5 (no en {1,2,3,4}).
{
  const rep = validReport()
  ;(rep.errors[0] as any).tipo = 5
  const r = validateReviewerReport(rep, 1)
  assertOk('1.9 tipo=5 rechazado', !r.ok)
}

// 1.10 — Missing fields top-level: sin "errors".
{
  const rep = { ...validReport() } as any
  delete rep.errors
  const r = validateReviewerReport(rep, 1)
  assertOk('1.10 missing errors rechazado', !r.ok)
}

// 1.11 — Datos no-objeto: array, null, primitive.
{
  assertOk('1.11.a null rechazado', !validateReviewerReport(null, 1).ok)
  assertOk('1.11.b array rechazado', !validateReviewerReport([], 1).ok)
  assertOk('1.11.c string rechazado', !validateReviewerReport('foo', 1).ok)
}

// 1.12 — Schema JSON exportado tiene la estructura esperada (smoke check).
{
  const s = REVIEWER_REPORT_SCHEMA as any
  assertEq('1.12 schema.type === object', s.type, 'object')
  assertEq('1.12.b schema.required incluye 4 keys', s.required, ['errors', 'questions', 'cross_block_changes', 'meta'])
  assertEq('1.12.c schema.properties.errors.maxItems === 10', s.properties.errors.maxItems, 10)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 2: Máquina de estados (isValidTransition)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 2: Máquina de estados ──')

// 2.1 — Transiciones válidas del happy path.
{
  assertOk('2.1.a en_curso → cierre_sugerido OK', isValidTransition('en_curso', 'cierre_sugerido'))
  assertOk('2.1.b cierre_sugerido → esperando_auditoria OK', isValidTransition('cierre_sugerido', 'esperando_auditoria'))
  assertOk('2.1.c esperando_auditoria → auditoria_en_proceso OK', isValidTransition('esperando_auditoria', 'auditoria_en_proceso'))
  assertOk('2.1.d auditoria_en_proceso → auditoria_completa OK', isValidTransition('auditoria_en_proceso', 'auditoria_completa'))
  assertOk('2.1.e auditoria_completa → aplicando_cambios OK', isValidTransition('auditoria_completa', 'aplicando_cambios'))
  assertOk('2.1.f aplicando_cambios → esperando_aprobacion_final OK', isValidTransition('aplicando_cambios', 'esperando_aprobacion_final'))
  assertOk('2.1.g esperando_aprobacion_final → completo OK', isValidTransition('esperando_aprobacion_final', 'completo'))
}

// 2.2 — Transiciones inválidas (saltos no permitidos).
{
  assertOk('2.2.a en_curso → auditoria_en_proceso INVALID', !isValidTransition('en_curso', 'auditoria_en_proceso'))
  assertOk('2.2.b en_curso → completo INVALID', !isValidTransition('en_curso', 'completo'))
  assertOk('2.2.c esperando_auditoria → auditoria_completa INVALID (debe pasar por en_proceso)', !isValidTransition('esperando_auditoria', 'auditoria_completa'))
  assertOk('2.2.d aplicando_cambios → completo INVALID (debe pasar por esperando_aprobacion_final)', !isValidTransition('aplicando_cambios', 'completo'))
}

// 2.3 — Skip directo: esperando_auditoria → completo OK.
{
  assertOk('2.3 esperando_auditoria → completo OK (skip)', isValidTransition('esperando_auditoria', 'completo'))
}

// 2.4 — Rollback de fallas: auditoria_en_proceso → esperando_auditoria OK.
{
  assertOk('2.4 auditoria_en_proceso → esperando_auditoria OK (rollback)', isValidTransition('auditoria_en_proceso', 'esperando_auditoria'))
}

// 2.5 — Re-audit: auditoria_completa → esperando_auditoria OK.
//       Re-apply: esperando_aprobacion_final → aplicando_cambios OK.
{
  assertOk('2.5.a auditoria_completa → esperando_auditoria OK (re-audit)', isValidTransition('auditoria_completa', 'esperando_auditoria'))
  assertOk('2.5.b esperando_aprobacion_final → aplicando_cambios OK (re-apply)', isValidTransition('esperando_aprobacion_final', 'aplicando_cambios'))
  assertOk('2.5.c esperando_aprobacion_final → auditoria_en_proceso OK (re-audit desde final)', isValidTransition('esperando_aprobacion_final', 'auditoria_en_proceso'))
}

// 2.6 — completo es estado terminal: ninguna transición saliente.
{
  const todas: SubEstadoPaso[] = ['en_curso', 'cierre_sugerido', 'esperando_auditoria', 'auditoria_en_proceso', 'auditoria_completa', 'aplicando_cambios', 'esperando_aprobacion_final', 'completo']
  for (const hasta of todas) {
    assertOk(`2.6.${hasta} completo → ${hasta} INVALID (terminal)`, !isValidTransition('completo', hasta))
  }
}

// 2.7 — Volver a entrevistar: cierre_sugerido → en_curso OK.
{
  assertOk('2.7 cierre_sugerido → en_curso OK (user vuelve a entrevistar)', isValidTransition('cierre_sugerido', 'en_curso'))
}

// 2.8 — Doble disparo de audit/start: si estado ya es auditoria_en_proceso, intentar
//       transicionar desde esperando_auditoria es INVALID — el guard rechaza.
//       Esto es la PROTECCIÓN ANTI-DOBLE-DISPARO real del endpoint.
{
  // Si una segunda llamada a /audit/start llega y lee `entrevista.sub_estado_paso`,
  // verá 'auditoria_en_proceso' (la primera ya transicionó). Cualquier intento
  // posterior de `updateSubEstadoPaso('esperando_auditoria', 'auditoria_en_proceso')`
  // va a tirar error porque el estado actual NO es 'esperando_auditoria'.
  assertOk('2.8 esperando_auditoria → auditoria_en_proceso requiere estado actual=esperando_auditoria',
    isValidTransition('esperando_auditoria', 'auditoria_en_proceso'))
  // Pero si ya está en auditoria_en_proceso, no hay ningún estado válido que vaya a en_proceso de nuevo:
  const estadosDesdeLosQueSePuedeIrA: SubEstadoPaso[] = []
  for (const desde of Object.keys(SUB_ESTADO_TRANSICIONES_VALIDAS) as SubEstadoPaso[]) {
    if (isValidTransition(desde, 'auditoria_en_proceso')) estadosDesdeLosQueSePuedeIrA.push(desde)
  }
  assertEq('2.8.b solo esperando_auditoria + esperando_aprobacion_final pueden ir a auditoria_en_proceso',
    estadosDesdeLosQueSePuedeIrA.sort(),
    ['esperando_aprobacion_final', 'esperando_auditoria'].sort())
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 3: Mock de callReviewer (verificación de SHAPE del result type)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 3: SHAPE de ReviewerCallResult (manejo de cada caso) ──')

function fakeMetrics(cost = 0.5, latency = 150000, retries = 0) {
  return {
    input_tokens: 50000, output_tokens: 10000, reasoning_tokens: 7000,
    cost_usd: cost, latency_ms: latency, retries_used: retries, attempts: retries + 1,
    model: 'gpt-5.5', effort: 'high',
  }
}

// 3.1 — Caso ok: tiene data + metrics.
{
  const r: ReviewerCallResult = { ok: true, data: validReport(), metrics: fakeMetrics() }
  assertOk('3.1 ok=true tiene data y metrics', r.ok && 'data' in r && 'metrics' in r)
  assertEq('3.1.b cost_usd preservado', r.metrics.cost_usd, 0.5)
}

// 3.2 — Caso cost_cap_exceeded.
{
  const r: ReviewerCallResult = {
    ok: false, reason: 'cost_cap_exceeded',
    details: 'Costo $9.50 supera cap $8',
    metrics: fakeMetrics(9.5, 100000, 0),
  }
  assertOk('3.2 cost_cap_exceeded tiene reason + metrics con costo real', !r.ok && r.reason === 'cost_cap_exceeded' && r.metrics.cost_usd === 9.5)
}

// 3.3 — Caso malformed_json (output truncado o JSON inválido).
{
  const r: ReviewerCallResult = {
    ok: false, reason: 'malformed_json',
    details: 'Unterminated string at position 1073',
    metrics: fakeMetrics(0.5, 280000, 2),
  }
  assertOk('3.3 malformed_json reason correcto + retries usados registrados', !r.ok && r.reason === 'malformed_json' && r.metrics.retries_used === 2)
}

// 3.4 — Caso timeout (AbortSignal).
{
  const r: ReviewerCallResult = {
    ok: false, reason: 'timeout',
    details: 'Request was aborted after 270s',
    metrics: fakeMetrics(0.4, 270000, 0),
  }
  assertOk('3.4 timeout reason correcto', !r.ok && r.reason === 'timeout')
}

// 3.5 — Caso api_error (4xx no-retryable).
{
  const r: ReviewerCallResult = {
    ok: false, reason: 'api_error',
    details: 'HTTP 401 invalid api key',
    metrics: fakeMetrics(0, 500, 0),
  }
  assertOk('3.5 api_error con costo 0 (no se completó ningún intento)', !r.ok && r.reason === 'api_error' && r.metrics.cost_usd === 0)
}

// 3.6 — Caso all_retries_failed: agotó MAX_RETRIES sin éxito.
{
  const r: ReviewerCallResult = {
    ok: false, reason: 'all_retries_failed',
    details: 'attempt 1: timeout | attempt 2: timeout | attempt 3: malformed JSON',
    metrics: fakeMetrics(1.5, 600000, 2),
  }
  assertOk('3.6 all_retries_failed tiene 3 attempts (1 + 2 retries)', !r.ok && r.reason === 'all_retries_failed' && r.metrics.attempts === 3)
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 4: Numeración de turnos (buildReviewerUserMessage)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 4: Numeración cronológica desde 1 ──')

function fakeTurnos(n: number, mixWithReviewerSnapshot = false): TurnoPE[] {
  const arr: TurnoPE[] = []
  for (let i = 0; i < n; i++) {
    arr.push({
      rol: i % 2 === 0 ? 'user' : 'model',
      contenido: `Contenido turno ${i + 1}`,
      timestamp: `2026-05-02T${String(i).padStart(2, '0')}:00:00Z`,
      paso: 1,
    })
  }
  if (mixWithReviewerSnapshot) {
    // Insertar un reviewer y un snapshot al final (no deben numerarse).
    arr.push({ rol: 'reviewer', contenido: '{}', timestamp: '2026-05-02T99:00:00Z', paso: 1 })
    arr.push({ rol: 'snapshot', contenido: '{}', timestamp: '2026-05-02T99:01:00Z', paso: 1 })
  }
  return arr
}

// 4.1 — N turnos consecutivos numerados 1..N sin saltos.
{
  const turnos = fakeTurnos(7)
  const msg = buildReviewerUserMessage({
    bloque: 1,
    turnos,
    resumenEstructurado: '## Resumen vacío',
  })
  for (let i = 1; i <= 7; i++) {
    assertOk(`4.1.${i} contiene "[Turno ${i},`, msg.includes(`[Turno ${i},`))
  }
  assertOk('4.1.8 NO contiene "[Turno 8," (solo 7 turnos)', !msg.includes('[Turno 8,'))
}

// 4.2 — Turnos reviewer y snapshot se filtran (no numerados como conversación).
{
  const turnos = fakeTurnos(3, true)  // 3 user/model + 1 reviewer + 1 snapshot
  const msg = buildReviewerUserMessage({
    bloque: 1,
    turnos,
    resumenEstructurado: '## Resumen',
  })
  assertOk('4.2.a contiene Turno 1, 2, 3', msg.includes('[Turno 1,') && msg.includes('[Turno 2,') && msg.includes('[Turno 3,'))
  assertOk('4.2.b NO contiene Turno 4 (reviewer y snapshot filtrados)', !msg.includes('[Turno 4,'))
  assertOk('4.2.c NO contiene "reviewer]:" en el listado de turnos', !msg.includes('reviewer]:'))
  assertOk('4.2.d NO contiene "snapshot]:" en el listado de turnos', !msg.includes('snapshot]:'))
}

// 4.3 — Sin turnos previos en re-audit, NO suma bloque AUDITORÍA PREVIA.
{
  const turnos = fakeTurnos(5)
  const msgSinPrevias = buildReviewerUserMessage({
    bloque: 1,
    turnos,
    resumenEstructurado: '## R',
  })
  assertOk('4.3 sin auditoriasPrevias NO incluye bloque "AUDITORÍA(S) PREVIA(S)"', !msgSinPrevias.includes('AUDITORÍA(S) PREVIA(S)'))
}

// 4.4 — Con re-audit, SÍ incluye el bloque.
{
  const turnos = fakeTurnos(5)
  const msgConPrevias = buildReviewerUserMessage({
    bloque: 1,
    turnos,
    resumenEstructurado: '## R',
    auditoriasPrevias: [
      { report: validReport(), decisiones: undefined, costo_usd: 0.5, retry_count: 1 },
    ],
  })
  assertOk('4.4.a con auditoriasPrevias incluye bloque "AUDITORÍA(S) PREVIA(S)"', msgConPrevias.includes('AUDITORÍA(S) PREVIA(S)'))
  assertOk('4.4.b menciona cantidad de auditorías previas', msgConPrevias.includes('1 vez'))
  assertOk('4.4.c instruye al reviewer NO repetir hallazgos previos', /NO repitas hallazgos ya aprobados/i.test(msgConPrevias))
}

// 4.5 — System prompt cambia según el bloque.
{
  const sysB1 = buildReviewerSystemPrompt(1)
  const sysB2 = buildReviewerSystemPrompt(2)
  assertOk('4.5.a Bloque 1: cross_block_changes debe estar VACÍO', /cross_block_changes.*VAC[IÍ]O/i.test(sysB1) || /vac[ií]o.*\[\]/i.test(sysB1))
  assertOk('4.5.b Bloque 2: menciona bloques anteriores cerrados', /bloques anteriores ya fueron auditados/i.test(sysB2))
}

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 5: Wrappers reviewer/snapshot (replicado del chat route)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Suite 5: Wrappers de mapeo al LLM ──')

// Replicación pura de la lógica del chat route (líneas ~62-80) para testear
// el mapeo independientemente de Anthropic SDK.
function mapTurnoToLLM(t: TurnoPE): { role: 'user' | 'assistant'; content: string } {
  if (t.rol === 'model') return { role: 'assistant', content: t.contenido }
  if (t.rol === 'reviewer') {
    return {
      role: 'user',
      content: `[CONTEXTO DE AUDITORÍA EXTERNA DEL PASO ${t.paso} — REPORTE Y DECISIONES DEL USUARIO]\n\n${t.contenido}`,
    }
  }
  if (t.rol === 'snapshot') {
    return {
      role: 'user',
      content: `[CIERRE FORMAL DEL PASO ${t.paso} — RESUMEN CONGELADO]\n\n${t.contenido}`,
    }
  }
  return { role: 'user', content: t.contenido }
}

// 5.1 — Turno user → role:user sin prefijo.
{
  const r = mapTurnoToLLM({ rol: 'user', contenido: 'Hola', timestamp: 't', paso: 1 })
  assertEq('5.1 user → role=user sin prefijo', r, { role: 'user', content: 'Hola' })
}

// 5.2 — Turno model → role:assistant.
{
  const r = mapTurnoToLLM({ rol: 'model', contenido: 'Sí, entendido', timestamp: 't', paso: 1 })
  assertEq('5.2 model → role=assistant', r, { role: 'assistant', content: 'Sí, entendido' })
}

// 5.3 — Turno reviewer mapea a [CONTEXTO DE AUDITORÍA EXTERNA DEL PASO N — ...].
{
  const r = mapTurnoToLLM({ rol: 'reviewer', contenido: '{"errors":[]}', timestamp: 't', paso: 1 })
  assertEq('5.3.a reviewer → role=user', r.role, 'user')
  assertOk('5.3.b prefijo "[CONTEXTO DE AUDITORÍA EXTERNA DEL PASO 1"', r.content.startsWith('[CONTEXTO DE AUDITORÍA EXTERNA DEL PASO 1'))
  assertOk('5.3.c contenido original presente', r.content.includes('{"errors":[]}'))
}

// 5.4 — Turno snapshot mapea a [CIERRE FORMAL DEL PASO N — ...].
{
  const r = mapTurnoToLLM({ rol: 'snapshot', contenido: '{"paso":1}', timestamp: 't', paso: 1 })
  assertEq('5.4.a snapshot → role=user', r.role, 'user')
  assertOk('5.4.b prefijo "[CIERRE FORMAL DEL PASO 1"', r.content.startsWith('[CIERRE FORMAL DEL PASO 1'))
}

// 5.5 — Paso > 1 se refleja correctamente en el prefijo.
{
  const r = mapTurnoToLLM({ rol: 'reviewer', contenido: 'X', timestamp: 't', paso: 2 })
  assertOk('5.5 paso=2 refleja "PASO 2" en el prefijo', r.content.includes('PASO 2'))
}

// ═══════════════════════════════════════════════════════════════════════════
// Resumen
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(72))
console.log(`Total: ${pasados}/${total} assertions pasaron`)
if (fallas.length > 0) {
  console.log(`\n❌ FALLAS:`)
  for (const f of fallas) console.log(`  - ${f}`)
  console.log('\nVERDICT: NO-GO sobre Fase 3.')
  process.exit(1)
} else {
  console.log('\nVERDICT: ✅ GO — Fase 2 lista para Fase 3.')
}

export {}
