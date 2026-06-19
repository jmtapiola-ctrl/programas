// Regresión: mergePreparativos no debe crashear con current parcial (sin
// criterio_exito) — bug real Lab 10x ("Cannot read properties of undefined
// (reading 'por_metrica')"). $0, sin red.
import { mergePlan } from '../../lib/pe-panel-update'
let pass = 0, fail = 0
function check(n: string, cond: boolean, extra?: string){ if(cond){pass++;console.log(`  ✓ ${n}`)} else {fail++;console.error(`  ✗ ${n}${extra?` — ${extra}`:''}`)} }

const prepParcial: any = {  // shape real de Lab 10x: sin criterio_exito, con brechas_revisadas
  areas_afectadas: [{ nombre: 'Labs', responsable: 'Martín' }],
  supuestos_exogenos: [{ descripcion: 'X', tipo: 'macro', probabilidad: 'alta', impacto_signo: 'desfavorable', impacto_magnitud: 'alta', estrategia: 'aceptar', razon: '' }],
  priorizacion_inicial: { desvio_elegido: 'PAI', razon: 'cuello de botella' },
  brechas_revisadas: true,
}
const prepConCriterio: any = {
  areas_afectadas: [{ nombre: 'Labs', responsable: 'Martín' }],
  supuestos_exogenos: [],
  priorizacion_inicial: { desvio_elegido: 'PAI', razon: 'cuello de botella' },
  criterio_exito: { por_metrica: [{ metrica: 'YTV/CAC', pleno: '>3', minimo: '>2.5' }], zona_fracaso: 'YTV/CAC <2.5' },
}

// Caso 1 (el crash real): current parcial SIN criterio_exito + incoming CON criterio_exito.
{
  let threw = false, res: any
  try { res = mergePlan({ preparativos: prepParcial } as any, { preparativos: prepConCriterio } as any) }
  catch (e) { threw = true; console.error('   throw:', (e as any)?.message) }
  console.log('Caso 1 — current sin criterio_exito + incoming con:')
  check('NO crashea', !threw)
  check('criterio_exito.por_metrica mergeado (1 item)', res?.value?.preparativos?.criterio_exito?.por_metrica?.length === 1)
  check('zona_fracaso mergeada', res?.value?.preparativos?.criterio_exito?.zona_fracaso === 'YTV/CAC <2.5')
  check('brechas_revisadas preservado (true)', res?.value?.preparativos?.brechas_revisadas === true)
}

// Caso 2 (3.0.A): current CON criterio_exito + incoming parcial SIN → preservar el current.
{
  let threw = false, res: any
  try { res = mergePlan({ preparativos: prepConCriterio } as any, { preparativos: prepParcial } as any) }
  catch (e) { threw = true; console.error('   throw:', (e as any)?.message) }
  console.log('Caso 2 — current con criterio_exito + incoming sin:')
  check('NO crashea', !threw)
  check('criterio_exito preservado del current', res?.value?.preparativos?.criterio_exito?.por_metrica?.length === 1)
}

// Caso 3: ambos sin criterio_exito → default vacío, sin crash.
{
  let threw = false, res: any
  try { res = mergePlan({ preparativos: prepParcial } as any, { preparativos: { ...prepParcial, brechas_revisadas: undefined } } as any) }
  catch (e) { threw = true; console.error('   throw:', (e as any)?.message) }
  console.log('Caso 3 — ambos sin criterio_exito:')
  check('NO crashea', !threw)
  check('criterio_exito = default vacío', Array.isArray(res?.value?.preparativos?.criterio_exito?.por_metrica) && res.value.preparativos.criterio_exito.por_metrica.length === 0)
  check('brechas_revisadas preservado del current', res?.value?.preparativos?.brechas_revisadas === true)
}

console.log(`\n${pass}/${pass+fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
