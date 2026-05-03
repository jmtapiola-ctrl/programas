// Schema migration — agregar 2 campos nuevos a Turnos_PE:
//   - Reviewer Read Only: checkbox. true = audit retroactivo / educativo, no
//     debe modificar el plan. UI termina en Pantalla 3 con botón "Cerrar".
//   - Reviewer Ejecutado Via Script: checkbox. true = audit corrida desde
//     script (no desde la UI deployada). Indicador para el dashboard.
//
// Idempotente: si los campos ya existen, los saltea.
//
// Uso:
//   npx tsx --env-file=.env.local diagnostico/scripts/41-add-readonly-fields.mjs

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
const TABLA_TURNOS_PE = 'tblWxPv53CRscq18w'

if (!BASE_ID || !API_KEY) {
  console.error('FATAL: faltan AIRTABLE_BASE_ID o AIRTABLE_API_KEY')
  process.exit(1)
}

const META_URL = `https://api.airtable.com/v0/meta/bases/${BASE_ID}`

const fields = [
  {
    name: 'Reviewer Read Only',
    type: 'checkbox',
    description: 'true = audit retroactivo o educativo, NO debe aplicarse al plan vivo. UI termina en Pantalla 3 con botón "Cerrar".',
    options: { icon: 'flag', color: 'orangeBright' },
  },
  {
    name: 'Reviewer Ejecutado Via Script',
    type: 'checkbox',
    description: 'true = audit corrida desde script de orquestación (no desde la UI deployada). Útil para el dashboard de métricas.',
    options: { icon: 'dot', color: 'grayBright' },
  },
]

async function main() {
  console.log('═'.repeat(72))
  console.log('Schema migration — campos read_only / via_script en Turnos_PE')
  console.log('═'.repeat(72))

  for (const field of fields) {
    process.stdout.write(`  ${field.name.padEnd(45)} `)
    const r = await fetch(`${META_URL}/tables/${TABLA_TURNOS_PE}/fields`, {
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
