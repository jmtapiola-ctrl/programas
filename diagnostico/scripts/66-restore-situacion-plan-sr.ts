// Rollback de plan.situacion del Plan Sr desde un backup .json local.
//
// Uso:
//   npx tsx --env-file=.env.local diagnostico/scripts/66-restore-situacion-plan-sr.ts "<ruta al backup>"
//
// El argumento es la ruta absoluta del .json generado por
// 65-reformatear-situacion-plan-sr.ts.

import { getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'
import { readFileSync, existsSync } from 'fs'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

async function main() {
  if ((PLAN_SR_ID as string) === (PLAN_DUMMY_ID as string)) {
    throw new Error('Sanity check: PLAN_SR_ID === PLAN_DUMMY_ID')
  }
  const backupPath = process.argv[2]
  if (!backupPath) {
    console.error('Uso: npx tsx --env-file=.env.local diagnostico/scripts/66-restore-situacion-plan-sr.ts "<ruta al backup>"')
    process.exit(1)
  }
  if (!existsSync(backupPath)) {
    console.error(`Backup no existe: ${backupPath}`)
    process.exit(1)
  }
  const raw = readFileSync(backupPath, 'utf-8')
  const backupSit = JSON.parse(raw)

  const plan = await getPlanEstrategico(PLAN_SR_ID)
  const sitActual = plan.situacion ?? {}

  console.log(`[restore] Backup: ${backupPath}`)
  console.log(`[restore] Campos en backup: ${Object.keys(backupSit).length}`)
  console.log(`[restore] Campos en plan.situacion actual: ${Object.keys(sitActual).length}`)

  const camposRestaurables = [
    'desvio_principal', 'desvio_cuantificado', 'desvios_secundarios',
    'causa_raiz', 'recursos_actuales', 'recursos_faltantes',
    'intentos_previos', 'resistencias',
    'consecuencia_6m', 'consecuencia_12m',
  ]
  const cambios: string[] = []
  for (const k of camposRestaurables) {
    const actual = (sitActual as any)[k]
    const backup = (backupSit as any)[k]
    if (JSON.stringify(actual) !== JSON.stringify(backup)) {
      cambios.push(k)
    }
  }
  console.log(`[restore] Campos que se restaurarán (difieren del actual): ${cambios.length}`)
  for (const c of cambios) {
    console.log(`  - ${c}`)
  }
  if (cambios.length === 0) {
    console.log(`[restore] ✓ Nada que restaurar (estado actual == backup).`)
    return
  }

  await updatePlanEstrategico(PLAN_SR_ID, { situacion: backupSit })
  console.log(`\n[restore] ✓ Restaurado en Airtable.`)
}

main().catch(e => { console.error('[restore] FATAL:', e); process.exit(1) })
