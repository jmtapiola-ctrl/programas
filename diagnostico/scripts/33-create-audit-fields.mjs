// Schema migration Fase 1 — feat/audit-reviewer.
//
// Crea los campos necesarios para el feature de auditoría cross-provider:
//
//   1. PATCH del campo `Rol` en Turnos_PE: agregar choices `reviewer` + `snapshot`.
//   2. POST 14 campos nuevos a Turnos_PE (rol=reviewer).
//   3. POST 2 campos nuevos a Turnos_PE (rol=snapshot).
//   4. POST 3 campos nuevos a entrevistas_pe (Sub Estado Paso + 2 counters).
//
// Idempotente: si un campo ya existe (DUPLICATE_OR_EMPTY_FIELD_NAME), se saltea.
// La PATCH al `Rol` es idempotente porque preserva choices existentes con sus IDs
// y solo agrega los nuevos nombres (Airtable los crea si no existen).
//
// Uso:
//   npx tsx --env-file=.env.local diagnostico/scripts/33-create-audit-fields.mjs
//
// Output: imprime los field IDs creados al final, listos para copiar a lib/airtable.ts.

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
const TABLA_TURNOS_PE = 'tblWxPv53CRscq18w'
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'

if (!BASE_ID || !API_KEY) {
  console.error('FATAL: faltan AIRTABLE_BASE_ID o AIRTABLE_API_KEY en el environment')
  process.exit(1)
}

const META_URL = `https://api.airtable.com/v0/meta/bases/${BASE_ID}`

// ─── Helpers ────────────────────────────────────────────────────────────────

async function metaGet(path) {
  const r = await fetch(`${META_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  const text = await r.text()
  if (!r.ok) {
    console.error(`GET ${path} → HTTP ${r.status}\n${text}`)
    process.exit(1)
  }
  return JSON.parse(text)
}

async function metaPost(path, body) {
  const r = await fetch(`${META_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  if (!r.ok) {
    if (text.includes('DUPLICATE_OR_EMPTY_FIELD_NAME')) return { _existed: true }
    console.error(`POST ${path} → HTTP ${r.status}\n${text}`)
    process.exit(1)
  }
  return JSON.parse(text)
}

async function metaPatch(path, body) {
  const r = await fetch(`${META_URL}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  if (!r.ok) {
    console.error(`PATCH ${path} → HTTP ${r.status}\n${text}`)
    process.exit(1)
  }
  return JSON.parse(text)
}

async function createFields(tableId, fields, label) {
  const created = {}
  console.log(`\n── Creando campos en ${label} (tableId=${tableId}) ──`)
  for (const field of fields) {
    process.stdout.write(`  ${field.name.padEnd(45)} `)
    const r = await metaPost(`/tables/${tableId}/fields`, field)
    if (r._existed) {
      console.log('YA EXISTE — saltando')
    } else {
      created[field.name] = r.id
      console.log(`✔ ${r.id}`)
    }
  }
  return created
}

// ─── Definiciones de campos ─────────────────────────────────────────────────

const reviewerFields = [
  {
    name: 'Reviewer Bloque Auditado',
    type: 'number',
    description: 'Qué Paso del plan se auditó (1, 2, ...).',
    options: { precision: 0 },
  },
  {
    name: 'Reviewer Modelo',
    type: 'singleLineText',
    description: 'Modelo usado por el reviewer (ej: gpt-5.5).',
  },
  {
    name: 'Reviewer Errores Total',
    type: 'number',
    description: 'Cantidad total de errores reportados por el reviewer.',
    options: { precision: 0 },
  },
  {
    name: 'Reviewer Preguntas Total',
    type: 'number',
    description: 'Cantidad total de preguntas (críticas + recomendadas) del reviewer.',
    options: { precision: 0 },
  },
  {
    name: 'Reviewer Decisiones JSON',
    type: 'multilineText',
    description: 'Array JSON con las decisiones del usuario (aprobar/ignorar/responder/etc.) sobre cada hallazgo.',
  },
  {
    name: 'Reviewer Snapshot Pre Apply JSON',
    type: 'multilineText',
    description: 'Estado del resumen del Paso ANTES de aplicar los cambios aprobados. Habilita rollback dentro de la auditoría.',
  },
  {
    name: 'Reviewer Costo USD',
    type: 'number',
    description: 'Costo estimado de la llamada al reviewer en USD.',
    options: { precision: 4 },
  },
  {
    name: 'Reviewer Latencia MS',
    type: 'number',
    description: 'Latencia de la llamada al reviewer en milisegundos.',
    options: { precision: 0 },
  },
  {
    name: 'Reviewer Skipped',
    type: 'checkbox',
    description: 'Si el usuario saltó la auditoría (true) o la corrió (false).',
    options: { icon: 'check', color: 'greenBright' },
  },
  {
    name: 'Reviewer Skipped Reason',
    type: 'singleLineText',
    description: 'Razón del skip: user_choice | api_failure | cost_cap_exceeded.',
  },
  {
    name: 'Reviewer Failed',
    type: 'checkbox',
    description: 'Si la auditoría falló tras 3 retries (true) o se completó OK (false).',
    options: { icon: 'xCheckbox', color: 'redBright' },
  },
  {
    name: 'Reviewer Retry Count',
    type: 'number',
    description: 'Cantidad de retries que se necesitaron para obtener un reporte válido (0-3).',
    options: { precision: 0 },
  },
  {
    name: 'Apply Changes Cost USD',
    type: 'number',
    description: 'Costo de la llamada a Opus para apply de questions respondidas (0 si no hubo questions).',
    options: { precision: 4 },
  },
  {
    name: 'Apply Changes Latency MS',
    type: 'number',
    description: 'Latencia de la llamada de apply en milisegundos (0 si no hubo questions).',
    options: { precision: 0 },
  },
]

const snapshotFields = [
  {
    name: 'Snapshot Paso',
    type: 'number',
    description: 'Qué Paso quedó congelado en este snapshot inmutable (1, 2, ...).',
    options: { precision: 0 },
  },
  {
    name: 'Snapshot Resumen JSON',
    type: 'multilineText',
    description: 'Estado completo del resumen (proposito + situacion + datos_faltantes) al cierre definitivo del Paso.',
  },
]

const entrevistasFields = [
  {
    name: 'Sub Estado Paso',
    type: 'singleSelect',
    description: 'Sub-estado del Paso actual dentro del flujo de cierre+auditoría. Default: en_curso.',
    options: {
      choices: [
        { name: 'en_curso' },
        { name: 'cierre_sugerido' },
        { name: 'esperando_auditoria' },
        { name: 'auditoria_en_proceso' },
        { name: 'auditoria_completa' },
        { name: 'aplicando_cambios' },
        { name: 'esperando_aprobacion_final' },
        { name: 'completo' },
      ],
    },
  },
  {
    name: 'Auditorias Paso 1 Count',
    type: 'number',
    description: 'Cantidad de auditorías realizadas sobre el Paso 1. Max 3 (validado en backend).',
    options: { precision: 0 },
  },
  {
    name: 'Auditorias Paso 2 Count',
    type: 'number',
    description: 'Cantidad de auditorías realizadas sobre el Paso 2. Max 3 (validado en backend).',
    options: { precision: 0 },
  },
]

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(72))
  console.log('Schema migration Fase 1 — feat/audit-reviewer')
  console.log('═'.repeat(72))

  // ── Step 1: Inspeccionar campo `Rol` y reportar choices faltantes ──
  //
  // NOTA: La Meta API de Airtable rechaza PATCH a singleSelects para agregar
  // choices nuevas (HTTP 422 en este workspace). Esto requiere acción manual
  // del usuario en la UI: abrir el campo Rol y agregar 'reviewer' + 'snapshot'.
  // Workaround alternativo: usar `typecast: true` en los `createRecord` de
  // appendReviewerTurno/appendSnapshotTurno — Airtable crea la opción on-the-fly.
  console.log('\n── Step 1: Inspeccionar campo `Rol` ──')
  const tablesData = await metaGet('/tables')
  const turnosTable = tablesData.tables.find(t => t.id === TABLA_TURNOS_PE)
  if (!turnosTable) {
    console.error(`No se encontró tabla Turnos_PE (${TABLA_TURNOS_PE})`)
    process.exit(1)
  }
  const rolField = turnosTable.fields.find(f => f.name === 'Rol')
  if (!rolField) {
    console.error('No se encontró campo Rol en Turnos_PE')
    process.exit(1)
  }
  console.log(`  fieldId del Rol: ${rolField.id}`)
  console.log(`  choices actuales: ${rolField.options.choices.map(c => c.name).join(', ')}`)

  const existingNames = new Set(rolField.options.choices.map(c => c.name))
  const needsReviewer = !existingNames.has('reviewer')
  const needsSnapshot = !existingNames.has('snapshot')
  const choicesFaltantes = [needsReviewer && 'reviewer', needsSnapshot && 'snapshot'].filter(Boolean)

  if (choicesFaltantes.length === 0) {
    console.log('  ✔ Ambas choices ya existen (reviewer + snapshot)')
  } else {
    console.log(`  ⚠ Choices faltantes: ${choicesFaltantes.join(', ')}`)
    console.log(`  ⚠ ACCIÓN MANUAL REQUERIDA: agregalas en Airtable UI:`)
    console.log(`     1. Abrí el base apprq0pL8aiCNMZvv → tabla Turnos_PE`)
    console.log(`     2. Click en el campo "Rol" → "Customize field type"`)
    console.log(`     3. Agregá 2 choices nuevas: "reviewer" y "snapshot"`)
    console.log(`     4. Save`)
    console.log(`     (Tiempo: ~30 segundos. La Meta API rechaza el PATCH para esto.)`)
    console.log(`  Alternativa: usar typecast:true en createRecord — Airtable crea la opción on-the-fly.`)
  }

  // ── Step 2 + 3: Campos nuevos en Turnos_PE ──
  const reviewerIds = await createFields(TABLA_TURNOS_PE, reviewerFields, 'Turnos_PE (rol=reviewer)')
  const snapshotIds = await createFields(TABLA_TURNOS_PE, snapshotFields, 'Turnos_PE (rol=snapshot)')

  // ── Step 4: Campos nuevos en entrevistas_pe ──
  const entrevistasIds = await createFields(TABLA_ENTREVISTAS_PE, entrevistasFields, 'entrevistas_pe')

  // ── Resumen ──
  console.log('\n' + '═'.repeat(72))
  console.log('Field IDs creados — copiar a lib/airtable.ts:')
  console.log('═'.repeat(72))
  const all = { ...reviewerIds, ...snapshotIds, ...entrevistasIds }
  if (Object.keys(all).length === 0) {
    console.log('(ninguno — todos los campos ya existían)')
  } else {
    for (const [name, id] of Object.entries(all)) {
      console.log(`  ${name.padEnd(45)} ${id}`)
    }
  }
  console.log('\n✔ Schema migration completada')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
