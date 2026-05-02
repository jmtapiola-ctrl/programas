// Helpers para procesar el bloque PANEL_UPDATE que emite el modelo del wizard PE.
//
// Resuelve 3 modos de falla observados (ver diagnostico/REPORTE.md):
//   H1 — JSON malformado:        parsePanelUpdate detecta y devuelve errores específicos.
//   H2 — PANEL_UPDATE parcial:   merge* funciones nunca pisan no-vacío con vacío.
//   H3 — PANEL_UPDATE omitido:   parsePanelUpdate devuelve reason='no_block'.
//
// El endpoint chat/route.ts usa estos helpers + un retry mechanism para reintentar
// una vez ante cualquier falla.

import type { PanelUpdatePE, PropositorPE, SituacionPE } from './types'

const PANEL_UPDATE_RE = /<!--PANEL_UPDATE-->([\s\S]*?)<!--\/PANEL_UPDATE-->/

export type ParseResult =
  | { ok: true; data: PanelUpdatePE }
  | { ok: false; reason: 'no_block' | 'malformed_json' | 'invalid_shape'; errors: string[]; raw?: string }

// ─── Validadores modulares por tipo de item ──────────────────────────────────
// Reutilizables para futuros campos array en Pasos 3-5 del wizard.
// Cada validador devuelve un array de errores específicos (vacío si OK).

type ItemValidator = (item: any, idx: number, prefix: string) => string[]

function validateMetricaItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto {metrica, valor_objetivo, valor_actual}, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.metrica !== 'string') errs.push(`${prefix}[${idx}].metrica debe ser string`)
  if (typeof item.valor_objetivo !== 'string') errs.push(`${prefix}[${idx}].valor_objetivo debe ser string`)
  if (typeof item.valor_actual !== 'string') errs.push(`${prefix}[${idx}].valor_actual debe ser string (vacío "" si no hay baseline)`)
  return errs
}

function validateFueraItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto {item, razon}, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.item !== 'string') errs.push(`${prefix}[${idx}].item debe ser string`)
  if (typeof item.razon !== 'string') errs.push(`${prefix}[${idx}].razon debe ser string (vacío "" si no se nombró razón)`)
  return errs
}

function validateDesvioSecundarioItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto {descripcion, datos}, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.descripcion !== 'string') errs.push(`${prefix}[${idx}].descripcion debe ser string`)
  if (typeof item.datos !== 'string') errs.push(`${prefix}[${idx}].datos debe ser string`)
  return errs
}

function validateResistenciaItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto {actor, descripcion, mitigacion, tipo, criticidad}, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.actor !== 'string') errs.push(`${prefix}[${idx}].actor debe ser string (frase corta del nombre)`)
  if (typeof item.descripcion !== 'string') errs.push(`${prefix}[${idx}].descripcion debe ser string (POR QUÉ es resistencia)`)
  if (typeof item.mitigacion !== 'string') errs.push(`${prefix}[${idx}].mitigacion debe ser string (CÓMO se maneja, vacío "" si no se definió)`)
  if (typeof item.tipo !== 'string') errs.push(`${prefix}[${idx}].tipo debe ser string`)
  if (typeof item.criticidad !== 'string') errs.push(`${prefix}[${idx}].criticidad debe ser string ("Alta"/"Media"/"Baja")`)
  return errs
}

/** Valida un array entero usando un validator de item. */
function validateArrayItems(arr: any, prefix: string, validator: ItemValidator): string[] {
  if (!Array.isArray(arr)) return []  // shape de array ya se valida arriba
  const errs: string[] = []
  arr.forEach((item, i) => errs.push(...validator(item, i, prefix)))
  return errs
}

/**
 * Parsea el bloque PANEL_UPDATE de la respuesta cruda del modelo.
 * Validación strict: si falta cualquier campo del contrato, el tipo no matchea,
 * o los items de los arrays no tienen el shape esperado, devuelve invalid_shape
 * con array de errores específicos por campo.
 *
 * Eso le permite al retry mechanism mandarle al modelo qué arreglar exactamente.
 */
export function parsePanelUpdate(fullResponse: string): ParseResult {
  const match = fullResponse.match(PANEL_UPDATE_RE)
  if (!match) {
    return {
      ok: false,
      reason: 'no_block',
      errors: ['No se encontró bloque PANEL_UPDATE en la respuesta'],
    }
  }

  const raw = match[1].trim()
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      ok: false,
      reason: 'malformed_json',
      errors: [e instanceof Error ? e.message : String(e)],
      raw,
    }
  }

  const errors: string[] = []

  // Top-level
  if (typeof parsed?.paso_actual !== 'number') {
    errors.push(`paso_actual must be number, got ${typeof parsed?.paso_actual}`)
  }
  if (typeof parsed?.sub_bloque_actual !== 'string') {
    errors.push(`sub_bloque_actual must be string, got ${typeof parsed?.sub_bloque_actual}`)
  }

  // Propósito (estructura + items)
  const p = parsed?.proposito
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    errors.push('proposito must be object')
  } else {
    if (typeof p.escena !== 'string') errors.push(`proposito.escena must be string, got ${typeof p.escena}`)
    if (!Array.isArray(p.metricas)) errors.push(`proposito.metricas must be array, got ${typeof p.metricas}`)
    else errors.push(...validateArrayItems(p.metricas, 'proposito.metricas', validateMetricaItem))
    if (!Array.isArray(p.fuera)) errors.push(`proposito.fuera must be array, got ${typeof p.fuera}`)
    else errors.push(...validateArrayItems(p.fuera, 'proposito.fuera', validateFueraItem))
    if (typeof p.horizonte !== 'string') errors.push(`proposito.horizonte must be string, got ${typeof p.horizonte}`)
    if (typeof p.estabilidad !== 'string') errors.push(`proposito.estabilidad must be string, got ${typeof p.estabilidad}`)
    if (p.alineacion_sr !== undefined && typeof p.alineacion_sr !== 'string') {
      errors.push(`proposito.alineacion_sr (si presente) must be string, got ${typeof p.alineacion_sr}`)
    }
  }

  // Situación (estructura + items)
  const s = parsed?.situacion
  if (!s || typeof s !== 'object' || Array.isArray(s)) {
    errors.push('situacion must be object')
  } else {
    const stringFields = [
      'desvio_principal', 'desvio_cuantificado', 'causa_raiz',
      'consecuencia_6m', 'consecuencia_12m',
      'recursos_actuales', 'recursos_faltantes', 'intentos_previos',
    ]
    for (const f of stringFields) {
      if (typeof s[f] !== 'string') errors.push(`situacion.${f} must be string, got ${typeof s[f]}`)
    }
    if (!Array.isArray(s.desvios_secundarios)) errors.push(`situacion.desvios_secundarios must be array, got ${typeof s.desvios_secundarios}`)
    else errors.push(...validateArrayItems(s.desvios_secundarios, 'situacion.desvios_secundarios', validateDesvioSecundarioItem))
    if (!Array.isArray(s.resistencias)) errors.push(`situacion.resistencias must be array, got ${typeof s.resistencias}`)
    else errors.push(...validateArrayItems(s.resistencias, 'situacion.resistencias', validateResistenciaItem))
  }

  // Datos faltantes (array de strings)
  if (!Array.isArray(parsed?.datos_faltantes)) {
    errors.push(`datos_faltantes must be array, got ${typeof parsed?.datos_faltantes}`)
  } else {
    parsed.datos_faltantes.forEach((d: any, i: number) => {
      if (typeof d !== 'string') errors.push(`datos_faltantes[${i}] must be string, got ${typeof d}`)
    })
  }

  // cierre_sugerido (opcional, default false implícito).
  // Ausencia: permitido — necesario para rehidratar PANEL_UPDATEs viejos sin el campo.
  // Presencia: tiene que ser boolean estricto (no string truthy/falsy, no null).
  // TODO: este campo se consume en feat/audit-reviewer (Fase 1+2) — el chat route
  // detecta cierre_sugerido=true para transicionar sub_estado_paso a 'cierre_sugerido'
  // y el frontend muestra botón "Cerrar Paso N y revisar". Hasta que ese feature
  // exista, el campo se emite y persiste sin uso visible para el usuario.
  if (parsed?.cierre_sugerido !== undefined && typeof parsed?.cierre_sugerido !== 'boolean') {
    errors.push(`cierre_sugerido (si presente) must be boolean true/false, got ${parsed?.cierre_sugerido === null ? 'null' : typeof parsed?.cierre_sugerido}`)
  }

  if (errors.length > 0) {
    return { ok: false, reason: 'invalid_shape', errors, raw }
  }

  return { ok: true, data: parsed as PanelUpdatePE }
}

// ─── Merge helpers — nunca pisar no-vacío con vacío ──────────────────────────
// Tampoco se pisa un array con uno MÁS CHICO (shrinkage). El modelo a veces
// emite arrays parciales aunque el contrato pida el estado completo acumulado;
// shrinkage se trata como sospechoso → se preserva el current y se loggea.

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

const PROPOSITO_DEFAULT: PropositorPE = {
  escena: '',
  metricas: [],
  fuera: [],
  horizonte: '',
  estabilidad: '',
}

const SITUACION_DEFAULT: SituacionPE = {
  desvio_principal: '',
  desvio_cuantificado: '',
  desvios_secundarios: [],
  causa_raiz: '',
  consecuencia_6m: '',
  consecuencia_12m: '',
  recursos_actuales: '',
  recursos_faltantes: '',
  intentos_previos: '',
  resistencias: [],
}

/**
 * Resultado de un merge: el valor final + la lista de "events" para logging.
 * Cada event indica qué pasó en cada campo (preservado, actualizado, shrinkage).
 */
export type MergeEvent =
  | { type: 'updated'; field: string; from: string; to: string }
  | { type: 'preserved_empty'; field: string }    // incoming vacío, current preservado
  | { type: 'preserved_shrinkage'; field: string; current_size: number; incoming_size: number }

export interface MergeResult<T> {
  value: T
  events: MergeEvent[]
}

/**
 * Decide qué valor usar para un campo: el incoming, o preservar el current.
 * Devuelve también el evento que describe lo que pasó.
 *
 * Reglas:
 *   - Si incoming está vacío y current no → preservar current (preserved_empty).
 *   - Si ambos son arrays e incoming.length < current.length → preservar (preserved_shrinkage).
 *   - Si incoming es no-vacío y no es shrinkage → usar incoming (updated).
 *   - Si ambos son vacíos → tomar incoming (no events porque no hay nada que reportar).
 */
function pickField<T>(field: string, current: T, incoming: T): { value: T; event?: MergeEvent } {
  const incEmpty = isEmpty(incoming)
  const curEmpty = isEmpty(current)

  if (incEmpty && !curEmpty) {
    return { value: current, event: { type: 'preserved_empty', field } }
  }

  if (Array.isArray(incoming) && Array.isArray(current) && incoming.length < current.length) {
    return {
      value: current,
      event: { type: 'preserved_shrinkage', field, current_size: current.length, incoming_size: incoming.length },
    }
  }

  // incoming gana — pero solo emitir 'updated' si efectivamente cambió algo significativo
  if (!incEmpty && JSON.stringify(current) !== JSON.stringify(incoming)) {
    return {
      value: incoming,
      event: {
        type: 'updated',
        field,
        from: previewValue(current),
        to: previewValue(incoming),
      },
    }
  }
  return { value: incoming }
}

function previewValue(v: unknown): string {
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 60)}..."` : `"${v}"`
  if (Array.isArray(v)) return `array[${v.length}]`
  return JSON.stringify(v).slice(0, 80)
}

/**
 * Merge protector para PropositorPE: cada campo del incoming pisa el current solo
 * si el incoming NO está vacío Y NO es un array más chico (shrinkage).
 */
export function mergeProposito(
  current: PropositorPE | undefined,
  incoming: PropositorPE,
): MergeResult<PropositorPE> {
  const c = current ?? PROPOSITO_DEFAULT
  const events: MergeEvent[] = []
  const fields: (keyof PropositorPE)[] = ['escena', 'metricas', 'fuera', 'horizonte', 'estabilidad']
  const result: any = {}
  for (const f of fields) {
    const { value, event } = pickField(`proposito.${String(f)}`, c[f], incoming[f])
    result[f] = value
    if (event) events.push(event)
  }
  // alineacion_sr (Plan Jr): si incoming lo trae y no es vacío, va; sino current si lo tenía
  const inc = incoming.alineacion_sr
  const cur = c.alineacion_sr
  if (!isEmpty(inc)) result.alineacion_sr = inc
  else if (!isEmpty(cur)) result.alineacion_sr = cur
  return { value: result as PropositorPE, events }
}

export function mergeSituacion(
  current: SituacionPE | undefined,
  incoming: SituacionPE,
): MergeResult<SituacionPE> {
  const c = current ?? SITUACION_DEFAULT
  const events: MergeEvent[] = []
  const fields: (keyof SituacionPE)[] = [
    'desvio_principal', 'desvio_cuantificado', 'desvios_secundarios',
    'causa_raiz', 'consecuencia_6m', 'consecuencia_12m',
    'recursos_actuales', 'recursos_faltantes', 'intentos_previos',
    'resistencias',
  ]
  const result: any = {}
  for (const f of fields) {
    const { value, event } = pickField(`situacion.${String(f)}`, c[f], incoming[f])
    result[f] = value
    if (event) events.push(event)
  }
  return { value: result as SituacionPE, events }
}

export function mergeDatosFaltantes(
  current: string[] | undefined,
  incoming: string[],
): MergeResult<string[]> {
  const cur = current ?? []
  const { value, event } = pickField('datos_faltantes', cur, incoming)
  return { value, events: event ? [event] : [] }
}

/** paso_actual nunca debe regresar — toma el max. */
export function mergePasoActual(current: number, incoming: number): number {
  return Math.max(current, incoming)
}
