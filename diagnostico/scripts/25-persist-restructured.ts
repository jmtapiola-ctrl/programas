// Pieza 1 final: persistir los 4 arrays re-estructurados al Plan Sr.
//
// Inputs:
//   - 24-arrays-restructured.json: metricas (7), fuera (9), desvios_secundarios (3)
//   - 26-resistencias-restructured.json: resistencias (6) con shape extendido
//
// Persistencia: actualiza solo los 4 campos de array. Los demás campos del plan
// (escena, horizonte, estabilidad, desvio_principal, causa_raiz, etc.) se
// preservan tal cual están — usa merge protector pero pasando los demás
// campos sin cambios desde el current.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TARGET_PLAN_ID = 'recFMWxoE5gTQQrf7'

async function main() {
  console.log('═'.repeat(72))
  console.log('PIEZA 1 final — Persistir 4 arrays re-estructurados')
  console.log('═'.repeat(72))

  const arrays = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'output', '24-arrays-restructured.json'), 'utf8')
  ).restructured

  const resData = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'output', '26-resistencias-restructured.json'), 'utf8')
  )

  const metricas = arrays.metricas
  const fuera = arrays.fuera
  const desviosSec = arrays.desvios_secundarios
  const resistencias = resData.resistencias

  console.log(`Inputs cargados:`)
  console.log(`  metricas: ${metricas.length} objetos {metrica, valor_objetivo, valor_actual}`)
  console.log(`  fuera: ${fuera.length} objetos {item, razon}`)
  console.log(`  desvios_secundarios: ${desviosSec.length} objetos {descripcion, datos}`)
  console.log(`  resistencias: ${resistencias.length} objetos {actor, descripcion, mitigacion, tipo, criticidad}`)
  console.log()

  // Cargar plan actual y construir el update preservando los campos no-array
  const plan = await getPlanEstrategico(TARGET_PLAN_ID)
  if (!plan.proposito || !plan.situacion) {
    throw new Error('Plan no tiene proposito/situacion. Abortando — algo raro pasó.')
  }

  console.log('Construyendo update (los campos string preservan su valor actual):')
  const propositoNew = {
    escena: plan.proposito.escena,           // sin cambios
    metricas,                                 // re-estructurado
    fuera,                                    // re-estructurado
    horizonte: plan.proposito.horizonte,     // sin cambios
    estabilidad: plan.proposito.estabilidad, // sin cambios
  }
  const situacionNew = {
    desvio_principal: plan.situacion.desvio_principal,         // sin cambios
    desvio_cuantificado: plan.situacion.desvio_cuantificado,   // sin cambios
    desvios_secundarios: desviosSec,                           // re-estructurado
    causa_raiz: plan.situacion.causa_raiz,                     // sin cambios
    consecuencia_6m: plan.situacion.consecuencia_6m,           // sin cambios
    consecuencia_12m: plan.situacion.consecuencia_12m,         // sin cambios
    recursos_actuales: plan.situacion.recursos_actuales,       // sin cambios
    recursos_faltantes: plan.situacion.recursos_faltantes,     // sin cambios
    intentos_previos: plan.situacion.intentos_previos,         // sin cambios
    resistencias,                                              // re-estructurado
  }

  console.log('  proposito.escena: preservada (', plan.proposito.escena.length, 'chars)')
  console.log('  proposito.metricas: 7 objetos NUEVOS')
  console.log('  proposito.fuera: 9 objetos NUEVOS')
  console.log('  proposito.horizonte: preservado ("', plan.proposito.horizonte, '")')
  console.log('  proposito.estabilidad: preservada (', plan.proposito.estabilidad.length, 'chars)')
  console.log('  situacion.desvio_principal: preservada (', plan.situacion.desvio_principal.length, 'chars)')
  console.log('  situacion.desvio_cuantificado: preservada (', plan.situacion.desvio_cuantificado.length, 'chars)')
  console.log('  situacion.desvios_secundarios: 3 objetos NUEVOS')
  console.log('  situacion.causa_raiz: preservada (', plan.situacion.causa_raiz.length, 'chars)')
  console.log('  situacion.consecuencia_6m/12m: preservadas')
  console.log('  situacion.recursos_actuales/faltantes: preservados')
  console.log('  situacion.intentos_previos: preservada')
  console.log('  situacion.resistencias: 6 objetos NUEVOS (shape extendido)')
  console.log('  datos_faltantes: NO se toca (sigue como está)')
  console.log()

  // Persistir
  console.log('Persistiendo en Airtable...')
  await updatePlanEstrategico(TARGET_PLAN_ID, {
    proposito: propositoNew,
    situacion: situacionNew,
    horizonte: plan.proposito.horizonte,
  })
  console.log('  ✔ updatePlanEstrategico')

  // Verificar leyendo de nuevo
  console.log()
  console.log('Verificación post-persist:')
  const planAfter = await getPlanEstrategico(TARGET_PLAN_ID)
  const m0 = planAfter.proposito?.metricas?.[0] as any
  const f0 = planAfter.proposito?.fuera?.[0] as any
  const d0 = planAfter.situacion?.desvios_secundarios?.[0] as any
  const r0 = planAfter.situacion?.resistencias?.[0] as any

  console.log(`  metricas[0] keys: ${m0 ? Object.keys(m0).join(', ') : 'undefined'}`)
  console.log(`  fuera[0] keys: ${f0 ? Object.keys(f0).join(', ') : 'undefined'}`)
  console.log(`  desvios_secundarios[0] keys: ${d0 ? Object.keys(d0).join(', ') : 'undefined'}`)
  console.log(`  resistencias[0] keys: ${r0 ? Object.keys(r0).join(', ') : 'undefined'}`)

  const allObjects =
    m0 && typeof m0 === 'object' && 'metrica' in m0 &&
    f0 && typeof f0 === 'object' && 'item' in f0 &&
    d0 && typeof d0 === 'object' && 'descripcion' in d0 &&
    r0 && typeof r0 === 'object' && 'actor' in r0 && 'descripcion' in r0 && 'mitigacion' in r0

  if (allObjects) {
    console.log()
    console.log('✔ Los 4 arrays están persistidos como objetos con sus propiedades correctas')
  } else {
    console.error()
    console.error('✗ Algo no quedó bien. Revisar.')
    process.exit(1)
  }

  console.log()
  console.log('═'.repeat(72))
  console.log('PIEZA 1 PERSISTIDA — listo para verificación visual del usuario')
  console.log('═'.repeat(72))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
