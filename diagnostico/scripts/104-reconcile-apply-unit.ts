// Unit test sin red de lib/reconcile-apply.ts + extensión del walker (criterio).
// Correr: npx tsx diagnostico/scripts/104-reconcile-apply-unit.ts
import { aplicarReconcileChanges } from '../../lib/reconcile-apply'
import type { PlanEstrategico, ReconcileChange } from '../../lib/types'

let pass = 0, fail = 0
function check(n: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${n}`) }
  else { fail++; console.error(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`) }
}

function plan(): PlanEstrategico {
  return {
    id: 'recX', nombre: 'P', area: 'a', tipo: 'Sr', estado: 'Completado', version: 1, responsable_id: 'u',
    proposito: { escena: 'líder', metricas: [{ metrica: 'ventas', valor_objetivo: '1000 dueños por mes', valor_actual: '100 por mes' }], fuera: [], horizonte: 'fin 2026', estabilidad: 'e' } as any,
    situacion: { desvio_principal: 'd', desvio_cuantificado: 'partimos de 100 por mes', desvios_secundarios: [], causa_raiz: '', consecuencia_6m: '', consecuencia_12m: '', recursos_actuales: '', recursos_faltantes: '', intentos_previos: '', resistencias: [] } as any,
    datos_faltantes: [],
    plan: { preparativos: { criterio_exito: { por_metrica: [{ metrica: 'ventas', pleno: '1000 por mes sostenido', minimo: '800 por mes' }], zona_fracaso: 'menos de 500 por mes' } } as any },
  }
}
const ch = (o: Partial<ReconcileChange>): ReconcileChange => ({ id: 'RC', surface: 'proposito.metricas', target_ref: '', severidad: 'Alta', que_dice_estructura: '', que_dice_narrativa: 'n', cambio_propuesto: '', ...o } as ReconcileChange)

// 1. Cambio de métrica → patch correcto en proposito.metricas.valor_objetivo.
{
  const r = aplicarReconcileChanges(plan(), [ch({ id: 'RC-1', surface: 'proposito.metricas', que_dice_estructura: '1000 dueños por mes', cambio_propuesto: '250 dueños por semana' })])
  check('1 aplicado', r.aplicados === 1, JSON.stringify(r))
  check('1 valor_objetivo cambiado', r.planActualizado.proposito!.metricas[0].valor_objetivo === '250 dueños por semana')
  check('1 warning_retroactivo creado', (r.planActualizado.plan!.warnings_retroactivos ?? []).length === 1)
}
// 2. Cambio de criterio (walker extendido) → patch en criterio_exito.minimo.
{
  const r = aplicarReconcileChanges(plan(), [ch({ id: 'RC-2', surface: 'criterio_exito', que_dice_estructura: '800 por mes', cambio_propuesto: '1000 por semana' })])
  check('2 criterio aplicado', r.aplicados === 1, JSON.stringify(r.warnings))
  check('2 minimo cambiado', (r.planActualizado.plan!.preparativos!.criterio_exito as any).por_metrica[0].minimo === '1000 por semana')
}
// 3. Cambio fuera de alcance → NO aplicado.
{
  const r = aplicarReconcileChanges(plan(), [ch({ id: 'RC-3', surface: 'inventario', fuera_de_alcance: true, que_dice_estructura: 'M-1', cambio_propuesto: 'algo' })])
  check('3 fuera de alcance no aplicado', r.aplicados === 0 && r.fueraDeAlcance === 1)
}
// 4. Texto inexistente → noEncontrados + warning.
{
  const r = aplicarReconcileChanges(plan(), [ch({ id: 'RC-4', que_dice_estructura: 'texto que no existe', cambio_propuesto: 'x' })])
  check('4 no encontrado', r.aplicados === 0 && r.noEncontrados === 1 && r.warnings.length === 1)
}
// 5. No muta el plan original.
{
  const p0 = plan()
  aplicarReconcileChanges(p0, [ch({ id: 'RC-5', que_dice_estructura: '1000 dueños por mes', cambio_propuesto: 'X' })])
  check('5 original intacto', p0.proposito!.metricas[0].valor_objetivo === '1000 dueños por mes')
}
// 6. situacion también editable (desvio_cuantificado).
{
  const r = aplicarReconcileChanges(plan(), [ch({ id: 'RC-6', surface: 'situacion', que_dice_estructura: 'partimos de 100 por mes', cambio_propuesto: 'partimos de 25 por semana' })])
  check('6 situacion aplicada', r.aplicados === 1 && r.planActualizado.situacion!.desvio_cuantificado === 'partimos de 25 por semana')
}

console.log(`\n${pass}/${pass + fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
