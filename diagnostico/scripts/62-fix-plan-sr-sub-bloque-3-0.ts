// Fix quirúrgico: Plan Sr Terravinci tiene paso=3 pero sub_bloque_actual='2.G'.
// Causa: bug histórico en cerrar-paso-final que no reseteaba sub_bloque al
// cerrar el paso anterior. Ya arreglado (Fix 2 — same session) pero este
// script repara el estado pre-existente del Plan Sr para que arranque limpio.
//
// Single update: sub_bloque_actual = '3.0'. NADA más. NO toca propósito,
// situación, datos_faltantes, plan, turnos, counters de audit, ni nada.
//
// IMPORTANTE: solo Plan Sr Terravinci (recFMWxoE5gTQQrf7). NUNCA el dummy.

import { getEntrevistaPE, updateEntrevistaPE } from '@/lib/airtable'

const PLAN_SR_ID = 'recFMWxoE5gTQQrf7'
const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'

async function main() {
  if ((PLAN_SR_ID as string) === (PLAN_DUMMY_ID as string)) {
    throw new Error('Sanity check fail: PLAN_SR_ID === PLAN_DUMMY_ID')
  }
  console.log(`[fix Plan Sr] target: ${PLAN_SR_ID}`)

  const entrevista = await getEntrevistaPE(PLAN_SR_ID)
  if (!entrevista) throw new Error('Entrevista no encontrada')

  console.log(`[fix Plan Sr] Estado ANTES:`)
  console.log(`  paso_actual: ${entrevista.paso_actual}`)
  console.log(`  sub_bloque_actual: ${entrevista.sub_bloque_actual}`)
  console.log(`  sub_estado_paso: ${entrevista.sub_estado_paso}`)

  if (entrevista.paso_actual !== 3) {
    throw new Error(`Pre-check falló: esperaba paso_actual=3, encontré ${entrevista.paso_actual}. Abort para no romper algo.`)
  }
  if (entrevista.sub_bloque_actual === '3.0') {
    console.log(`[fix Plan Sr] Estado ya está en '3.0' — no hay nada que hacer.`)
    return
  }

  await updateEntrevistaPE(entrevista.id!, { sub_bloque_actual: '3.0' })

  const verif = await getEntrevistaPE(PLAN_SR_ID)
  console.log(`\n[fix Plan Sr] Estado DESPUÉS:`)
  console.log(`  paso_actual: ${verif?.paso_actual}`)
  console.log(`  sub_bloque_actual: ${verif?.sub_bloque_actual}`)
  console.log(`  sub_estado_paso: ${verif?.sub_estado_paso}`)

  if (verif?.sub_bloque_actual !== '3.0') {
    throw new Error(`Verification failed: sub_bloque_actual sigue siendo '${verif?.sub_bloque_actual}'`)
  }
  console.log(`\n✓ Plan Sr listo para arrancar Paso 3 desde 3.0 limpio.`)
}

main().catch(e => {
  console.error('[fix Plan Sr] FATAL:', e)
  process.exit(1)
})
