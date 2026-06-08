// Apply del reconcile (Hito 2). Aplica los cambios aprobados por el usuario sobre
// el plan estructurado, reusando el localizador determinístico de audit-apply
// (aplicarSustitucionTextual). Solo aplica las superficies de TEXTO de V1; los
// cambios fuera_de_alcance se ignoran (son informativos). Cada cambio aplicado
// registra un WarningRetroactivo (mismo audit-trail que cross-block).
//
// Lógica pura (plan + changes → plan modificado) → testeable sin red.

import type { PlanEstrategico, ReconcileChange, WarningRetroactivo, PlanoPE } from './types'
import { aplicarSustitucionTextual } from './audit-apply'

export interface ReconcileApplyResult {
  planActualizado: PlanEstrategico
  aplicados: number
  noEncontrados: number
  fueraDeAlcance: number
  fieldsModificados: string[]
  warnings: string[]
}

export function aplicarReconcileChanges(
  planOriginal: PlanEstrategico,
  changesAprobados: ReconcileChange[],
): ReconcileApplyResult {
  const plan: PlanEstrategico = JSON.parse(JSON.stringify(planOriginal))
  if (!plan.plan) plan.plan = {} as PlanoPE
  if (!plan.plan.warnings_retroactivos) plan.plan.warnings_retroactivos = []

  const fieldsModificados: string[] = []
  const warnings: string[] = []
  let aplicados = 0, noEncontrados = 0, fueraDeAlcance = 0

  for (const ch of changesAprobados) {
    if (ch.fuera_de_alcance) { fueraDeAlcance++; continue }
    const { aplicado, fieldPath } = aplicarSustitucionTextual(plan, ch.que_dice_estructura, ch.cambio_propuesto)
    if (!aplicado) {
      warnings.push(`${ch.id} (${ch.surface}): no se encontró el texto "${ch.que_dice_estructura.slice(0, 80)}…" en el plan. NO se aplicó.`)
      noEncontrados++
      continue
    }
    fieldsModificados.push(fieldPath ?? ch.surface)
    const w: WarningRetroactivo = {
      timestamp: new Date().toISOString(),
      bloque_afectado: ch.surface,
      paso_de_origen: 3,
      sub_bloque_de_origen: 'edicion-plan-cerrado',
      texto_previo: ch.que_dice_estructura,
      descripcion_cambio: `Reconcile: ${ch.cambio_propuesto.slice(0, 280)}${ch.cambio_propuesto.length > 280 ? '…' : ''}`,
      impactos_detectados: [`Severidad: ${ch.severidad}`, `Narrativa: ${ch.que_dice_narrativa.slice(0, 160)}`],
      confirmado_por_user: true,
    }
    plan.plan.warnings_retroactivos.push(w)
    aplicados++
  }

  return { planActualizado: plan, aplicados, noEncontrados, fueraDeAlcance, fieldsModificados, warnings }
}
