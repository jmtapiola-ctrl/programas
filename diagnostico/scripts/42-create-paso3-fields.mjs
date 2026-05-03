// Schema migration — Fase A del Paso 3.
// Agrega 2 campos:
//   - planes_estrategicos / "Plan Paso 3 JSON" (multilineText)
//     JSON serializado del PlanoPE (preparativos + inventario + palancas +
//     borrador + estres + curado). Decisión D2 (3 mayo 2026): un solo campo
//     consolidado para V1 en lugar de 6 columnas separadas.
//   - entrevistas_pe / "Auditorias Paso 3 Count" (number, default 0)
//     Cantidad de auditorías ejecutadas sobre el Paso 3 (max 3).
//
// Idempotente: si los campos ya existen, los saltea.
//
// Uso:
//   npx tsx --env-file=.env.local diagnostico/scripts/42-create-paso3-fields.mjs

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
const TABLA_PLANES_PE = 'tblPJC1VMQclfCqc7'
const TABLA_ENTREVISTAS_PE = 'tblbOOk5jvVu3GsPJ'

if (!BASE_ID || !API_KEY) {
  console.error('FATAL: faltan AIRTABLE_BASE_ID o AIRTABLE_API_KEY')
  process.exit(1)
}

const META_URL = `https://api.airtable.com/v0/meta/bases/${BASE_ID}`

const migrations = [
  {
    table: TABLA_PLANES_PE,
    field: {
      name: 'Plan Paso 3 JSON',
      type: 'multilineText',
      description: 'JSON serializado del PlanoPE (Paso 3): preparativos + inventario + palancas + borrador + estres + curado. Decisión D2 — un solo campo para V1.',
    },
  },
  {
    table: TABLA_ENTREVISTAS_PE,
    field: {
      name: 'Auditorias Paso 3 Count',
      type: 'number',
      description: 'Cantidad de auditorías ejecutadas sobre el Paso 3 (max 3 enforced en backend).',
      options: { precision: 0 },
    },
  },
]

async function main() {
  console.log('═'.repeat(72))
  console.log('Schema migration — Fase A Paso 3')
  console.log('═'.repeat(72))

  for (const { table, field } of migrations) {
    process.stdout.write(`  ${field.name.padEnd(35)} en ${table.padEnd(20)} `)
    const r = await fetch(`${META_URL}/tables/${table}/fields`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(field),
    })
    const text = await r.text()
    if (!r.ok) {
      if (text.includes('DUPLICATE_OR_EMPTY_FIELD_NAME')) {
        console.log('YA EXISTE — saltando')
        continue
      }
      console.log(`HTTP ${r.status}\n${text}`)
      process.exit(1)
    }
    const created = JSON.parse(text)
    console.log(`✔ ${created.id}`)
  }

  console.log('\n✔ Schema migration completada')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
