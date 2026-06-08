// Denormalización / hidratación de PlanVersionSnapshot para persistir versiones
// inmutables del plan en la tabla Versiones_PE. Mismo principio que
// lib/curado-persistence.ts: el objeto pesado (inventario.movimientos[]) NO se
// duplica en cada versión; se referencia por id contra el inventario vivo.
//
// proposito / situacion / preparativos se guardan ENTEROS en el snapshot (son
// chicos y deben quedar congelados — son justo lo que el reconcile de V1 edita).
// El curado se referencia por su version_activa dentro del plan vivo.
//
// ALCANCE V1 (importante): el reconcile de V1 solo edita TEXTOS (proposito /
// situacion / criterio). El inventario NO cambia, así que guardar los movs por id
// y rehidratar contra el inventario vivo es correcto e inmutable (todas las
// versiones comparten el mismo inventario). Cuando llegue la edición de inventario
// (fase F3), el apply que muta el inventario vivo DEBERÁ, antes de mutar, congelar
// en movs_override los movs que difieran en las versiones previas — sino esas
// versiones leerían el inventario nuevo. Ver TODO abajo.

import type {
  PlanEstrategico,
  PlanVersion,
  PlanVersionSnapshot,
  MovimientoPE,
  PropositorPE,
  SituacionPE,
  PreparativosPE,
  PlanCuradoPE,
} from './types'

// Construye el snapshot denormalizado del estado ACTUAL del plan vivo.
export function denormalizarPlanVersionSnapshot(plan: PlanEstrategico): PlanVersionSnapshot {
  const movs = plan.plan?.inventario?.movimientos ?? []
  return {
    proposito: plan.proposito,
    situacion: plan.situacion,
    preparativos: plan.plan?.preparativos,
    inventario_ref: {
      // V1: el inventario está congelado, todos los movs referencian el vivo.
      // TODO(F3 edición de inventario): cuando el inventario vivo pueda cambiar,
      // las versiones previas deben mover sus movs divergentes a movs_override
      // ANTES de mutar el vivo, para preservar inmutabilidad.
      movs_sin_cambio_ids: movs.map(m => m.id),
      movs_override: [],
      dag: plan.plan?.inventario?.dag,
    },
    curado_ref: { version_activa: plan.plan?.curado?.version_activa ?? 0 },
    datos_faltantes: plan.datos_faltantes ?? [],
  }
}

// Resultado de hidratar un snapshot: las partes del plan que la versión congela,
// listas para renderear. (No reconstruye el PlanEstrategico entero — solo lo que
// una versión necesita mostrar.)
export interface PlanVersionHidratada {
  proposito?: PropositorPE
  situacion?: SituacionPE
  preparativos?: PreparativosPE
  movimientos: MovimientoPE[]
  curado: PlanCuradoPE | null
  datos_faltantes: string[]
}

// Reconstruye el shape rico de un snapshot contra el inventario + curado vivos.
// Huérfanos (ids que ya no existen en el inventario vivo) se filtran en silencio,
// igual que hidratarCurado.
export function hidratarPlanVersionSnapshot(
  snap: PlanVersionSnapshot,
  invVivo: MovimientoPE[] | undefined,
  curadoVivo: PlanCuradoPE[] | undefined,
): PlanVersionHidratada {
  const byId = new Map<string, MovimientoPE>()
  for (const m of invVivo ?? []) byId.set(m.id, m)

  const movsDesdeIds = (snap.inventario_ref.movs_sin_cambio_ids ?? [])
    .map(id => byId.get(id))
    .filter((m): m is MovimientoPE => m !== undefined)
  const movimientos = [...(snap.inventario_ref.movs_override ?? []), ...movsDesdeIds]

  const idx = snap.curado_ref?.version_activa ?? 0
  const curado = curadoVivo && curadoVivo.length > 0
    ? (curadoVivo[Math.max(0, Math.min(idx, curadoVivo.length - 1))] ?? null)
    : null

  return {
    proposito: snap.proposito,
    situacion: snap.situacion,
    preparativos: snap.preparativos,
    movimientos,
    curado,
    datos_faltantes: snap.datos_faltantes ?? [],
  }
}

// Número de la próxima versión. Baseline al cerrar = "V1"; cada edición posterior
// incrementa la minor: V1 → V1.1 → V1.2. (Sin major bumps en V1 del feature.)
export function siguienteNumeroVersion(existentes: PlanVersion[]): string {
  if (!existentes || existentes.length === 0) return 'V1'
  return `V1.${existentes.length}`
}
