// Prompts del motor de reconcile (coordinación narrativa→estructura, Hito 2).
//
// Stage A (detección): dado el plan estructurado + la narrativa editada por el
// usuario, detectar dónde la narrativa diverge de la estructura y proponer los
// cambios estructurales. Cada cambio cita VERBATIM el valor estructural actual
// (que_dice_estructura) para poder localizarlo y sustituirlo determinísticamente
// en el apply (lib/reconcile-apply.ts reusa el localizador de audit-apply).
//
// V1 solo aplica superficies de TEXTO (proposito / situacion / criterio). Si la
// divergencia toca inventario / movimientos / dependencias / Gantt, el modelo la
// marca fuera_de_alcance=true: se muestra como informativa pero NO se aplica.

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

export function buildReconcileSystemPrompt(): string {
  return `Sos un motor de COORDINACIÓN entre la versión narrada de un plan estratégico (editada libremente por el usuario) y su versión estructurada (la fuente de verdad de campos como métricas, criterios, situación).

TAREA: detectar dónde la NARRATIVA dice algo DIFERENTE de la ESTRUCTURA, y proponer el cambio estructural correspondiente. Solo divergencias REALES de contenido (un número, una métrica, un criterio, un dato que cambió) — NO reformulaciones de estilo o sinónimos.

REGLAS CRÍTICAS:
- "que_dice_estructura" DEBE ser una cita VERBATIM, copiada EXACTAMENTE de uno de los valores del bloque "Plan estructurado" que te paso (sin el prefijo [campo]). Es lo que se va a buscar y reemplazar literalmente. Si no podés citar verbatim el valor actual, no emitas el cambio.
- "cambio_propuesto" es el nuevo valor estructural completo que refleja la narrativa.
- "surface" es el campo afectado. Usá EXACTAMENTE uno de: "proposito.escena", "proposito.metricas", "proposito.fuera", "proposito.horizonte", "proposito.estabilidad", "situacion", "criterio_exito".
- Si la divergencia es sobre INVENTARIO, MOVIMIENTOS, DEPENDENCIAS, DURACIONES o el GANTT (cosas que NO están en el bloque estructurado que te paso), igual reportala pero con surface "inventario" o "dag" y fuera_de_alcance=true. Esos NO se aplican en esta versión; son informativos.
- Una unidad/cadencia distinta (ej "1000 por mes" vs "250 por semana") ES una divergencia real, aunque el número absoluto sea parecido.

SALIDA: SOLO un objeto JSON válido:
{ "changes": [ { "surface": "...", "target_ref": "", "severidad": "Alta|Media|Baja", "que_dice_estructura": "<verbatim>", "que_dice_narrativa": "<lo que dice la narrativa>", "cambio_propuesto": "<nuevo valor>", "fuera_de_alcance": false } ] }
Si no hay divergencias, devolvé { "changes": [] }.`
}

export function buildReconcileUserMessage(estructuraMd: string, prosa: string): string {
  return `${estructuraMd}\n\n---\n\n# Narrativa editada por el usuario\n\n${prosa}\n\n---\n\nDetectá las divergencias y devolvé el JSON { changes }.`
}
