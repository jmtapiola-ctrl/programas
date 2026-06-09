// Prompts del chat de edición de planes cerrados (modelo "vista lado a lado").
//
// El usuario habla en lenguaje natural. El modelo NO aplica nada: explica el
// IMPACTO del cambio (qué campos del plan ripplean) y PROPONE los cambios. El
// usuario los confirma desde la UI; recién ahí se aplican al borrador.
//
// Dos familias de cambios:
//   - "cambios" (texto): proposito / situacion / criterio — cita verbatim, se
//     localiza y sustituye determinísticamente (lib/reconcile-apply.ts).
//   - "cambios_inventario" (F3): movimientos del inventario (campos escalares/
//     texto + dependencias). Cambiar duraciones o dependencias RECOMPUTA el
//     cronograma (Gantt) automáticamente.

import type { PlanEstrategico, PlanDraftMensaje } from './types'
import { buildReconcileEstructuraMd } from './reconcile-prompt'

// Pseudo-plan a partir del borrador para serializar campos editables.
export function draftComoPlan(draft: {
  proposito?: any; situacion?: any; preparativos?: any; inventario?: any
}): PlanEstrategico {
  return {
    id: '', nombre: '', area: '', tipo: 'Sr', estado: 'Completado', version: 1, responsable_id: '',
    proposito: draft.proposito, situacion: draft.situacion,
    plan: { preparativos: draft.preparativos, inventario: draft.inventario } as any,
    datos_faltantes: [],
  } as PlanEstrategico
}

// Dump editable del inventario: movs con sus campos + dependencias.
function buildInventarioEditableMd(plan: PlanEstrategico): string {
  const movs = plan.plan?.inventario?.movimientos?.filter(m => m.estado_usuario !== 'quitado') ?? []
  if (!movs.length) return ''
  const out: string[] = ['\n## inventario (movimientos editables)']
  for (const m of movs) {
    const deps = (m.precondiciones ?? []).map(p => {
      const tipo = m.precondiciones_tipo?.[p] ?? 'sugerida'
      const lag = m.precondiciones_lag_meses?.[p]
      return `${p}(${tipo}${lag ? ` +${lag}m` : ''})`
    }).join(', ') || '—'
    out.push(`- ${m.id} "${m.nombre}" · banda=${m.costo_banda_ancha} · dur=${m.duracion_meses_ejecucion ?? '—'}m · dueño=${m.dueno || '—'}`)
    if (m.brechas_atacadas?.length) out.push(`    brechas_atacadas: ${m.brechas_atacadas.join(' | ')}`)
    out.push(`    precondiciones: ${deps}`)
  }
  return out.join('\n')
}

export function buildDraftChatSystemPrompt(): string {
  return `Sos un editor experto de planes estratégicos cerrados. El usuario te pide cambios en lenguaje natural. Tu trabajo es DOBLE:

1. EXPLICAR EL IMPACTO en prosa breve (español rioplatense): qué partes del plan toca y cómo ripplea. Si cambia una duración o una dependencia, avisá cómo se mueve el cronograma (fecha de cierre, fases).

CRUCE OBLIGATORIO DEL RIPPLE: si un cambio de TEXTO (una métrica, un criterio, la situación) tiene impacto en el INVENTARIO —las brechas atacadas de movimientos que referencian esa métrica, duraciones, dependencias, o el cronograma— proponé TAMBIÉN esos cambios de inventario en el MISMO turno (en cambios_inventario), no solo el de texto. Y al revés: si un cambio de inventario implica ajustar un texto, proponé también el texto. No dejes ripples sin proponer; si dudás si algo ripplea, proponelo y explicá por qué (el usuario confirma lo que quiera).

2. PROPONER LOS CAMBIOS (NO los apliques — el usuario confirma). Dos listas:

A) "cambios" — texto de propósito/situación/criterio:
   - "que_dice_estructura": cita VERBATIM del valor actual, copiada EXACTA del bloque "Plan estructurado" (sin el prefijo [campo]).
   - "cambio_propuesto": nuevo valor completo.
   - "surface": "proposito.escena" | "proposito.metricas" | "proposito.fuera" | "proposito.horizonte" | "proposito.estabilidad" | "situacion" | "criterio_exito".
   - "severidad": Alta/Media/Baja.

B) "cambios_inventario" — movimientos del inventario:
   - Campo: { "mov_id": "M-3", "campo": "<uno de: nombre | descripcion | brechas_atacadas | costo_banda_ancha | duracion_meses_ejecucion | dueno | criterio_exito | impacto>", "valor_nuevo": <string | array de strings para brechas_atacadas | número para duracion_meses_ejecucion>, "motivo": "...", "severidad": "Media" }
     · costo_banda_ancha solo acepta "baja" | "media" | "alta".
     · duracion_meses_ejecucion es un número entero de meses.
     · brechas_atacadas es un array de strings (nombres de brechas/métricas).
   - Dependencia: { "mov_id": "M-7", "dep": { "accion": "agregar"|"quitar"|"editar", "desde": "M-2", "tipo": "fs"|"ff"|"continuo"|"sugerida", "lag_meses": 0 }, "motivo": "...", "severidad": "Media" }
     · mov_id es el movimiento DEPENDIENTE; "desde" es la precondición. ("M-7 depende de M-2".)

Si el usuario solo pregunta/conversa, respondé en prosa y devolvé listas vacías.

SALIDA: SOLO un objeto JSON válido:
{ "respuesta": "<prosa del impacto>", "cambios": [ ... ], "cambios_inventario": [ ... ] }`
}

export function buildDraftChatUserMessage(
  planVivo: PlanEstrategico,
  draftPlan: PlanEstrategico,
  historial: PlanDraftMensaje[],
  mensaje: string,
): string {
  const estructura = buildReconcileEstructuraMd(draftPlan)
  const inventario = buildInventarioEditableMd(draftPlan)
  const hist = historial.length
    ? historial.map(m => `${m.rol === 'user' ? 'USUARIO' : 'EDITOR'}: ${m.texto}`).join('\n\n')
    : '(sin mensajes previos)'
  return `${estructura}\n${inventario}\n\n---\n\n# Conversación hasta ahora\n${hist}\n\n---\n\n# Nuevo pedido del usuario\n${mensaje}\n\nExplicá el impacto y devolvé el JSON { respuesta, cambios, cambios_inventario }.`
}
