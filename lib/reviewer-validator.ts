// Parser strict del ReviewerReport — output del reviewer (gpt-5.5).
//
// El SDK de OpenAI ya valida JSON contra el `text.format: json_schema` strict
// antes de devolver. Esta capa adicional valida REGLAS DE APLICACIÓN que el
// schema JSON no expresa:
//
//   - Cantidad máxima de items (max 10 errors, max 5 críticas + 5 recomendadas).
//   - Coherencia entre meta y arrays (errores_alta + errores_media + errores_baja
//     === errors.length, etc.).
//   - cross_block_changes obligatoriamente vacío para el primer Bloque (paso 1).
//
// Sigue el mismo patrón que `parsePanelUpdate` (errors[] específicos por campo
// para que el caller pueda decidir reintentar con un mensaje preciso).

import type { ReviewerReport } from './types'

export type ValidateReviewerResult =
  | { ok: true; data: ReviewerReport }
  | { ok: false; errors: string[] }

const SEVERIDAD_VALIDAS = new Set(['Alta', 'Media', 'Baja'])
const CATEGORIA_VALIDAS = new Set(['CRITICA', 'RECOMENDADA'])
const TIPOS_VALIDOS = new Set([1, 2, 3, 4])
const CONFIANZA_VALIDAS = new Set(['Alta', 'Media', 'Baja'])

const LIMITS = {
  errors_max: 10,
  preguntas_criticas_max: 5,
  preguntas_recomendadas_max: 5,
}

/**
 * Valida que `data` cumpla el contrato del ReviewerReport. Si falla, devuelve
 * lista de errores específicos para retry o reporte al usuario.
 *
 * @param data - JSON ya parseado (típicamente viene de openai-client.callReviewer).
 * @param contextoBloque - Para validar reglas dependientes del bloque actual.
 *   - bloque 1: cross_block_changes debe estar vacío (no hay bloque previo).
 *   - bloque ≥ 2: cross_block_changes puede tener items.
 */
export function validateReviewerReport(
  data: unknown,
  contextoBloque: number,
): ValidateReviewerResult {
  const errors: string[] = []

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['report no es un objeto JSON'] }
  }
  const r = data as Record<string, unknown>

  // ── Estructura top-level ──
  if (!Array.isArray(r.errors)) errors.push('errors debe ser array')
  if (!Array.isArray(r.questions)) errors.push('questions debe ser array')
  if (!Array.isArray(r.cross_block_changes)) errors.push('cross_block_changes debe ser array')
  if (!r.meta || typeof r.meta !== 'object' || Array.isArray(r.meta)) {
    errors.push('meta debe ser objeto')
  }
  // Si la estructura top falla, no tiene sentido validar items.
  if (errors.length > 0) return { ok: false, errors }

  const errs = r.errors as unknown[]
  const qs = r.questions as unknown[]
  const cbcs = r.cross_block_changes as unknown[]
  const meta = r.meta as Record<string, unknown>

  // ── Cantidad / límites duros ──
  if (errs.length > LIMITS.errors_max) {
    errors.push(`errors tiene ${errs.length} items, máximo ${LIMITS.errors_max}`)
  }
  const criticasCount = qs.filter(q => (q as Record<string, unknown>)?.categoria === 'CRITICA').length
  const recomendadasCount = qs.filter(q => (q as Record<string, unknown>)?.categoria === 'RECOMENDADA').length
  if (criticasCount > LIMITS.preguntas_criticas_max) {
    errors.push(`questions tiene ${criticasCount} críticas, máximo ${LIMITS.preguntas_criticas_max}`)
  }
  if (recomendadasCount > LIMITS.preguntas_recomendadas_max) {
    errors.push(`questions tiene ${recomendadasCount} recomendadas, máximo ${LIMITS.preguntas_recomendadas_max}`)
  }

  // ── Validación item por item: errors ──
  errs.forEach((e, i) => {
    const it = e as Record<string, unknown>
    if (typeof it?.id !== 'string') errors.push(`errors[${i}].id debe ser string`)
    if (!TIPOS_VALIDOS.has(it?.tipo as number)) errors.push(`errors[${i}].tipo debe ser 1|2|3|4, got ${JSON.stringify(it?.tipo)}`)
    if (!SEVERIDAD_VALIDAS.has(it?.severidad as string)) errors.push(`errors[${i}].severidad debe ser Alta|Media|Baja, got ${JSON.stringify(it?.severidad)}`)
    if (typeof it?.que_dice_resumen !== 'string') errors.push(`errors[${i}].que_dice_resumen debe ser string`)
    if (typeof it?.que_se_dijo_en_conversacion !== 'string') errors.push(`errors[${i}].que_se_dijo_en_conversacion debe ser string`)
    if (typeof it?.turno_referencia !== 'number' || !Number.isInteger(it.turno_referencia)) errors.push(`errors[${i}].turno_referencia debe ser integer`)
    if (typeof it?.cambio_propuesto !== 'string') errors.push(`errors[${i}].cambio_propuesto debe ser string`)
  })

  // ── Validación item por item: questions ──
  qs.forEach((q, i) => {
    const it = q as Record<string, unknown>
    if (typeof it?.id !== 'string') errors.push(`questions[${i}].id debe ser string`)
    if (!CATEGORIA_VALIDAS.has(it?.categoria as string)) errors.push(`questions[${i}].categoria debe ser CRITICA|RECOMENDADA, got ${JSON.stringify(it?.categoria)}`)
    if (typeof it?.pregunta !== 'string') errors.push(`questions[${i}].pregunta debe ser string`)
    if (typeof it?.por_que_importa !== 'string') errors.push(`questions[${i}].por_que_importa debe ser string`)
    if (typeof it?.relacion_con_plan !== 'string') errors.push(`questions[${i}].relacion_con_plan debe ser string`)
    if (typeof it?.placeholder_ejemplo_respuesta !== 'string') errors.push(`questions[${i}].placeholder_ejemplo_respuesta debe ser string`)
  })

  // ── Validación item por item: cross_block_changes ──
  if (contextoBloque === 1 && cbcs.length > 0) {
    errors.push(`cross_block_changes debe estar vacío para el primer Bloque (recibido: ${cbcs.length} items)`)
  }
  cbcs.forEach((c, i) => {
    const it = c as Record<string, unknown>
    if (typeof it?.id !== 'string') errors.push(`cross_block_changes[${i}].id debe ser string`)
    if (typeof it?.bloque_afectado !== 'number' || !Number.isInteger(it.bloque_afectado)) errors.push(`cross_block_changes[${i}].bloque_afectado debe ser integer`)
    if (typeof it?.seccion_afectada !== 'string') errors.push(`cross_block_changes[${i}].seccion_afectada debe ser string`)
    if (!SEVERIDAD_VALIDAS.has(it?.severidad as string)) errors.push(`cross_block_changes[${i}].severidad debe ser Alta|Media|Baja`)
    if (typeof it?.que_dice_actualmente !== 'string') errors.push(`cross_block_changes[${i}].que_dice_actualmente debe ser string`)
    if (typeof it?.que_se_declaro_que_lo_modifica !== 'string') errors.push(`cross_block_changes[${i}].que_se_declaro_que_lo_modifica debe ser string`)
    if (typeof it?.turno_referencia !== 'number' || !Number.isInteger(it.turno_referencia)) errors.push(`cross_block_changes[${i}].turno_referencia debe ser integer`)
    if (typeof it?.cambio_propuesto !== 'string') errors.push(`cross_block_changes[${i}].cambio_propuesto debe ser string`)
  })

  // ── Validación de meta ──
  const requiredMeta = [
    'errores_alta', 'errores_media', 'errores_baja',
    'preguntas_criticas', 'preguntas_recomendadas', 'cross_block_changes_total',
    'confianza_general', 'justificacion_confianza',
  ]
  for (const k of requiredMeta) {
    if (!(k in meta)) errors.push(`meta.${k} faltante`)
  }
  for (const k of ['errores_alta', 'errores_media', 'errores_baja', 'preguntas_criticas', 'preguntas_recomendadas', 'cross_block_changes_total']) {
    if (k in meta && (typeof meta[k] !== 'number' || !Number.isInteger(meta[k]))) {
      errors.push(`meta.${k} debe ser integer`)
    }
  }
  if ('confianza_general' in meta && !CONFIANZA_VALIDAS.has(meta.confianza_general as string)) {
    errors.push(`meta.confianza_general debe ser Alta|Media|Baja`)
  }
  if ('justificacion_confianza' in meta && typeof meta.justificacion_confianza !== 'string') {
    errors.push(`meta.justificacion_confianza debe ser string`)
  }

  // ── Coherencia entre meta y arrays ──
  if (typeof meta.errores_alta === 'number' && typeof meta.errores_media === 'number' && typeof meta.errores_baja === 'number') {
    const sumErrs = (meta.errores_alta as number) + (meta.errores_media as number) + (meta.errores_baja as number)
    if (sumErrs !== errs.length) {
      errors.push(`meta: suma errores_alta+media+baja = ${sumErrs}, pero errors.length = ${errs.length}`)
    }
  }
  if (typeof meta.preguntas_criticas === 'number' && meta.preguntas_criticas !== criticasCount) {
    errors.push(`meta.preguntas_criticas = ${meta.preguntas_criticas}, contado = ${criticasCount}`)
  }
  if (typeof meta.preguntas_recomendadas === 'number' && meta.preguntas_recomendadas !== recomendadasCount) {
    errors.push(`meta.preguntas_recomendadas = ${meta.preguntas_recomendadas}, contado = ${recomendadasCount}`)
  }
  if (typeof meta.cross_block_changes_total === 'number' && meta.cross_block_changes_total !== cbcs.length) {
    errors.push(`meta.cross_block_changes_total = ${meta.cross_block_changes_total}, contado = ${cbcs.length}`)
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, data: r as unknown as ReviewerReport }
}

// JSON Schema correspondiente (pasado a la Responses API en text.format).
// Mantenerlo en sync con `validateReviewerReport` arriba.
export const REVIEWER_REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['errors', 'questions', 'cross_block_changes', 'meta'],
  properties: {
    errors: {
      type: 'array',
      maxItems: LIMITS.errors_max,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'tipo', 'severidad', 'que_dice_resumen', 'que_se_dijo_en_conversacion', 'turno_referencia', 'cambio_propuesto'],
        properties: {
          id: { type: 'string' },
          tipo: { type: 'integer', enum: [1, 2, 3, 4] },
          severidad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          que_dice_resumen: { type: 'string' },
          que_se_dijo_en_conversacion: { type: 'string' },
          turno_referencia: { type: 'integer' },
          cambio_propuesto: { type: 'string' },
        },
      },
    },
    questions: {
      type: 'array',
      maxItems: LIMITS.preguntas_criticas_max + LIMITS.preguntas_recomendadas_max,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'categoria', 'pregunta', 'por_que_importa', 'relacion_con_plan', 'placeholder_ejemplo_respuesta'],
        properties: {
          id: { type: 'string' },
          categoria: { type: 'string', enum: ['CRITICA', 'RECOMENDADA'] },
          pregunta: { type: 'string' },
          por_que_importa: { type: 'string' },
          relacion_con_plan: { type: 'string' },
          placeholder_ejemplo_respuesta: { type: 'string' },
        },
      },
    },
    cross_block_changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'bloque_afectado', 'seccion_afectada', 'severidad', 'que_dice_actualmente', 'que_se_declaro_que_lo_modifica', 'turno_referencia', 'cambio_propuesto'],
        properties: {
          id: { type: 'string' },
          bloque_afectado: { type: 'integer' },
          seccion_afectada: { type: 'string' },
          severidad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
          que_dice_actualmente: { type: 'string' },
          que_se_declaro_que_lo_modifica: { type: 'string' },
          turno_referencia: { type: 'integer' },
          cambio_propuesto: { type: 'string' },
        },
      },
    },
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['errores_alta', 'errores_media', 'errores_baja', 'preguntas_criticas', 'preguntas_recomendadas', 'cross_block_changes_total', 'confianza_general', 'justificacion_confianza'],
      properties: {
        errores_alta: { type: 'integer' },
        errores_media: { type: 'integer' },
        errores_baja: { type: 'integer' },
        preguntas_criticas: { type: 'integer' },
        preguntas_recomendadas: { type: 'integer' },
        cross_block_changes_total: { type: 'integer' },
        confianza_general: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        justificacion_confianza: { type: 'string' },
      },
    },
  },
} as const
