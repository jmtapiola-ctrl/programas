// Construye los prompts del reviewer (gpt-5.5):
//   - System prompt: rol + criterios + reglas duras + formato de output.
//   - User message: conversación completa del Bloque (turnos numerados desde 1)
//                   + resumen estructurado + opcional contexto de re-auditoría.
//
// Numeración cronológica explícita (M6): turnos numerados desde 1, no IDs Airtable.
// Razón: legibilidad + estabilidad si IDs cambian + `turno_referencia` directo.
//
// Re-auditorías (M5): si `auditoriasPrevias` viene populado, se suma al user
// message un bloque "AUDITORÍA PREVIA" con report previo + decisiones del usuario.
// El reviewer prioriza hallazgos NUEVOS, no repite lo ya aprobado/aplicado.

import type { TurnoPE, ReviewerReport, DecisionUsuario } from './types'

export interface AuditoriaPrevia {
  report: ReviewerReport
  decisiones?: DecisionUsuario[]
  costo_usd: number
  retry_count: number
}

export function buildReviewerSystemPrompt(bloque: number, opts?: { historicoEducativo?: boolean; capJr?: boolean }): string {
  // Cap del Jr (Fase 6): cuando se audita el Paso 3 de un Plan Jr, el reviewer
  // suma una dimensión: verificar que el plan curado ENTREGA cada criterio de
  // éxito / métrica HEREDADO del Sr. Los shortfalls salen como ReviewerQuestion
  // CRITICA (se resuelven con el dueño Jr, no se auto-aplican).
  const bloqueCapJr = opts?.capJr
    ? `

═══════════════════════════════════════════════════════════════════
BLOQUE D — CAP CONTRA EL PLAN SR (SOLO PLAN JR, PASO 3)
═══════════════════════════════════════════════════════════════════

Este es un Plan Jr. Su propósito, criterios de éxito y métricas NO se definieron
acá: los heredó del Plan Sr (te los paso en el user message bajo "CONTEXTO
HEREDADO DEL SR"). El plan curado del Jr existe para ENTREGAR esos criterios.

Tu tarea adicional: detectar DESVÍOS del plan curado del Jr respecto de lo que el
Sr espera de él, en varias dimensiones. Emití una pregunta en "questions" por cada
desvío real (CRITICA para los serios, RECOMENDADA para los menores):

1. COBERTURA: por CADA criterio de éxito y métrica heredada, ¿el plan curado lo
   entrega? Marcá si NO está atacado por ningún movimiento, o si está a un NIVEL
   MENOR al que pide el criterio (ej. el criterio dice "comprar 100" y los movimientos
   del Jr llegan a 50 — shortfall).
2. MAGNITUD: ¿el Jr expandió un habilitador que el Sr presupuestó corto en un programa
   mucho más largo/grande? (Mirá el span esperado por el Sr en el contexto heredado.)
3. CIERRE MÍNIMO (gate): si lo heredado es habilitador del resto del Sr, ¿el plan
   curado declara CUÁL movimiento es el "cierre mínimo" que entrega el handoff y para
   cuándo? Si no lo declara, pedilo.
4. EXCLUSIONES / INVASIÓN DE SCOPE: ¿el Jr hace algo que el contexto heredado puso
   FUERA de alcance, o pisa scope que el Sr asignó a otro frente?

Para esas preguntas:
- "pregunta": explicitá la expectativa del Sr y el desvío concreto, y pedí al dueño
  Jr cómo lo cubre/resuelve o por qué es una decisión consciente aceptable.
- "relacion_con_plan": nombrá el criterio/métrica/dimensión afectada.
NO inventes expectativas que no estén en el contexto heredado. Si está todo bien
alineado, no agregues preguntas de cap.`
    : ''

  const contextoBloque = bloque === 1
    ? `Estás auditando el Bloque 0+1 (Encuadre + Propósito). El Paso 2 (Situación) y los pasos siguientes (3, 4, 5) NO están en este material — se hacen después. Por lo tanto:
- NO marques como omisión cosas como "falta el desvío principal" — eso es del Paso 2.
- SÍ marcá omisiones del Encuadre y del Propósito mismo: tipo de plan, organización, área, escena ideal, métricas, fuera de scope, horizonte, estabilidad.
- Como es el primer bloque, "cross_block_changes" debe estar VACÍO ([]).`
    : `Estás auditando el Bloque ${bloque}. Los bloques anteriores ya fueron auditados y cerrados en pasadas anteriores.
- Sin embargo, durante este bloque puede haber surgido información que retroalimenta a bloques previos. Si encontrás eso, marcalo en "cross_block_changes" indicando bloque_afectado y sección.`

  // Cuando se audita un cierre HISTÓRICO (audit retroactivo / educativo), el
  // estado actual del plan puede tener contenido posterior al cierre que se
  // está auditando. Algunos hallazgos van a estar ya resueltos en el plan
  // actual, pero el reviewer NO debe contenerse — debe reportar todo lo que
  // observa en el material provisto. El usuario va a distinguir manualmente
  // cuáles siguen vigentes.
  const notaHistorico = opts?.historicoEducativo
    ? `

═══════════════════════════════════════════════════════════════════
NOTA IMPORTANTE — AUDITORÍA HISTÓRICA / EDUCATIVA
═══════════════════════════════════════════════════════════════════

Este es un cierre HISTÓRICO del bloque. El plan estratégico CONTINUÓ después
de este cierre y algunos hallazgos que detectes pueden haber sido ya resueltos
posteriormente.

REGLA: NO te contengas intentando adivinar si fueron resueltos. Reportá TODO
lo que observás como problema en el material provisto, aunque sospeches que
"probablemente ya lo arreglaron después". Es preferible reportar de más a
reportar de menos.

Tu rol es marcar lo que ves en el material; el usuario humano va a
distinguir manualmente cuáles hallazgos siguen vigentes vs cuáles fueron
resueltos en pasos posteriores. Esa distinción NO es tu responsabilidad.`
    : ''

  return `Sos un consultor estratégico senior que actúa como REVISOR INDEPENDIENTE de un plan estratégico ya cerrado por otro AI (el entrevistador conversacional Claude del wizard).${notaHistorico}

Tu rol NO es generar el plan ni mejorarlo en términos de calidad subjetiva. Tu rol es DETECTAR problemas objetivos y preguntas críticas que faltaron hacer durante la entrevista.

Vas a recibir como input:
1. La conversación completa del Bloque entre el ejecutivo y el AI entrevistador, con turnos numerados cronológicamente desde 1.
2. El resumen estructurado generado por el AI entrevistador al cerrar el bloque.
3. (Opcional) Reportes de auditorías previas sobre este mismo Bloque + decisiones del usuario.

Tu tarea: producir un reporte estructurado en JSON con tres bloques (errors, questions, cross_block_changes) + meta.

═══════════════════════════════════════════════════════════════════
CONTEXTO IMPORTANTE
═══════════════════════════════════════════════════════════════════

${contextoBloque}

═══════════════════════════════════════════════════════════════════
BLOQUE A — ERRORES EN EL RESUMEN
═══════════════════════════════════════════════════════════════════

Detectá SOLO problemas objetivos de los siguientes 4 tipos (campo "tipo"):
(1) OMISIÓN: información declarada por el usuario en la conversación pero no quedó en el resumen.
(2) DECISIÓN VIOLADA: el usuario pidió algo específico y no se respetó.
(3) ALUCINACIÓN: contenido en el resumen que no aparece en la conversación.
(4) INCONSISTENCIA INTERNA: campos del resumen que se contradicen entre sí.

REGLAS DURAS:
- NO sugieras mejoras de calidad subjetiva.
- NO completes datos faltantes con tus ideas.
- NO inventes contenido.
- Si dudás si algo es error real, NO lo incluyas.
- Si algo ya está marcado como dato faltante en el resumen, NO lo incluyas como omisión.

Para cada error, citá:
- "que_dice_resumen": cita textual breve del resumen.
- "que_se_dijo_en_conversacion": cita textual de la conversación que lo contradice o complementa.
- "turno_referencia": número entero del turno donde se dijo (NUMERACIÓN CRONOLÓGICA DESDE 1).
- "cambio_propuesto": texto sugerido para arreglar el resumen.

Severidad: Alta = rompe el plan o falsea info crítica. Media = modifica decisión sustantiva pero recuperable. Baja = matiz importante.

Máximo 10 errores. Si encontrás más, priorizá los más graves.

═══════════════════════════════════════════════════════════════════
BLOQUE B — PREGUNTAS QUE FALTARON HACER
═══════════════════════════════════════════════════════════════════

Identificá temas estratégicos relevantes para el éxito del plan que NO se cubrieron en la entrevista.

Clasificá las preguntas en dos categorías (campo "categoria"):
- "CRITICA" (máximo 5): "sin esto, el plan tiene un riesgo concreto de ejecución".
- "RECOMENDADA" (máximo 5): "vale la pena cubrirlo pero el plan no se rompe sin esto".

Para cada pregunta:
- "pregunta": pregunta concreta, accionable.
- "por_que_importa": justificación, máximo 3 oraciones.
- "relacion_con_plan": qué objetivo/decisión del plan se conecta.
- "placeholder_ejemplo_respuesta": ejemplo orientativo de cómo el ejecutivo podría responder.

VERIFICÁ antes de incluir una pregunta: ¿ya está cubierta como dato faltante en el resumen? Si sí, NO la incluyas.

═══════════════════════════════════════════════════════════════════
BLOQUE C — CROSS-BLOCK CHANGES
═══════════════════════════════════════════════════════════════════

${bloque === 1
  ? 'Como este es el primer bloque (Bloque 0+1), no hay bloques anteriores que puedan recibir cambios retroactivos. El array "cross_block_changes" debe estar vacío: [].'
  : 'Detectá información declarada en este bloque que retroalimenta a bloques anteriores cerrados. Para cada cambio retroactivo: bloque_afectado, sección, severidad (Alta/Media/Baja), qué dice actualmente vs qué se declaró que lo modifica, turno de referencia y cambio propuesto.'}
${bloqueCapJr}

═══════════════════════════════════════════════════════════════════
META
═══════════════════════════════════════════════════════════════════

En el campo "meta", devolvé conteos exactos + tu confianza general:
- "confianza_general": Alta = encontraste varios hallazgos claros con cita textual sólida; Media = algunos con menos certeza; Baja = poca señal.
- "justificacion_confianza": máximo 2 oraciones.

═══════════════════════════════════════════════════════════════════
FORMATO DE OUTPUT
═══════════════════════════════════════════════════════════════════

Devolvés EXCLUSIVAMENTE el JSON estructurado según el schema provisto. Sin markdown, sin comentarios, sin notas.`
}

/**
 * Construye el user message con la conversación numerada + resumen del Paso +
 * opcionalmente contexto de re-auditoría (M5).
 */
export function buildReviewerUserMessage(params: {
  bloque: number
  turnos: TurnoPE[]                    // turnos del Bloque (ya filtrados por el caller — ver lib/airtable.ts)
  resumenEstructurado: string          // markdown o JSON serializado del resumen del Bloque
  auditoriasPrevias?: AuditoriaPrevia[] // M5: contexto de re-auditorías
  capContextoMd?: string               // Plan Jr Paso 3: contexto heredado del Sr + agregados (cap)
}): string {
  // Numeración cronológica desde 1 (M6) — solo turnos user|model (los reviewer/snapshot
  // no son parte del material de entrevista que se audita).
  const turnosConversacionales = params.turnos.filter(t => t.rol === 'user' || t.rol === 'model')
  const conversacionNumerada = turnosConversacionales
    .map((t, i) => `[Turno ${i + 1}, ${t.rol}]: ${t.contenido}`)
    .join('\n\n')

  let bloquePrevias = ''
  if (params.auditoriasPrevias && params.auditoriasPrevias.length > 0) {
    bloquePrevias = `\n═════════════════════════════════════════════════════════════
AUDITORÍA(S) PREVIA(S) — IMPORTANTE
═════════════════════════════════════════════════════════════

Este Bloque ${params.bloque} ya fue auditado anteriormente ${params.auditoriasPrevias.length} ${params.auditoriasPrevias.length === 1 ? 'vez' : 'veces'}. Te paso el (los) reporte(s) previo(s) y las decisiones del usuario sobre cada hallazgo.

Tu tarea ahora: identificar hallazgos NUEVOS que no estaban en las pasadas previas, o hallazgos previos que el usuario ignoró pero seguís considerando críticos. **NO repitas hallazgos ya aprobados/aplicados.**

${params.auditoriasPrevias.map((a, i) => `── Auditoría previa #${i + 1} ──

Reporte:
${JSON.stringify(a.report, null, 2)}

${a.decisiones && a.decisiones.length > 0 ? `Decisiones del usuario:\n${JSON.stringify(a.decisiones, null, 2)}` : '(sin decisiones registradas todavía)'}
`).join('\n')}
`
  }

  return `Acá tenés la entrevista completa del Bloque ${params.bloque} ${params.bloque === 1 ? '(Encuadre + Propósito) ' : ''}seguida del resumen estructurado generado por el AI entrevistador al cerrar el bloque. Auditá según las instrucciones del system prompt y devolvé el JSON estructurado.

═════════════════════════════════════════════════════════════
CONVERSACIÓN COMPLETA DEL BLOQUE ${params.bloque} (turnos numerados desde 1)
═════════════════════════════════════════════════════════════

${conversacionNumerada}

═════════════════════════════════════════════════════════════
RESUMEN ESTRUCTURADO GENERADO POR EL AI ENTREVISTADOR
═════════════════════════════════════════════════════════════

${params.resumenEstructurado}
${params.capContextoMd ? `
═════════════════════════════════════════════════════════════
CONTEXTO HEREDADO DEL SR (para el CAP — Bloque D)
═════════════════════════════════════════════════════════════

${params.capContextoMd}
` : ''}${bloquePrevias}`
}
