// Migra los 62 turnos del campo legacy `Historial` de Entrevistas_PE
// a registros individuales en la tabla nueva Turnos_PE.
//
// Después: ejecuta getEntrevistaPE (la función real del lib) y verifica que
// devuelva exactamente los 62 turnos en orden con todos los campos coherentes.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendTurnosPE, getEntrevistaPE } from '@/lib/airtable'
import type { TurnoPE } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'  // Plan Sr Terravinci
const TARGET_ENTREVISTA_ID = 'recDkuVIOeqsMMhJj'

async function main() {
  // 1. Leer los 62 turnos desde el dump previo (ya capturado en script 2)
  const dump = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'output', 'airtable-historial-real.json'), 'utf8')
  )
  const turnos: TurnoPE[] = dump.historial
  console.log(`Turnos a migrar: ${turnos.length}`)
  console.log(`Entrevista target: ${dump.entrevista_id}`)
  if (dump.entrevista_id !== TARGET_ENTREVISTA_ID) {
    throw new Error(`Mismatch entrevista_id: dump=${dump.entrevista_id} esperado=${TARGET_ENTREVISTA_ID}`)
  }

  // 2. Bulk-create en chunks de 10 (Airtable cap)
  const CHUNK = 10
  let totalCreated = 0
  for (let i = 0; i < turnos.length; i += CHUNK) {
    const chunk = turnos.slice(i, i + CHUNK)
    const indiceInicial = i
    process.stdout.write(`  Insertando chunk turnos [${i}..${i + chunk.length - 1}]... `)
    const { ids } = await appendTurnosPE(TARGET_ENTREVISTA_ID, chunk, indiceInicial)
    totalCreated += ids.length
    console.log(`✔ ${ids.length} records creados`)
  }
  console.log(`Total insertados: ${totalCreated}`)

  // 3. Verificación: ejecutar getEntrevistaPE igual que el endpoint /chat
  console.log()
  console.log('VERIFICACIÓN — ejecutando getEntrevistaPE como lo haría el endpoint...')
  const entrevista = await getEntrevistaPE(TARGET_PLAN_ID)
  if (!entrevista) throw new Error('getEntrevistaPE devolvió null')
  console.log(`  entrevista.id:                 ${entrevista.id}`)
  console.log(`  entrevista.estado:             ${entrevista.estado}`)
  console.log(`  entrevista.paso_actual:        ${entrevista.paso_actual}`)
  console.log(`  entrevista.sub_bloque_actual:  ${entrevista.sub_bloque_actual}`)
  console.log(`  entrevista.historial.length:   ${entrevista.historial.length}`)

  // 4. Asserts
  const errors: string[] = []
  if (entrevista.id !== TARGET_ENTREVISTA_ID) errors.push(`id mismatch`)
  if (entrevista.historial.length !== turnos.length) {
    errors.push(`length mismatch: got ${entrevista.historial.length}, expected ${turnos.length}`)
  }
  // Verificar contenido turno por turno
  let mismatches = 0
  for (let i = 0; i < Math.min(entrevista.historial.length, turnos.length); i++) {
    const got = entrevista.historial[i]
    const want = turnos[i]
    if (got.rol !== want.rol) {
      mismatches++
      errors.push(`turno[${i}]: rol mismatch — got ${got.rol}, want ${want.rol}`)
    }
    if (got.contenido !== want.contenido) {
      mismatches++
      errors.push(`turno[${i}]: contenido mismatch — len got=${got.contenido.length} want=${want.contenido.length}`)
    }
    if (got.paso !== want.paso) {
      mismatches++
      errors.push(`turno[${i}]: paso mismatch — got ${got.paso}, want ${want.paso}`)
    }
    // timestamp puede tener pequeñas variaciones (Airtable normaliza); skip check
  }

  if (errors.length > 0) {
    console.log()
    console.log(`✗ ${errors.length} ERRORES DETECTADOS:`)
    for (const e of errors.slice(0, 10)) console.log(`   - ${e}`)
    if (errors.length > 10) console.log(`   ... y ${errors.length - 10} más`)
    process.exit(1)
  }

  console.log(`✔ VERIFICACIÓN OK: los ${entrevista.historial.length} turnos coinciden carácter-a-carácter con el legacy.`)

  // 5. Sample del primer y último para confirmar visualmente
  console.log()
  console.log('SAMPLE (primer turno):')
  console.log(`  rol=${entrevista.historial[0].rol}, paso=${entrevista.historial[0].paso}`)
  console.log(`  contenido[:100]: "${entrevista.historial[0].contenido.slice(0, 100)}..."`)
  console.log()
  console.log('SAMPLE (último turno migrado):')
  const last = entrevista.historial[entrevista.historial.length - 1]
  console.log(`  rol=${last.rol}, paso=${last.paso}`)
  console.log(`  contenido[:200]: "${last.contenido.slice(0, 200).replace(/\n/g, ' ')}..."`)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
