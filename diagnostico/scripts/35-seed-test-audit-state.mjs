// Seed de entrevista de testing para verificar visualmente las pantallas
// del feat/audit-reviewer (Fase 3). NO toca el Plan Sr de Terravinci.
//
// Crea (o actualiza si ya existe) un Plan Sr "TESTING audit-reviewer Fase 3"
// + entrevista + 6-8 turnos sintéticos + propósito mock.
//
// Setea estado base: sub_estado_paso='esperando_auditoria', paso_actual=1.
// Permite navegar a /planes-estrategicos/[id]/cierre/1 y ver Pantalla 1.
//
// Flag --with-report:
//   Además crea un turno reviewer con report mock + setea estado en
//   'auditoria_completa'. Permite hidratar directo a Pantalla 3 sin gastar OpenAI.
//
// Flag --with-report-applied:
//   Como --with-report PERO simula que el user ya procesó las decisiones y se
//   aplicaron. El plan tiene cambios visibles, el reviewer turn tiene
//   snapshotPreApply + decisiones persistidas, estado: esperando_aprobacion_final.
//   Permite ver Pantalla 4 con diff completo sin gastar OpenAI ni Opus.
//
// Uso:
//   npx tsx --env-file=.env.local diagnostico/scripts/35-seed-test-audit-state.mjs
//   npx tsx --env-file=.env.local diagnostico/scripts/35-seed-test-audit-state.mjs --with-report
//   npx tsx --env-file=.env.local diagnostico/scripts/35-seed-test-audit-state.mjs --with-report-applied
//
// Salida: imprime URLs para navegar + IDs creados.

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
const PLAN_SR_TERRAVINCI = 'recFMWxoE5gTQQrf7'  // BLOCKED — no tocar

const TABLA_USUARIOS = 'tblXhgSBuh0f1BNPV'
const TABLA_PLANES_PE = 'tblPJC1VMQclfCqc7'
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'
const TABLA_TURNOS_PE = 'tblWxPv53CRscq18w'

const PLAN_NOMBRE = 'TESTING audit-reviewer Fase 3'
const USER_EMAIL = 'jmtapiola@gmail.com'
const WITH_REPORT_APPLIED = process.argv.includes('--with-report-applied')
const WITH_REPORT = WITH_REPORT_APPLIED || process.argv.includes('--with-report')

if (!BASE_ID || !API_KEY) {
  console.error('FATAL: faltan AIRTABLE_BASE_ID o AIRTABLE_API_KEY en environment')
  process.exit(1)
}

const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`
const headers = () => ({ Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' })

// ─── Helpers ────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const url = `${BASE_URL}${path}`
  const opts = { method, headers: headers() }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) {
    console.error(`${method} ${path} → HTTP ${res.status}\n${text}`)
    process.exit(1)
  }
  return JSON.parse(text)
}

async function listAll(table, params = '') {
  const records = []
  let offset
  do {
    let url = `/${table}?pageSize=100${params ? `&${params}` : ''}`
    if (offset) url += `&offset=${offset}`
    const data = await api('GET', url)
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

// ─── Block list explícito ────────────────────────────────────────────────────

function assertNotPilot(planId) {
  if (planId === PLAN_SR_TERRAVINCI) {
    console.error(`FATAL: refuse to operate on Plan Sr de Terravinci (${PLAN_SR_TERRAVINCI}).`)
    console.error('Este script crea/usa un plan dedicado de testing — no toca el piloto.')
    process.exit(1)
  }
}

// ─── 1) Buscar usuario Juan ──────────────────────────────────────────────────

async function findUserByEmail(email) {
  const records = await listAll(TABLA_USUARIOS, `filterByFormula=${encodeURIComponent(`{Email}="${email}"`)}`)
  if (records.length === 0) {
    console.error(`FATAL: no se encontró usuario con email ${email}`)
    process.exit(1)
  }
  return records[0].id
}

// ─── 2) Buscar o crear plan dummy ────────────────────────────────────────────

async function findOrCreatePlan(userId) {
  const records = await listAll(TABLA_PLANES_PE, `filterByFormula=${encodeURIComponent(`{Nombre}="${PLAN_NOMBRE}"`)}`)
  if (records.length > 0) {
    const planId = records[0].id
    assertNotPilot(planId)
    console.log(`  ✓ Plan dummy ya existe: ${planId}`)
    return planId
  }
  const created = await api('POST', `/${TABLA_PLANES_PE}`, {
    fields: {
      'Nombre': PLAN_NOMBRE,
      'Tipo': 'Sr',
      'Estado': 'En entrevista',
      'Version': 1,
      'Area': 'Testing',
      'Responsable': [userId],
      'Horizonte': 'Fin 2026 (mock)',
    },
  })
  assertNotPilot(created.id)
  console.log(`  ✔ Plan dummy creado: ${created.id}`)
  return created.id
}

// ─── 3) Pre-cargar propósito mock en el plan ─────────────────────────────────

async function setPropositoMock(planId) {
  assertNotPilot(planId)
  await api('PATCH', `/${TABLA_PLANES_PE}/${planId}`, {
    fields: {
      'Proposito Escena': 'Transformar el área de testing en motor de validación robusto, capaz de validar las 4 pantallas del audit-reviewer end-to-end con mocks deterministicos.',
      'Proposito Metricas': JSON.stringify([
        { metrica: 'Pantallas validadas', valor_objetivo: '4 de 4', valor_actual: '0' },
        { metrica: 'Cobertura de bugs visuales', valor_objetivo: '100%', valor_actual: '' },
      ]),
      'Proposito Fuera': JSON.stringify([
        { item: 'Validación de OpenAI integration', razon: 'es Fase 4 smoke real' },
      ]),
      'Horizonte': 'Fin 2026 (mock)',
      'Proposito Estabilidad': 'Estable durante la Fase 3.',
    },
  })
  console.log(`  ✔ Propósito mock pre-cargado en el plan`)
}

// ─── 4) Buscar o crear entrevista ────────────────────────────────────────────

async function findOrCreateEntrevista(planId) {
  assertNotPilot(planId)
  const records = await listAll(TABLA_ENTREVISTAS_PE)
  const matching = records.filter(r => (r.fields['Plan'] ?? []).includes(planId))
  if (matching.length > 0) {
    console.log(`  ✓ Entrevista ya existe: ${matching[0].id}`)
    return matching[0].id
  }
  const created = await api('POST', `/${TABLA_ENTREVISTAS_PE}`, {
    fields: {
      'Titulo': `Entrevista TESTING ${new Date().toISOString().split('T')[0]}`,
      'Plan': [planId],
      'Estado': 'En curso',
      'Paso Actual': 1,
      'Sub Bloque Actual': '1.E',
      'Historial': '[]',
      'Ultima Actividad': new Date().toISOString(),
    },
  })
  console.log(`  ✔ Entrevista creada: ${created.id}`)
  return created.id
}

// ─── 5) Borrar turnos previos de la entrevista para tener un estado limpio ──

async function clearTurnos(entrevistaId) {
  const records = await listAll(TABLA_TURNOS_PE)
  const ids = records.filter(r => (r.fields['Entrevista'] ?? []).includes(entrevistaId)).map(r => r.id)
  if (ids.length === 0) return
  // Airtable borra hasta 10 records por DELETE bulk.
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    const params = chunk.map(id => `records[]=${id}`).join('&')
    await api('DELETE', `/${TABLA_TURNOS_PE}?${params}`)
  }
  console.log(`  ✔ Borrados ${ids.length} turnos previos de la entrevista`)
}

// ─── 6) Crear turnos sintéticos ──────────────────────────────────────────────

const TURNOS_MOCK = [
  { rol: 'user', contenido: 'Quiero hacer un Plan Sr de testing del audit-reviewer.', paso: 0 },
  { rol: 'model', contenido: 'Bien. Vamos a estructurar el encuadre. ¿Cuál es el área?', paso: 0 },
  { rol: 'user', contenido: 'Área: Testing. Responsable: Juan. Tipo: Plan Sr.', paso: 0 },
  { rol: 'model', contenido: 'Encuadre confirmado. Pasamos al propósito.', paso: 1 },
  { rol: 'user', contenido: 'El propósito es validar las 4 pantallas del feature de auditoría con mocks.', paso: 1 },
  { rol: 'model', contenido: 'Bien. Definamos métricas concretas para validar.', paso: 1 },
  { rol: 'user', contenido: 'Métrica 1: Pantallas validadas → 4 de 4. Métrica 2: Bugs visuales → 0.', paso: 1 },
  { rol: 'model', contenido: 'Propósito cerrado conceptualmente. Listo para auditar.', paso: 1 },
]

async function createTurnos(entrevistaId) {
  const records = TURNOS_MOCK.map((t, i) => ({
    fields: {
      'Etiqueta': `${String(i).padStart(4, '0')}|${t.rol}`,
      'Entrevista': [entrevistaId],
      'Indice': i,
      'Rol': t.rol,
      'Contenido': t.contenido,
      'Timestamp': new Date(Date.now() - (TURNOS_MOCK.length - i) * 60000).toISOString(),
      'Paso': t.paso,
    },
  }))
  // Bulk-create (max 10 por request).
  for (let i = 0; i < records.length; i += 10) {
    await api('POST', `/${TABLA_TURNOS_PE}`, { records: records.slice(i, i + 10), typecast: true })
  }
  console.log(`  ✔ Creados ${records.length} turnos sintéticos`)
  return records.length
}

// ─── 7) Crear turno reviewer con report mock (--with-report) ─────────────────

const REPORT_MOCK = {
  errors: [
    {
      id: 'E01', tipo: 1, severidad: 'Alta',
      que_dice_resumen: 'Métricas: 4 de 4 pantallas validadas',
      que_se_dijo_en_conversacion: 'En el turno 5 declaraste "validar las 4 pantallas del feature de auditoría con mocks", pero el resumen no menciona "con mocks" como parte de la métrica.',
      turno_referencia: 5,
      cambio_propuesto: 'Agregar a la métrica que la validación es con mocks deterministicos, no con OpenAI real (eso es Fase 4 smoke).',
    },
    {
      id: 'E02', tipo: 4, severidad: 'Media',
      que_dice_resumen: 'Cobertura de bugs visuales: 100%',
      que_se_dijo_en_conversacion: 'En turno 7 mencionaste "Bugs visuales → 0", pero esto es ambiguo: ¿0 bugs encontrados es 100% de cobertura, o 100% es haber revisado todas las pantallas?',
      turno_referencia: 7,
      cambio_propuesto: 'Reformular como "Bugs visuales detectados: ≤ N permitidos" o aclarar el criterio.',
    },
    {
      id: 'E03', tipo: 3, severidad: 'Baja',
      que_dice_resumen: 'Operación en CABA Oeste y GBA',
      que_se_dijo_en_conversacion: 'En la conversación nunca se mencionó CABA ni GBA — el plan es de testing.',
      turno_referencia: 0,
      cambio_propuesto: 'Eliminar referencias geográficas inventadas.',
    },
  ],
  questions: [
    {
      id: 'Q01', categoria: 'CRITICA',
      pregunta: '¿Cuál es el criterio de aceptación de "validación end-to-end" en términos operativos?',
      por_que_importa: 'Sin criterio explícito, "validar" puede significar cualquier cosa desde "abrió la página" hasta "click-through completo de los 4 flows".',
      relacion_con_plan: 'Métrica de pantallas validadas + propósito.',
      placeholder_ejemplo_respuesta: 'Por ejemplo: "Validación = abrir página + interactuar con cada hallazgo del modal + verificar que el footer se habilita correctamente"',
    },
    {
      id: 'Q02', categoria: 'CRITICA',
      pregunta: '¿Qué pantallas exactamente se cubren con mocks vs cuáles requieren smoke real con OpenAI?',
      por_que_importa: 'Pantalla 2 (loading) requiere SSE real para verse en acción. Las otras 3 funcionan con datos mockeados.',
      relacion_con_plan: 'Cobertura de validación.',
      placeholder_ejemplo_respuesta: 'P1+P3 con seed mock, P2 requiere /audit/start real ($0.50)',
    },
    {
      id: 'Q03', categoria: 'RECOMENDADA',
      pregunta: '¿Hay un budget máximo de tiempo para iteración visual de Fase 3?',
      por_que_importa: 'Sin timebox, la verificación visual puede expandirse y bloquear Fase 4.',
      relacion_con_plan: 'Velocity del proyecto.',
      placeholder_ejemplo_respuesta: 'Por ejemplo: "30 min de browsing + decisión GO/NO-GO"',
    },
  ],
  cross_block_changes: [],
  meta: {
    errores_alta: 1, errores_media: 1, errores_baja: 1,
    preguntas_criticas: 2, preguntas_recomendadas: 1,
    cross_block_changes_total: 0,
    confianza_general: 'Alta',
    justificacion_confianza: 'Mock: report sintético construido por seed script para validar P3.',
  },
}

async function createReviewerTurno(entrevistaId, indice, applied = false) {
  // Si applied=true, populamos snapshotPreApply + decisiones del usuario +
  // métricas de apply fake. Permite ver Pantalla 4 con diff completo.
  const fields = {
    'Etiqueta': `${String(indice).padStart(4, '0')}|reviewer`,
    'Entrevista': [entrevistaId],
    'Indice': indice,
    'Rol': 'reviewer',
    'Contenido': JSON.stringify(REPORT_MOCK),
    'Timestamp': new Date().toISOString(),
    'Paso': 1,
    'Reviewer Bloque Auditado': 1,
    'Reviewer Modelo': 'gpt-5.5 (MOCK)',
    'Reviewer Errores Total': REPORT_MOCK.errors.length,
    'Reviewer Preguntas Total': REPORT_MOCK.questions.length,
    'Reviewer Costo USD': applied ? 0.45 : 0,
    'Reviewer Latencia MS': applied ? 152000 : 0,
    'Reviewer Retry Count': 0,
    'Reviewer Skipped': false,
    'Reviewer Failed': false,
  }
  if (applied) {
    fields['Reviewer Decisiones JSON'] = JSON.stringify(DECISIONES_MOCK)
    fields['Reviewer Snapshot Pre Apply JSON'] = JSON.stringify(SNAPSHOT_PRE_APPLY_MOCK)
    fields['Apply Changes Cost USD'] = 0.32
    fields['Apply Changes Latency MS'] = 18500
  }
  await api('POST', `/${TABLA_TURNOS_PE}`, { records: [{ fields }], typecast: true })
  console.log(applied
    ? `  ✔ Turno reviewer creado con report + decisiones + snapshot pre-apply (Pantalla 4)`
    : `  ✔ Turno reviewer creado con report mock (3 errores + 3 preguntas)`)
}

// ─── Mocks adicionales para --with-report-applied ────────────────────────────

const DECISIONES_MOCK = [
  // Errors aprobados.
  { hallazgo_id: 'E01', tipo: 'error', decision: 'aprobado_con_cambios',
    texto_editado: 'Métricas: 4 de 4 pantallas validadas con mocks deterministicos (no con OpenAI real — eso es Fase 4 smoke).' },
  { hallazgo_id: 'E02', tipo: 'error', decision: 'aprobado',
    texto_editado: undefined },
  // Error ignorado.
  { hallazgo_id: 'E03', tipo: 'error', decision: 'ignorado' },
  // Pregunta respondida.
  { hallazgo_id: 'Q01', tipo: 'pregunta', decision: 'respondido',
    respuesta_usuario: 'Validación = abrir cada pantalla + interactuar con cada hallazgo del modal + verificar que el footer se habilita correctamente cuando todos los hallazgos están procesados.' },
  // Preguntas ignoradas.
  { hallazgo_id: 'Q02', tipo: 'pregunta', decision: 'ignorado' },
  { hallazgo_id: 'Q03', tipo: 'pregunta', decision: 'ignorado' },
]

// Snapshot del PROPÓSITO ORIGINAL (antes de los cambios). Pantalla 4 lo
// compara contra el plan actualizado (que va a tener los cambios visibles)
// para calcular qué campos están modificados.
const SNAPSHOT_PRE_APPLY_MOCK = {
  proposito: {
    escena: 'Transformar el área de testing en motor de validación robusto, capaz de validar las 4 pantallas del audit-reviewer end-to-end con mocks deterministicos.',
    metricas: [
      { metrica: 'Pantallas validadas', valor_objetivo: '4 de 4', valor_actual: '0' },
      { metrica: 'Cobertura de bugs visuales', valor_objetivo: '100%', valor_actual: '' },
    ],
    fuera: [
      { item: 'Validación de OpenAI integration', razon: 'es Fase 4 smoke real' },
    ],
    horizonte: 'Fin 2026 (mock)',
    estabilidad: 'Estable durante la Fase 3.',
  },
  situacion: undefined,
  datos_faltantes: [],
}

// Plan APLICADO (con los cambios derivados de las decisiones aprobadas +
// la respuesta del usuario integrada). Es lo que el endpoint /apply hubiera
// generado tras procesar las DECISIONES_MOCK.
const PLAN_APPLIED_MOCK = {
  // Escena: cambiada para incluir el texto editado del E01.
  escena: 'Transformar el área de testing en motor de validación robusto, capaz de validar las 4 pantallas del audit-reviewer end-to-end con mocks deterministicos. Validación = abrir cada pantalla + interactuar con cada hallazgo del modal + verificar que el footer se habilita correctamente cuando todos los hallazgos están procesados.',
  metricas: [
    // Métrica 1 modificada (E01: cita textual reemplazada).
    { metrica: 'Pantallas validadas', valor_objetivo: '4 de 4 pantallas validadas con mocks deterministicos (no con OpenAI real — eso es Fase 4 smoke).', valor_actual: '0' },
    // Métrica 2 modificada (E02: aprobado sin edición → cambio_propuesto del reviewer aplicado).
    { metrica: 'Cobertura de bugs visuales', valor_objetivo: 'Reformular como "Bugs visuales detectados: ≤ N permitidos" o aclarar el criterio.', valor_actual: '' },
  ],
  // Fuera intacto (no hubo decisión sobre fuera).
  fuera: [
    { item: 'Validación de OpenAI integration', razon: 'es Fase 4 smoke real' },
  ],
  // Horizonte intacto.
  horizonte: 'Fin 2026 (mock)',
  estabilidad: 'Estable durante la Fase 3.',
}

// ─── 7b) Aplicar PLAN_APPLIED_MOCK al plan (solo --with-report-applied) ─────

async function aplicarCambiosMockAlPlan(planId) {
  assertNotPilot(planId)
  await api('PATCH', `/${TABLA_PLANES_PE}/${planId}`, {
    fields: {
      'Proposito Escena': PLAN_APPLIED_MOCK.escena,
      'Proposito Metricas': JSON.stringify(PLAN_APPLIED_MOCK.metricas),
      'Proposito Fuera': JSON.stringify(PLAN_APPLIED_MOCK.fuera),
      'Horizonte': PLAN_APPLIED_MOCK.horizonte,
      'Proposito Estabilidad': PLAN_APPLIED_MOCK.estabilidad,
    },
  })
  console.log(`  ✔ Plan modificado con cambios aplicados (escena + 2 métricas editadas)`)
}

// ─── 8) Setear estado de entrevista ──────────────────────────────────────────

async function setEntrevistaState(entrevistaId, withReport) {
  const subEstado = WITH_REPORT_APPLIED
    ? 'esperando_aprobacion_final'
    : withReport
    ? 'auditoria_completa'
    : 'esperando_auditoria'
  const fields = {
    'Paso Actual': 1,
    'Sub Bloque Actual': '1.E',
    'Sub Estado Paso': subEstado,
    'Auditorias Paso 1 Count': withReport ? 1 : 0,
    'Ultima Actividad': new Date().toISOString(),
  }
  await api('PATCH', `/${TABLA_ENTREVISTAS_PE}/${entrevistaId}`, { fields, typecast: true })
  console.log(`  ✔ Estado: sub_estado_paso='${fields['Sub Estado Paso']}', paso_actual=1`)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(72))
  console.log(`Seed test audit state — feat/audit-reviewer`)
  const scenarioLabel = WITH_REPORT_APPLIED
    ? 'paso_1_esperando_aprobacion_final (Pantalla 4 con diff)'
    : WITH_REPORT
    ? 'paso_1_auditoria_completa (Pantalla 3 con report mock)'
    : 'paso_1_esperando_auditoria (Pantalla 1 con botones)'
  console.log(`Scenario: ${scenarioLabel}`)
  console.log('═'.repeat(72))

  console.log('\n1. Buscando usuario...')
  const userId = await findUserByEmail(USER_EMAIL)
  console.log(`  ✓ Usuario: ${userId}`)

  console.log('\n2. Buscando o creando plan dummy...')
  const planId = await findOrCreatePlan(userId)

  console.log('\n3. Pre-cargando propósito mock en el plan...')
  await setPropositoMock(planId)

  console.log('\n4. Buscando o creando entrevista...')
  const entrevistaId = await findOrCreateEntrevista(planId)

  console.log('\n5. Limpiando turnos previos...')
  await clearTurnos(entrevistaId)

  console.log('\n6. Creando turnos sintéticos...')
  const turnosCount = await createTurnos(entrevistaId)

  if (WITH_REPORT) {
    console.log(`\n7. Creando turno reviewer ${WITH_REPORT_APPLIED ? 'con decisiones + snapshot pre-apply' : 'con report mock'}...`)
    await createReviewerTurno(entrevistaId, turnosCount, WITH_REPORT_APPLIED)
  }

  if (WITH_REPORT_APPLIED) {
    console.log('\n7b. Aplicando cambios mock al plan (escena editada + 2 métricas modificadas)...')
    await aplicarCambiosMockAlPlan(planId)
  }

  console.log('\n8. Seteando estado de entrevista...')
  await setEntrevistaState(entrevistaId, WITH_REPORT)

  console.log('\n' + '═'.repeat(72))
  console.log('SEED COMPLETO. Para verificar visualmente:')
  console.log('═'.repeat(72))
  console.log(`\n  npm run dev`)
  console.log(`\n  Después abrí en el browser:`)
  if (WITH_REPORT_APPLIED) {
    console.log(`\n    Pantalla 4 (resumen actualizado con diff visible):`)
    console.log(`      http://localhost:3000/planes-estrategicos/${planId}/cierre/1/final`)
    console.log(`\n    Cambios aplicados visibles:`)
    console.log(`      - Escena ideal: extendida con respuesta a Q01 (criterio de validación).`)
    console.log(`      - Métrica 1 "Pantallas validadas": valor_objetivo editado (E01 aprobado_con_cambios).`)
    console.log(`      - Métrica 2 "Cobertura de bugs visuales": valor_objetivo modificado (E02 aprobado).`)
    console.log(`      - E03 ignorado, Q02+Q03 ignoradas, Q01 respondida e integrada.`)
    console.log(`\n    Toggle "Solo cambios | Plan completo" para ver ambos modos.`)
    console.log(`    3 botones: Aceptar y avanzar / Comentar / Re-auditar (1 audit usado, 2 restantes).`)
  } else {
    console.log(`\n    Pantalla 1 (botones Auditar/Saltar):`)
    console.log(`      http://localhost:3000/planes-estrategicos/${planId}/cierre/1`)
    if (WITH_REPORT) {
      console.log(`\n    Pantalla 3 (hidratación con report mock):`)
      console.log(`      Misma URL — el server component detecta auditoria_completa y arranca en P3 directo.`)
    } else {
      console.log(`\n    Pantalla 2 (modal "Auditoría en proceso"):`)
      console.log(`      Click "Auditar" en Pantalla 1 — va a llamar a OpenAI real (~$0.50).`)
      console.log(`      Para ver P2 sin gastar, re-correr este script con --with-report y luego`)
      console.log(`      hacer "Re-auditar" desde P3.`)
    }
  }
  console.log(`\n  Vista de prestigio (Pieza 4) del mismo plan dummy:`)
  console.log(`      http://localhost:3000/planes-estrategicos/${planId}/vista`)
  console.log(`\n  IDs:`)
  console.log(`    plan_id:       ${planId}`)
  console.log(`    entrevista_id: ${entrevistaId}`)
  console.log()
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
