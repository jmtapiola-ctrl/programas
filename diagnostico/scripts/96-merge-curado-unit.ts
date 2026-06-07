// Regresión: el PANEL_UPDATE del chat NUNCA debe poder pisar plan.curado /
// plan.borrador (endpoint-owned). Bug real: plan recZD3ch4YgMyFuVz perdió todas
// las versiones del curado cuando el modelo emitió un curado narrado
// { aprobado, ajustes_estres_aplicados } y el pick top-level lo dejó pisar el
// versionado. Correr: npx tsx diagnostico/scripts/96-merge-curado-unit.ts
import { mergePlan } from '../../lib/pe-panel-update'

let pass = 0, fail = 0
function check(n: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${n}`) }
  else { fail++; console.error(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`) }
}

const curadoVersionado: any = {
  versiones: [{ contexto: 'Plan curado real', decisiones_priorizacion: [], secuencia_movimientos: [], supuestos_criticos: [], criterio_exito: { pleno: 'P', minimo: 'M', path_minimo: 'X' }, alternativas_descartadas: [], cerrado_en: '2026-06-07' }],
  version_activa: 0,
}

// 1. Modelo emite curado narrado basura → se preserva el versionado real.
{
  const current: any = { curado: curadoVersionado }
  const incoming: any = { curado: { aprobado: true, aprobado_en: '2026-06-07', ajustes_estres_aplicados: [{ id: 'E-1', descripcion: 'x' }] } }
  const { value } = mergePlan(current, incoming)
  check('1 curado versionado preservado', JSON.stringify(value.curado) === JSON.stringify(curadoVersionado),
    JSON.stringify(value.curado)?.slice(0, 80))
}
// 2. Modelo NO emite curado → se preserva el current.
{
  const current: any = { curado: curadoVersionado }
  const { value } = mergePlan(current, {} as any)
  check('2 curado preservado sin incoming', JSON.stringify(value.curado) === JSON.stringify(curadoVersionado))
}
// 3. current vacío + incoming con shape correcto (versiones[]) → se acepta (seeding).
{
  const { value } = mergePlan({} as any, { curado: curadoVersionado } as any)
  check('3 seeding curado válido', JSON.stringify(value.curado) === JSON.stringify(curadoVersionado))
}
// 4. current vacío + incoming con shape inválido (sin versiones[]) → NO se acepta.
{
  const { value } = mergePlan({} as any, { curado: { aprobado: true } } as any)
  check('4 rechaza seeding curado inválido', value.curado === undefined, JSON.stringify(value.curado))
}
// 5. borrador endpoint-owned: incoming narrado no pisa.
{
  const borradorReal: any = { iteracion_aceptada: 1, iteraciones: [{ numero: 1, contexto: 'real' }] }
  const { value } = mergePlan({ borrador: borradorReal } as any, { borrador: { foo: 'bar' } } as any)
  check('5 borrador preservado', JSON.stringify(value.borrador) === JSON.stringify(borradorReal))
}

console.log(`\n${pass}/${pass + fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
