// Prompt para Opus en el endpoint /apply — integración semántica de las
// respuestas del usuario a las preguntas del reviewer.
//
// Solo se llama cuando hay ≥1 question respondida. Si solo hay errors aprobados,
// el endpoint /apply NO llama a Opus (sustitución determinística pura).

import type { PlanEstrategico, ReviewerQuestion, DecisionUsuario } from './types'

export interface QuestionResponse {
  question: ReviewerQuestion
  decision: DecisionUsuario
}

export function buildApplySystemPrompt(): string {
  return `Sos el modelo principal del wizard de planificación estratégica. Acabás de recibir respuestas del usuario a preguntas que el revisor estratégico independiente identificó como faltantes en el resumen.

Tu tarea: integrar esas respuestas al resumen estructurado del Bloque, modificando ÚNICAMENTE los campos relevantes.

═══════════════════════════════════════════════════════════════════
QUÉ HACER
═══════════════════════════════════════════════════════════════════

1. Para cada respuesta del usuario, identificá a qué campo del resumen pertenece según el contenido y la pregunta original. Las respuestas pueden:
   - Agregar info nueva al lugar de llegada / escena ideal del Propósito.
   - Sumar una métrica nueva o completar una existente (especialmente con baseline / valor_actual).
   - Sumar un item al fuera de scope.
   - Aclarar el horizonte o la estabilidad.
   - Agregar info al desvío principal, secundarios, causa raíz, etc. (Paso 2).
   - Sumar a recursos actuales / faltantes / intentos previos / resistencias (Paso 2).
   - Sumar a datos faltantes (cuando la respuesta es "no lo sabemos todavía, lo registramos").

2. NO inventes contenido. Solo integrá lo que el usuario respondió. Si la respuesta es vaga o no aporta, dejala registrada en datos_faltantes con una nota corta.

3. NO modifiques campos que no fueron afectados por las respuestas. Mantené el resto del resumen intacto.

4. Si una respuesta agrega una métrica nueva, sumá un item al array \`proposito.metricas\` con el shape correcto: \`{metrica, valor_objetivo, valor_actual}\`. Lo mismo para fuera, desvíos secundarios, resistencias.

5. Si la respuesta del usuario explícitamente dice "no lo sé", "no tengo ese dato", o equivalente, agregalo a \`datos_faltantes\` (array de strings) con un texto corto descriptivo, NO lo inventes.

═══════════════════════════════════════════════════════════════════
SHAPE DE ITEMS POR ARRAY (CRÍTICO — emitir strings sueltos rompe el panel)
═══════════════════════════════════════════════════════════════════

- metricas[i] = {"metrica":"<nombre/dimensión corta>", "valor_objetivo":"<descripción de la meta>", "valor_actual":"<baseline o \\"\\"\>"}
- fuera[i] = {"item":"<qué queda afuera>", "razon":"<justificación o \\"\\"\>"}
- desvios_secundarios[i] = {"descripcion":"<título corto>", "datos":"<datos cuantitativos o cualitativos>"}
- resistencias[i] = {"actor":"<QUIÉN/QUÉ resiste>", "descripcion":"<POR QUÉ>", "mitigacion":"<CÓMO se maneja o \\"\\"\>", "tipo":"<'Interna' | 'Externa' | 'Riesgo crítico precondicional'>", "criticidad":"<'Alta' | 'Media' | 'Baja'>"}
- datos_faltantes[i] = "<string>" (acá sí van strings sueltos)

═══════════════════════════════════════════════════════════════════
FORMATO DE OUTPUT (JSON ESTRICTO)
═══════════════════════════════════════════════════════════════════

Devolvés EXCLUSIVAMENTE el JSON con la estructura:

{
  "proposito": {
    "escena": "<string>",
    "metricas": [<array de objetos shape arriba>],
    "fuera": [<array de objetos shape arriba>],
    "horizonte": "<string>",
    "estabilidad": "<string>"
  },
  "situacion": {
    "desvio_principal": "<string>",
    "desvio_cuantificado": "<string>",
    "desvios_secundarios": [<array>],
    "causa_raiz": "<string>",
    "consecuencia_6m": "<string>",
    "consecuencia_12m": "<string>",
    "recursos_actuales": "<string>",
    "recursos_faltantes": "<string>",
    "intentos_previos": "<string>",
    "resistencias": [<array>]
  },
  "datos_faltantes": [<array de strings>]
}

Sin markdown, sin comentarios, sin texto fuera del JSON.`
}

export function buildApplyUserMessage(params: {
  bloque: number
  planActual: PlanEstrategico                     // ya con errors aplicados
  questionsRespondidas: QuestionResponse[]
}): string {
  const resumenJson = JSON.stringify({
    proposito: params.planActual.proposito ?? null,
    situacion: params.planActual.situacion ?? null,
    datos_faltantes: params.planActual.datos_faltantes ?? [],
  }, null, 2)

  const respuestasMd = params.questionsRespondidas.map((qr, i) => `
─── Respuesta ${i + 1} ───
PREGUNTA (categoría: ${qr.question.categoria}):
${qr.question.pregunta}

POR QUÉ IMPORTA: ${qr.question.por_que_importa}
RELACIÓN CON EL PLAN: ${qr.question.relacion_con_plan}

RESPUESTA DEL USUARIO:
${qr.decision.respuesta_usuario}
`).join('\n')

  return `Bloque a actualizar: Bloque ${params.bloque}.

═════════════════════════════════════════════════════════════
RESUMEN ESTRUCTURADO ACTUAL DEL BLOQUE
═════════════════════════════════════════════════════════════

${resumenJson}

═════════════════════════════════════════════════════════════
RESPUESTAS DEL USUARIO A INTEGRAR (${params.questionsRespondidas.length})
═════════════════════════════════════════════════════════════

${respuestasMd}

═════════════════════════════════════════════════════════════

Integrá las respuestas al resumen y devolvé el JSON actualizado completo según el formato del system prompt.`
}

// ─── Schema JSON del output del apply (para text.format json_schema strict) ─

export const APPLY_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposito', 'situacion', 'datos_faltantes'],
  properties: {
    proposito: {
      type: 'object',
      additionalProperties: false,
      required: ['escena', 'metricas', 'fuera', 'horizonte', 'estabilidad'],
      properties: {
        escena: { type: 'string' },
        metricas: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['metrica', 'valor_objetivo', 'valor_actual'],
            properties: {
              metrica: { type: 'string' },
              valor_objetivo: { type: 'string' },
              valor_actual: { type: 'string' },
            },
          },
        },
        fuera: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['item', 'razon'],
            properties: {
              item: { type: 'string' },
              razon: { type: 'string' },
            },
          },
        },
        horizonte: { type: 'string' },
        estabilidad: { type: 'string' },
      },
    },
    situacion: {
      type: 'object',
      additionalProperties: false,
      required: [
        'desvio_principal', 'desvio_cuantificado', 'desvios_secundarios',
        'causa_raiz', 'consecuencia_6m', 'consecuencia_12m',
        'recursos_actuales', 'recursos_faltantes', 'intentos_previos', 'resistencias',
      ],
      properties: {
        desvio_principal: { type: 'string' },
        desvio_cuantificado: { type: 'string' },
        desvios_secundarios: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['descripcion', 'datos'],
            properties: {
              descripcion: { type: 'string' },
              datos: { type: 'string' },
            },
          },
        },
        causa_raiz: { type: 'string' },
        consecuencia_6m: { type: 'string' },
        consecuencia_12m: { type: 'string' },
        recursos_actuales: { type: 'string' },
        recursos_faltantes: { type: 'string' },
        intentos_previos: { type: 'string' },
        resistencias: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['actor', 'descripcion', 'mitigacion', 'tipo', 'criticidad'],
            properties: {
              actor: { type: 'string' },
              descripcion: { type: 'string' },
              mitigacion: { type: 'string' },
              tipo: { type: 'string' },
              criticidad: { type: 'string' },
            },
          },
        },
      },
    },
    datos_faltantes: { type: 'array', items: { type: 'string' } },
  },
} as const
