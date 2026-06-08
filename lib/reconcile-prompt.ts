// Serialización estructural del plan para el chat de edición de planes cerrados.
//
// buildReconcileEstructuraMd produce un dump etiquetado con los valores VERBATIM
// de las superficies editables (proposito / situacion / criterio). El modelo del
// chat (lib/draft-chat-prompt.ts) lo usa como referencia para citar
// que_dice_estructura verbatim → localización determinística en el apply
// (lib/reconcile-apply.ts reusa el localizador de audit-apply).

import type { PlanEstrategico } from './types'

// Dump etiquetado de los campos estructurales editables, con valores VERBATIM.
// El modelo copia estos valores tal cual en que_dice_estructura.
export function buildReconcileEstructuraMd(plan: PlanEstrategico): string {
  const out: string[] = ['# Plan estructurado (valores actuales, verbatim)']

  const p = plan.proposito
  if (p) {
    out.push('\n## proposito')
    if (p.escena) out.push(`- [proposito.escena] ${p.escena}`)
    if (p.horizonte) out.push(`- [proposito.horizonte] ${p.horizonte}`)
    if (p.estabilidad) out.push(`- [proposito.estabilidad] ${p.estabilidad}`)
    for (const m of p.metricas ?? []) {
      if (typeof m === 'string') out.push(`- [proposito.metricas] ${m}`)
      else {
        if (m.metrica) out.push(`- [proposito.metricas:metrica] ${m.metrica}`)
        if (m.valor_objetivo) out.push(`- [proposito.metricas:valor_objetivo] ${m.valor_objetivo}`)
        if (m.valor_actual) out.push(`- [proposito.metricas:valor_actual] ${m.valor_actual}`)
      }
    }
    for (const f of p.fuera ?? []) {
      if (typeof f === 'string') out.push(`- [proposito.fuera] ${f}`)
      else { if (f.item) out.push(`- [proposito.fuera:item] ${f.item}`); if (f.razon) out.push(`- [proposito.fuera:razon] ${f.razon}`) }
    }
  }

  const s = plan.situacion
  if (s) {
    out.push('\n## situacion')
    const campos: [string, string | undefined][] = [
      ['desvio_principal', s.desvio_principal], ['desvio_cuantificado', s.desvio_cuantificado],
      ['causa_raiz', s.causa_raiz], ['recursos_actuales', s.recursos_actuales],
      ['recursos_faltantes', s.recursos_faltantes], ['intentos_previos', s.intentos_previos],
      ['consecuencia_6m', s.consecuencia_6m], ['consecuencia_12m', s.consecuencia_12m],
    ]
    for (const [k, v] of campos) if (v) out.push(`- [situacion.${k}] ${v}`)
    for (const d of s.desvios_secundarios ?? []) {
      if (typeof d !== 'string') { if (d.descripcion) out.push(`- [situacion.desvios_secundarios:descripcion] ${d.descripcion}`); if (d.datos) out.push(`- [situacion.desvios_secundarios:datos] ${d.datos}`) }
    }
    for (const r of s.resistencias ?? []) {
      if (typeof r !== 'string') { if (r.actor) out.push(`- [situacion.resistencias:actor] ${r.actor}`); if (r.descripcion) out.push(`- [situacion.resistencias:descripcion] ${r.descripcion}`) }
    }
  }

  const crit = plan.plan?.preparativos?.criterio_exito as any
  if (crit) {
    out.push('\n## criterio_exito')
    for (const c of crit.por_metrica ?? []) {
      if (c.metrica) out.push(`- [criterio_exito:metrica] ${c.metrica}`)
      if (c.pleno) out.push(`- [criterio_exito:pleno] ${c.pleno}`)
      if (c.minimo) out.push(`- [criterio_exito:minimo] ${c.minimo}`)
    }
    if (crit.zona_fracaso) out.push(`- [criterio_exito:zona_fracaso] ${crit.zona_fracaso}`)
  }

  return out.join('\n')
}
