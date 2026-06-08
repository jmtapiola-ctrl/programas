// Prompts de la capa narrativa (feature edición de planes cerrados, Hito 1).
//
// Dos usos:
//   1. GENERAR: a partir del plan estructurado, producir una prosa fluida del
//      plan entero + un mapa de "anclas" (sección de prosa → campo estructurado).
//      La prosa es el documento que el usuario edita libremente.
//   2. CHAT: dado el documento actual + un pedido del usuario en lenguaje natural
//      ("son 250/semana, no 1000/mes"), devolver el documento editado. NO toca el
//      plan estructurado — solo la prosa. La reconciliación estructura↔narrativa
//      es un paso aparte (Hito 2).

import type { PlanEstrategico } from './types'
import { getCuradoActivo } from './types'

// ─── Material fuente: markdown determinístico del plan estructurado ───────────

export function buildNarrativaSourceMd(plan: PlanEstrategico): string {
  const out: string[] = []
  out.push(`# ${plan.nombre || 'Plan Estratégico'}`)

  const p = plan.proposito
  if (p) {
    out.push('\n## Propósito')
    if (p.escena) out.push(`**Lugar de llegada:** ${p.escena}`)
    if (p.metricas?.length) {
      out.push('**Métricas:**')
      for (const m of p.metricas) {
        const obj = typeof m === 'string' ? m : `${m.metrica}: ${m.valor_objetivo}${m.valor_actual ? ` (hoy: ${m.valor_actual})` : ''}`
        out.push(`- ${obj}`)
      }
    }
    if (p.fuera?.length) {
      out.push('**Lo que NO haremos:**')
      for (const f of p.fuera) out.push(`- ${typeof f === 'string' ? f : `${f.item}${f.razon ? ` — ${f.razon}` : ''}`}`)
    }
    if (p.horizonte) out.push(`**Horizonte:** ${p.horizonte}`)
    if (p.estabilidad) out.push(`**Estabilidad:** ${p.estabilidad}`)
  }

  const s = plan.situacion
  if (s) {
    out.push('\n## Situación')
    if (s.desvio_principal) out.push(`**Desvío principal:** ${s.desvio_principal}`)
    if (s.desvio_cuantificado) out.push(`**Cuantificación:** ${s.desvio_cuantificado}`)
    if (s.desvios_secundarios?.length) {
      out.push('**Desvíos secundarios:**')
      for (const d of s.desvios_secundarios) out.push(`- ${typeof d === 'string' ? d : `${d.descripcion}${d.datos ? ` (${d.datos})` : ''}`}`)
    }
    if (s.causa_raiz) out.push(`**Causa raíz:** ${s.causa_raiz}`)
    if (s.recursos_actuales) out.push(`**Recursos actuales:** ${s.recursos_actuales}`)
    if (s.recursos_faltantes) out.push(`**Recursos faltantes:** ${s.recursos_faltantes}`)
    if (s.intentos_previos) out.push(`**Intentos previos:** ${s.intentos_previos}`)
    if (s.resistencias?.length) {
      out.push('**Resistencias:**')
      for (const r of s.resistencias) out.push(`- ${typeof r === 'string' ? r : `${r.actor}: ${r.descripcion ?? ''}`}`)
    }
    if (s.consecuencia_6m) out.push(`**Consecuencia 6m:** ${s.consecuencia_6m}`)
    if (s.consecuencia_12m) out.push(`**Consecuencia 12m:** ${s.consecuencia_12m}`)
  }

  const crit = plan.plan?.preparativos?.criterio_exito
  if (crit) {
    out.push('\n## Criterio de éxito')
    if (crit.por_metrica?.length) {
      for (const c of crit.por_metrica as any[]) {
        out.push(`- ${c.metrica ?? ''}: ${c.criterio ?? c.objetivo ?? JSON.stringify(c)}`)
      }
    }
    if ((crit as any).zona_fracaso) out.push(`**Zona de fracaso:** ${(crit as any).zona_fracaso}`)
  }

  const c = getCuradoActivo(plan)
  if (c) {
    out.push('\n## Plan curado')
    if (c.contexto) out.push(c.contexto)
    if (c.decisiones_priorizacion?.length) {
      out.push('\n**Decisiones de priorización:**')
      for (const d of c.decisiones_priorizacion) out.push(`- ${d.decision} — ${d.razon}`)
    }
    if (c.secuencia_movimientos?.length) {
      out.push('\n**Secuencia:**')
      for (const fase of c.secuencia_movimientos) {
        const movs = (fase.movimientos ?? []).map(m => `${m.id} (${m.nombre})`).join(', ')
        out.push(`- **${fase.fase}**: ${movs}${fase.razon_secuencia ? ` — ${fase.razon_secuencia}` : ''}`)
      }
    }
    if (c.criterio_exito) {
      out.push(`\n**Éxito pleno:** ${c.criterio_exito.pleno}`)
      out.push(`**Éxito mínimo:** ${c.criterio_exito.minimo}`)
    }
    if (c.alternativas_descartadas?.length) {
      out.push('\n**Alternativas descartadas:**')
      for (const a of c.alternativas_descartadas) out.push(`- ${a.decision} — ${a.razon}`)
    }
  }

  return out.join('\n')
}

// ─── Generación de la prosa narrativa + anclas ────────────────────────────────

export function buildNarrativaGenSystemPrompt(): string {
  return `Sos un asistente que convierte un plan estratégico estructurado en un DOCUMENTO NARRADO en prosa fluida, claro y profesional, en español rioplatense.

OBJETIVO: producir una versión "narrada" del plan — la que un humano lee y edita cómodamente. Debe cubrir TODO el contenido del plan estructurado (propósito, situación, criterio de éxito, plan curado) sin inventar nada ni omitir datos. Mantené los números, métricas, nombres de movimientos (ej "M-3 (Definir estructura)") y dueños tal cual.

FORMATO: markdown con secciones (##). Prosa fluida, no bullets crudos copiados — narralo. Conservá las métricas exactas.

Además devolvé un mapa de ANCLAS: por cada dato estructurado importante que aparezca en la prosa, una entrada {seccion, campo_estructurado, texto_origen} donde:
- seccion: el título de sección donde aparece (ej "Propósito").
- campo_estructurado: el campo del plan al que corresponde, usando esta notación: "proposito.escena", "proposito.metricas", "proposito.fuera", "proposito.horizonte", "proposito.estabilidad", "situacion.desvio_principal", "situacion.<campo>", "criterio_exito".
- texto_origen: el fragmento de prosa que deriva de ese campo.
Las anclas son pistas para una reconciliación posterior; no hace falta que sean exhaustivas, pero cubrí las métricas y los criterios.

SALIDA: SOLO un objeto JSON válido, sin texto alrededor:
{ "prosa": "<markdown>", "anclas": [{ "seccion": "...", "campo_estructurado": "...", "texto_origen": "..." }] }`
}

export function buildNarrativaGenUserMessage(sourceMd: string): string {
  return `Acá está el plan estratégico estructurado. Narralo en prosa fluida y devolvé el JSON { prosa, anclas }.\n\n---\n\n${sourceMd}`
}

// ─── Edición conversacional de la prosa ───────────────────────────────────────

export function buildNarrativaChatSystemPrompt(): string {
  return `Sos un editor del DOCUMENTO NARRADO de un plan estratégico. El usuario te pide cambios en lenguaje natural (ej "son 250 por semana, no 1000 por mes"; "sacá la parte de X"; "agregá que Y").

Tu tarea: aplicar el cambio pedido al documento, devolviendo el documento COMPLETO editado, manteniendo coherencia interna (si cambia una métrica, ajustá todas las menciones de esa métrica en el documento). NO inventes datos nuevos que el usuario no pidió. Conservá el resto del documento intacto (mismo estilo, mismas secciones).

NO estás tocando ningún sistema estructurado todavía — solo este documento de prosa. La reconciliación con el plan estructurado es un paso posterior y separado.

SALIDA: SOLO un objeto JSON válido, sin texto alrededor:
{ "prosa": "<documento markdown completo editado>", "resumen_cambio": "<1 línea de qué cambiaste>" }`
}

export function buildNarrativaChatUserMessage(prosa: string, mensaje: string): string {
  return `DOCUMENTO ACTUAL:\n\n${prosa}\n\n---\n\nPEDIDO DEL USUARIO:\n${mensaje}\n\nDevolvé el JSON { prosa, resumen_cambio } con el documento completo editado.`
}
