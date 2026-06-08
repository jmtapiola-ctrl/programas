// Prompts del chat de edición de planes cerrados (modelo "vista lado a lado").
//
// El usuario habla en lenguaje natural ("son 250/semana, no 1000/mes"). El
// modelo NO aplica nada: explica el IMPACTO del cambio (qué campos del plan
// ripplean) y PROPONE los cambios estructurales como una lista. El usuario los
// confirma desde la UI; recién ahí se aplican al borrador (copia de trabajo).
//
// Reusa el dump estructural verbatim (buildReconcileEstructuraMd) para que las
// propuestas citen que_dice_estructura verbatim → localización determinística en
// el apply (lib/reconcile-apply.ts).

import type { PlanEstrategico, PlanDraftMensaje } from './types'
import { getCuradoActivo } from './types'
import { buildReconcileEstructuraMd } from './reconcile-prompt'

// Construye un pseudo-plan a partir del borrador para serializar sus campos
// editables (proposito / situacion / criterio).
export function draftComoPlan(draft: {
  proposito?: any; situacion?: any; preparativos?: any
}): PlanEstrategico {
  return {
    id: '', nombre: '', area: '', tipo: 'Sr', estado: 'Completado', version: 1, responsable_id: '',
    proposito: draft.proposito, situacion: draft.situacion,
    plan: { preparativos: draft.preparativos } as any,
    datos_faltantes: [],
  } as PlanEstrategico
}

// Contexto de SOLO LECTURA del resto del plan (inventario + curado), para que el
// modelo entienda el ripple aunque esas partes no se editen en V1.
function contextoReferenciaMd(planVivo: PlanEstrategico): string {
  const out: string[] = ['# Referencia (read-only — NO editable en esta versión)']
  const movs = planVivo.plan?.inventario?.movimientos?.filter(m => m.estado_usuario !== 'quitado') ?? []
  if (movs.length) {
    out.push(`\n## Movimientos del inventario (${movs.length})`)
    for (const m of movs) out.push(`- ${m.id} (${m.nombre})${m.brechas_atacadas?.length ? ` — ataca: ${m.brechas_atacadas.join(', ')}` : ''}`)
  }
  const c = getCuradoActivo(planVivo)
  if (c?.contexto) out.push(`\n## Plan curado (extracto)\n${c.contexto.slice(0, 800)}`)
  return out.join('\n')
}

export function buildDraftChatSystemPrompt(): string {
  return `Sos un editor experto de planes estratégicos cerrados. El usuario te pide cambios en lenguaje natural sobre un plan ya cerrado. Tu trabajo es DOBLE:

1. EXPLICAR EL IMPACTO: en prosa breve y clara (español rioplatense), decile qué partes del plan toca su pedido y cómo rippplea — qué métricas, criterios, secciones de situación cambian, y si hay implicancias en partes que NO se pueden editar todavía (inventario, dependencias, Gantt), avisáselo explícitamente.

2. PROPONER LOS CAMBIOS ESTRUCTURALES: una lista de cambios concretos. NO los apliques — el usuario los confirma. Cada cambio:
   - "que_dice_estructura": cita VERBATIM del valor actual, copiada EXACTAMENTE del bloque "Plan estructurado" (sin el prefijo [campo]). Es lo que se va a localizar y reemplazar. Si no podés citar verbatim, no propongas ese cambio (explicalo en la prosa).
   - "cambio_propuesto": el nuevo valor estructural completo.
   - "surface": uno de "proposito.escena", "proposito.metricas", "proposito.fuera", "proposito.horizonte", "proposito.estabilidad", "situacion", "criterio_exito". Si toca inventario/dependencias/Gantt, usá "inventario" o "dag" y fuera_de_alcance=true (es informativo, no se aplica).
   - "que_dice_narrativa": breve, por qué cambia (el pedido del usuario).
   - "severidad": Alta/Media/Baja según el impacto.

Si el usuario solo pregunta o conversa (no pide un cambio), respondé en prosa y devolvé "cambios": [].

SALIDA: SOLO un objeto JSON válido:
{ "respuesta": "<prosa del impacto>", "cambios": [ { "surface": "...", "que_dice_estructura": "<verbatim>", "que_dice_narrativa": "...", "cambio_propuesto": "...", "severidad": "Media", "fuera_de_alcance": false } ] }`
}

export function buildDraftChatUserMessage(
  planVivo: PlanEstrategico,
  draftPlan: PlanEstrategico,
  historial: PlanDraftMensaje[],
  mensaje: string,
): string {
  const estructura = buildReconcileEstructuraMd(draftPlan)
  const referencia = contextoReferenciaMd(planVivo)
  const hist = historial.length
    ? historial.map(m => `${m.rol === 'user' ? 'USUARIO' : 'EDITOR'}: ${m.texto}`).join('\n\n')
    : '(sin mensajes previos)'
  return `${estructura}\n\n${referencia}\n\n---\n\n# Conversación hasta ahora\n${hist}\n\n---\n\n# Nuevo pedido del usuario\n${mensaje}\n\nExplicá el impacto y devolvé el JSON { respuesta, cambios }.`
}
