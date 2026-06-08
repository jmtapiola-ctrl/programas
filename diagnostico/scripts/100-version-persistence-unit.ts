// Unit test sin red de lib/version-persistence.ts.
// Correr: npx tsx diagnostico/scripts/100-version-persistence-unit.ts
import { denormalizarPlanVersionSnapshot, hidratarPlanVersionSnapshot, siguienteNumeroVersion } from '../../lib/version-persistence'
import type { PlanEstrategico, MovimientoPE, PlanVersion } from '../../lib/types'

let pass = 0, fail = 0
function check(n: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${n}`) }
  else { fail++; console.error(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`) }
}

const movs: MovimientoPE[] = [
  { id: 'M-1', categoria: 'c', nombre: 'Uno', que_resuelve: 'x', costo_banda_ancha: 'media', costo_monetario: { rango_min_usd: 0, rango_max_usd: 1 }, precondiciones: [], desbloquea: [], tipo_dependencia: 'ninguna', dueno: 'A', criterio_exito: 'k', estado_usuario: 'aceptado' } as any,
  { id: 'M-2', categoria: 'c', nombre: 'Dos', que_resuelve: 'y', costo_banda_ancha: 'alta', costo_monetario: { rango_min_usd: 0, rango_max_usd: 2 }, precondiciones: ['M-1'], desbloquea: [], tipo_dependencia: 'fs', dueno: 'B', criterio_exito: 'k', estado_usuario: 'aceptado' } as any,
]

const plan: PlanEstrategico = {
  id: 'recX', nombre: 'P', area: 'a', tipo: 'Sr', estado: 'Completado', version: 1, responsable_id: 'u',
  proposito: { escena: 'llegar', metricas: [{ metrica: 'ventas', valor_objetivo: '1000/mes', valor_actual: '250' }], fuera: [], horizonte: '1a', estabilidad: 'e' } as any,
  situacion: { desvio_principal: 'd', desvio_cuantificado: '', desvios_secundarios: [], causa_raiz: '', consecuencia_6m: '', consecuencia_12m: '', recursos_actuales: '', recursos_faltantes: '', intentos_previos: '', resistencias: [] } as any,
  datos_faltantes: ['falta x'],
  plan: {
    preparativos: { criterio_exito: { por_metrica: [], zona_fracaso: 'zf' } } as any,
    inventario: { movimientos: movs, resumenes_categoria: [], generado_en: '', dag: { movs: [{ mov_id: 'M-1', x: 0, y: 0 }], generado_en: '' } } as any,
    curado: { versiones: [{ contexto: 'c0' } as any, { contexto: 'c1' } as any], version_activa: 1 },
  },
}

// 1. Denormalizar guarda proposito/situacion/preparativos enteros + movs por id.
const snap = denormalizarPlanVersionSnapshot(plan)
check('1 proposito entero', snap.proposito?.metricas?.[0]?.valor_objetivo === '1000/mes')
check('1 movs por id', JSON.stringify(snap.inventario_ref.movs_sin_cambio_ids) === JSON.stringify(['M-1', 'M-2']))
check('1 sin overrides', snap.inventario_ref.movs_override.length === 0)
check('1 curado_ref activa', snap.curado_ref.version_activa === 1)
check('1 dag guardado', !!snap.inventario_ref.dag)
check('1 datos_faltantes', JSON.stringify(snap.datos_faltantes) === JSON.stringify(['falta x']))

// 2. Hidratar reconstruye movs contra el inventario vivo + curado activo.
const h = hidratarPlanVersionSnapshot(snap, movs, plan.plan!.curado!.versiones)
check('2 movs reconstruidos', h.movimientos.length === 2 && h.movimientos[1].nombre === 'Dos')
check('2 curado activo', h.curado?.contexto === 'c1')
check('2 proposito preservado', h.proposito?.metricas?.[0]?.valor_objetivo === '1000/mes')
check('2 preparativos preservado', (h.preparativos as any)?.criterio_exito?.zona_fracaso === 'zf')

// 3. Huérfanos: si el inventario vivo perdió M-2, se filtra sin crash.
const h2 = hidratarPlanVersionSnapshot(snap, [movs[0]], plan.plan!.curado!.versiones)
check('3 huérfano filtrado', h2.movimientos.length === 1 && h2.movimientos[0].id === 'M-1')

// 4. siguienteNumeroVersion
check('4 baseline V1', siguienteNumeroVersion([]) === 'V1')
check('4 V1.1', siguienteNumeroVersion([{ numero: 'V1' } as PlanVersion]) === 'V1.1')
check('4 V1.2', siguienteNumeroVersion([{ numero: 'V1' }, { numero: 'V1.1' }] as PlanVersion[]) === 'V1.2')

console.log(`\n${pass}/${pass + fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
