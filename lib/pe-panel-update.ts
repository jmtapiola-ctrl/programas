// Helpers para procesar el bloque PANEL_UPDATE que emite el modelo del wizard PE.
//
// Resuelve 3 modos de falla observados (ver diagnostico/REPORTE.md):
//   H1 — JSON malformado:        parsePanelUpdate detecta y devuelve errores específicos.
//   H2 — PANEL_UPDATE parcial:   merge* funciones nunca pisan no-vacío con vacío.
//   H3 — PANEL_UPDATE omitido:   parsePanelUpdate devuelve reason='no_block'.
//
// El endpoint chat/route.ts usa estos helpers + un retry mechanism para reintentar
// una vez ante cualquier falla.

import type {
  PanelUpdatePE,
  PropositorPE,
  SituacionPE,
  PlanoPE,
  PreparativosPE,
  InventarioPE,
  MovimientoPE,
  PalancasPE,
  PalancaQAPE,
  EstresPE,
  EstresQAPE,
} from './types'

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

// ── Validadores de items del Paso 3 (Fase B — sub-bloque 3.0 Preparativos) ──

function validateAreaAfectadaItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto {nombre, responsable, notas?}, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.nombre !== 'string') errs.push(`${prefix}[${idx}].nombre debe ser string`)
  if (typeof item.responsable !== 'string') errs.push(`${prefix}[${idx}].responsable debe ser string ('[vacancia]' si no asignado)`)
  if (item.notas !== undefined && typeof item.notas !== 'string') errs.push(`${prefix}[${idx}].notas (si presente) debe ser string`)
  return errs
}

function validateSupuestoExogenoItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.descripcion !== 'string') errs.push(`${prefix}[${idx}].descripcion debe ser string`)
  if (!['macro', 'mercado', 'regulatorio', 'social'].includes(item.tipo)) errs.push(`${prefix}[${idx}].tipo debe ser 'macro'|'mercado'|'regulatorio'|'social', got '${item.tipo}'`)
  if (!['alta', 'media', 'baja'].includes(item.probabilidad)) errs.push(`${prefix}[${idx}].probabilidad debe ser 'alta'|'media'|'baja', got '${item.probabilidad}'`)
  if (!['favorable', 'desfavorable'].includes(item.impacto_signo)) errs.push(`${prefix}[${idx}].impacto_signo debe ser 'favorable'|'desfavorable', got '${item.impacto_signo}'`)
  if (!['alta', 'media', 'baja'].includes(item.impacto_magnitud)) errs.push(`${prefix}[${idx}].impacto_magnitud debe ser 'alta'|'media'|'baja', got '${item.impacto_magnitud}'`)
  if (!['hedge', 'bet', 'aceptar'].includes(item.estrategia)) errs.push(`${prefix}[${idx}].estrategia debe ser 'hedge'|'bet'|'aceptar', got '${item.estrategia}'`)
  if (typeof item.razon !== 'string') errs.push(`${prefix}[${idx}].razon debe ser string`)
  return errs
}

function validateCriterioMetricaItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto {metrica, pleno, minimo}, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.metrica !== 'string') errs.push(`${prefix}[${idx}].metrica debe ser string (referencia al nombre de la métrica del propósito)`)
  if (typeof item.pleno !== 'string') errs.push(`${prefix}[${idx}].pleno debe ser string (target original)`)
  if (typeof item.minimo !== 'string') errs.push(`${prefix}[${idx}].minimo debe ser string (mínimo aceptable)`)
  return errs
}

// ── Validadores de items del Paso 3 (Fase C — sub-bloque 3.A Inventario) ──

function validateMovimientoItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto MovimientoPE, got ${Array.isArray(item) ? 'array' : typeof item}`]
  }
  if (typeof item.id !== 'string') errs.push(`${prefix}[${idx}].id debe ser string (ej "M-1")`)
  if (typeof item.categoria !== 'string') errs.push(`${prefix}[${idx}].categoria debe ser string`)
  if (typeof item.nombre !== 'string') errs.push(`${prefix}[${idx}].nombre debe ser string`)
  if (typeof item.que_resuelve !== 'string') errs.push(`${prefix}[${idx}].que_resuelve debe ser string`)
  if (typeof item.ataca_desvio !== 'string') errs.push(`${prefix}[${idx}].ataca_desvio debe ser string`)
  if (!['baja', 'media', 'alta'].includes(item.costo_banda_ancha)) errs.push(`${prefix}[${idx}].costo_banda_ancha debe ser 'baja'|'media'|'alta'`)
  if (typeof item.costo_monetario !== 'object' || item.costo_monetario === null) {
    errs.push(`${prefix}[${idx}].costo_monetario debe ser objeto {rango_min_usd, rango_max_usd, nota?}`)
  } else {
    if (typeof item.costo_monetario.rango_min_usd !== 'number') errs.push(`${prefix}[${idx}].costo_monetario.rango_min_usd debe ser number`)
    if (typeof item.costo_monetario.rango_max_usd !== 'number') errs.push(`${prefix}[${idx}].costo_monetario.rango_max_usd debe ser number`)
  }
  if (typeof item.ventana_temporal !== 'object' || item.ventana_temporal === null) {
    errs.push(`${prefix}[${idx}].ventana_temporal debe ser objeto {arranca, termina} con strings YYYY-MM`)
  } else {
    if (typeof item.ventana_temporal.arranca !== 'string') errs.push(`${prefix}[${idx}].ventana_temporal.arranca debe ser string YYYY-MM`)
    if (typeof item.ventana_temporal.termina !== 'string') errs.push(`${prefix}[${idx}].ventana_temporal.termina debe ser string YYYY-MM`)
  }
  if (!Array.isArray(item.precondiciones)) errs.push(`${prefix}[${idx}].precondiciones debe ser array de ids`)
  if (!Array.isArray(item.desbloquea)) errs.push(`${prefix}[${idx}].desbloquea debe ser array de ids`)
  if (!['dura', 'blanda', 'ninguna'].includes(item.tipo_dependencia)) errs.push(`${prefix}[${idx}].tipo_dependencia debe ser 'dura'|'blanda'|'ninguna'`)
  if (typeof item.dueno !== 'string') errs.push(`${prefix}[${idx}].dueno debe ser string`)
  if (typeof item.criterio_exito !== 'string') errs.push(`${prefix}[${idx}].criterio_exito debe ser string`)
  if (!['aceptado', 'editado', 'quitado', 'pendiente'].includes(item.estado_usuario)) errs.push(`${prefix}[${idx}].estado_usuario debe ser 'aceptado'|'editado'|'quitado'|'pendiente'`)
  return errs
}

function validateResumenCategoriaItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto {categoria, total, aceptados, editados, quitados}`]
  }
  if (typeof item.categoria !== 'string') errs.push(`${prefix}[${idx}].categoria debe ser string`)
  if (typeof item.total !== 'number') errs.push(`${prefix}[${idx}].total debe ser number`)
  if (typeof item.aceptados !== 'number') errs.push(`${prefix}[${idx}].aceptados debe ser number`)
  if (typeof item.editados !== 'number') errs.push(`${prefix}[${idx}].editados debe ser number`)
  if (typeof item.quitados !== 'number') errs.push(`${prefix}[${idx}].quitados debe ser number`)
  return errs
}

/**
 * Valida la estructura de plan.inventario (cierre formal de 3.A).
 * Devuelve array de errores. Vacío si OK.
 */
function validateInventario(inv: any, prefix: string): string[] {
  if (typeof inv !== 'object' || inv === null || Array.isArray(inv)) {
    return [`${prefix} debe ser objeto, got ${Array.isArray(inv) ? 'array' : typeof inv}`]
  }
  const errs: string[] = []
  if (!Array.isArray(inv.movimientos)) errs.push(`${prefix}.movimientos debe ser array`)
  else errs.push(...validateArrayItems(inv.movimientos, `${prefix}.movimientos`, validateMovimientoItem))
  if (!Array.isArray(inv.resumenes_categoria)) errs.push(`${prefix}.resumenes_categoria debe ser array`)
  else errs.push(...validateArrayItems(inv.resumenes_categoria, `${prefix}.resumenes_categoria`, validateResumenCategoriaItem))
  if (typeof inv.generado_en !== 'string') errs.push(`${prefix}.generado_en debe ser string ISO datetime`)
  return errs
}

// ── Validadores de items del Paso 3 (Fase D — sub-bloque 3.B Palancas) ──

const MODOS_INTERACCION = ['seleccion_unica', 'seleccion_multiple_ranked', 'agrupacion_pares', 'secuenciacion', 'marcado_simple'] as const
const CAMPOS_FICHA = ['nombre', 'que_resuelve', 'ataca_desvio', 'dueno', 'banda_ancha', 'costo', 'ventana', 'cantidad_precondiciones', 'cantidad_desbloqueos', 'criterio_exito', 'estado_usuario'] as const

function validateRespuestaEstructurada(re: any, prefix: string): string[] {
  const errs: string[] = []
  if (typeof re !== 'object' || re === null || Array.isArray(re)) {
    return [`${prefix} debe ser objeto`]
  }
  if (!MODOS_INTERACCION.includes(re.modo)) {
    errs.push(`${prefix}.modo debe ser uno de ${MODOS_INTERACCION.join(', ')}, got '${re.modo}'`)
    return errs  // sin modo válido no podemos validar el resto
  }
  switch (re.modo) {
    case 'seleccion_unica':
      if (typeof re.movimiento_id !== 'string') errs.push(`${prefix}.movimiento_id debe ser string`)
      break
    case 'seleccion_multiple_ranked':
      if (!Array.isArray(re.ranking)) errs.push(`${prefix}.ranking debe ser array`)
      else re.ranking.forEach((r: any, i: number) => {
        if (typeof r?.movimiento_id !== 'string') errs.push(`${prefix}.ranking[${i}].movimiento_id debe ser string`)
        if (typeof r?.posicion !== 'number') errs.push(`${prefix}.ranking[${i}].posicion debe ser number`)
      })
      break
    case 'agrupacion_pares':
      if (!Array.isArray(re.pares)) errs.push(`${prefix}.pares debe ser array`)
      else re.pares.forEach((p: any, i: number) => {
        if (typeof p?.desde !== 'string') errs.push(`${prefix}.pares[${i}].desde debe ser string`)
        if (typeof p?.hacia !== 'string') errs.push(`${prefix}.pares[${i}].hacia debe ser string`)
      })
      break
    case 'secuenciacion':
      if (!Array.isArray(re.fases)) errs.push(`${prefix}.fases debe ser array`)
      else re.fases.forEach((f: any, i: number) => {
        if (typeof f?.fase !== 'string') errs.push(`${prefix}.fases[${i}].fase debe ser string`)
        if (!Array.isArray(f?.movimientos)) errs.push(`${prefix}.fases[${i}].movimientos debe ser array de ids`)
      })
      break
    case 'marcado_simple':
      if (!Array.isArray(re.marcados)) errs.push(`${prefix}.marcados debe ser array de ids`)
      break
  }
  return errs
}

function validatePalancaQAItem(item: any, idx: number, prefix: string): string[] {
  const errs: string[] = []
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto PalancaQAPE`]
  }
  if (typeof item.id !== 'string') errs.push(`${prefix}[${idx}].id debe ser string (ej "P-1")`)
  if (!['principal', 'validador'].includes(item.origen)) errs.push(`${prefix}[${idx}].origen debe ser 'principal' | 'validador'`)
  if (typeof item.pregunta !== 'string') errs.push(`${prefix}[${idx}].pregunta debe ser string`)
  if (typeof item.respuesta !== 'string') errs.push(`${prefix}[${idx}].respuesta debe ser string (vacía "" si aún no respondida)`)
  if (item.observacion_modelo !== undefined && typeof item.observacion_modelo !== 'string') {
    errs.push(`${prefix}[${idx}].observacion_modelo (si presente) debe ser string`)
  }
  // Metadata del Panel Interactivo (Fase D Chunk A) — todos opcionales:
  if (item.modo_interaccion !== undefined && !MODOS_INTERACCION.includes(item.modo_interaccion)) {
    errs.push(`${prefix}[${idx}].modo_interaccion (si presente) debe ser uno de ${MODOS_INTERACCION.join(', ')}, got '${item.modo_interaccion}'`)
  }
  if (item.campos_a_mostrar !== undefined) {
    if (!Array.isArray(item.campos_a_mostrar)) errs.push(`${prefix}[${idx}].campos_a_mostrar debe ser array`)
    else item.campos_a_mostrar.forEach((c: any, i: number) => {
      if (!CAMPOS_FICHA.includes(c)) errs.push(`${prefix}[${idx}].campos_a_mostrar[${i}] debe ser uno de ${CAMPOS_FICHA.join(', ')}, got '${c}'`)
    })
  }
  if (item.instruccion_panel !== undefined && typeof item.instruccion_panel !== 'string') {
    errs.push(`${prefix}[${idx}].instruccion_panel (si presente) debe ser string`)
  }
  if (item.restriccion_minima !== undefined && typeof item.restriccion_minima !== 'number') {
    errs.push(`${prefix}[${idx}].restriccion_minima (si presente) debe ser number`)
  }
  if (item.restriccion_maxima !== undefined && typeof item.restriccion_maxima !== 'number') {
    errs.push(`${prefix}[${idx}].restriccion_maxima (si presente) debe ser number`)
  }
  if (item.respuesta_estructurada !== undefined) {
    errs.push(...validateRespuestaEstructurada(item.respuesta_estructurada, `${prefix}[${idx}].respuesta_estructurada`))
    // El modo de la respuesta debe matchear el modo de la pregunta (si ambos presentes)
    if (item.modo_interaccion && item.respuesta_estructurada?.modo && item.modo_interaccion !== item.respuesta_estructurada.modo) {
      errs.push(`${prefix}[${idx}].respuesta_estructurada.modo='${item.respuesta_estructurada.modo}' no matchea con modo_interaccion='${item.modo_interaccion}'`)
    }
  }
  return errs
}

// Validador de un item de plan.estres.preguntas[] (EstresQAPE).
// Mismo shape que PalancaQAPE excepto que id empieza con 'E-' + tiene
// campo opcional ajuste_aplicado.
function validateEstresQAItem(item: any, idx: number, prefix: string): string[] {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return [`${prefix}[${idx}] debe ser objeto`]
  }
  const errs: string[] = []
  if (typeof item.id !== 'string') errs.push(`${prefix}[${idx}].id debe ser string`)
  if (typeof item.pregunta !== 'string') errs.push(`${prefix}[${idx}].pregunta debe ser string`)
  if (typeof item.respuesta !== 'string') errs.push(`${prefix}[${idx}].respuesta debe ser string`)
  if (item.observacion_modelo !== undefined && typeof item.observacion_modelo !== 'string') {
    errs.push(`${prefix}[${idx}].observacion_modelo (si presente) debe ser string`)
  }
  if (item.modo_interaccion !== undefined) {
    const modos = ['seleccion_unica', 'seleccion_multiple_ranked', 'agrupacion_pares', 'secuenciacion', 'marcado_simple']
    if (typeof item.modo_interaccion !== 'string' || !modos.includes(item.modo_interaccion)) {
      errs.push(`${prefix}[${idx}].modo_interaccion (si presente) debe ser uno de: ${modos.join(', ')}`)
    }
  }
  if (item.respuesta_estructurada !== undefined && item.modo_interaccion !== undefined &&
      typeof item.respuesta_estructurada?.modo === 'string' && item.respuesta_estructurada.modo !== item.modo_interaccion) {
    errs.push(`${prefix}[${idx}].respuesta_estructurada.modo='${item.respuesta_estructurada.modo}' no matchea con modo_interaccion='${item.modo_interaccion}'`)
  }
  if (item.ajuste_aplicado !== undefined) {
    const aa = item.ajuste_aplicado
    if (typeof aa !== 'object' || aa === null) {
      errs.push(`${prefix}[${idx}].ajuste_aplicado (si presente) debe ser objeto`)
    } else {
      if (!['inventario', 'borrador'].includes(aa.tipo)) {
        errs.push(`${prefix}[${idx}].ajuste_aplicado.tipo debe ser 'inventario'|'borrador', got '${aa.tipo}'`)
      }
      if (typeof aa.descripcion !== 'string') {
        errs.push(`${prefix}[${idx}].ajuste_aplicado.descripcion debe ser string`)
      }
    }
  }
  return errs
}

function validateEstres(es: any, prefix: string): string[] {
  if (typeof es !== 'object' || es === null || Array.isArray(es)) {
    return [`${prefix} debe ser objeto`]
  }
  const errs: string[] = []
  // preguntas es opcional (mismo razonamiento que palancas — congelado en 3.E
  // si llega a aplicarse esa regla, o ausente en turnos donde no cambia).
  if (es.preguntas !== undefined && es.preguntas !== null) {
    if (!Array.isArray(es.preguntas)) {
      errs.push(`${prefix}.preguntas (si presente) debe ser array, got ${typeof es.preguntas}`)
    } else {
      errs.push(...validateArrayItems(es.preguntas, `${prefix}.preguntas`, validateEstresQAItem))
    }
  }
  return errs
}

function validatePalancas(pal: any, prefix: string): string[] {
  if (typeof pal !== 'object' || pal === null || Array.isArray(pal)) {
    return [`${prefix} debe ser objeto`]
  }
  const errs: string[] = []
  // preguntas_principal y preguntas_validador son OPCIONALES en el wire format.
  // El system prompt (línea ~263) le dice al modelo "NO emitas preguntas_validador"
  // durante 3.B — el campo se popula vía endpoint dedicado /paso3/palancas/respuestas
  // cuando el user confirma el modal. Si el parser exige array, el modelo queda
  // forzado a violar la regla del prompt → emite "" o omite → parser falla.
  // Mismo razonamiento aplica a preguntas_principal en sub-bloques posteriores a 3.B
  // (la regla "no re-emitir congelados" implica que palancas entero puede omitirse).
  if (pal.preguntas_principal !== undefined && pal.preguntas_principal !== null) {
    if (!Array.isArray(pal.preguntas_principal)) {
      errs.push(`${prefix}.preguntas_principal (si presente) debe ser array, got ${typeof pal.preguntas_principal}`)
    } else {
      errs.push(...validateArrayItems(pal.preguntas_principal, `${prefix}.preguntas_principal`, validatePalancaQAItem))
    }
  }
  if (pal.preguntas_validador !== undefined && pal.preguntas_validador !== null) {
    if (!Array.isArray(pal.preguntas_validador)) {
      errs.push(`${prefix}.preguntas_validador (si presente) debe ser array, got ${typeof pal.preguntas_validador}`)
    } else {
      errs.push(...validateArrayItems(pal.preguntas_validador, `${prefix}.preguntas_validador`, validatePalancaQAItem))
    }
  }
  return errs
}

/**
 * Valida la estructura de plan.preparativos (cierre formal de 3.0).
 * Devuelve array de errores. Vacío si OK.
 */
function validatePreparativos(prep: any, prefix: string): string[] {
  if (typeof prep !== 'object' || prep === null || Array.isArray(prep)) {
    return [`${prefix} debe ser objeto, got ${Array.isArray(prep) ? 'array' : typeof prep}`]
  }
  const errs: string[] = []

  if (!Array.isArray(prep.areas_afectadas)) {
    errs.push(`${prefix}.areas_afectadas debe ser array`)
  } else {
    errs.push(...validateArrayItems(prep.areas_afectadas, `${prefix}.areas_afectadas`, validateAreaAfectadaItem))
  }

  if (!Array.isArray(prep.supuestos_exogenos)) {
    errs.push(`${prefix}.supuestos_exogenos debe ser array`)
  } else {
    errs.push(...validateArrayItems(prep.supuestos_exogenos, `${prefix}.supuestos_exogenos`, validateSupuestoExogenoItem))
  }

  const pri = prep.priorizacion_inicial
  if (typeof pri !== 'object' || pri === null || Array.isArray(pri)) {
    errs.push(`${prefix}.priorizacion_inicial debe ser objeto {desvio_elegido, razon, desbloquea?}`)
  } else {
    if (typeof pri.desvio_elegido !== 'string') errs.push(`${prefix}.priorizacion_inicial.desvio_elegido debe ser string`)
    if (typeof pri.razon !== 'string') errs.push(`${prefix}.priorizacion_inicial.razon debe ser string`)
    if (pri.desbloquea !== undefined && typeof pri.desbloquea !== 'string') errs.push(`${prefix}.priorizacion_inicial.desbloquea (si presente) debe ser string`)
  }

  const ce = prep.criterio_exito
  if (typeof ce !== 'object' || ce === null || Array.isArray(ce)) {
    errs.push(`${prefix}.criterio_exito debe ser objeto {por_metrica[], zona_fracaso}`)
  } else {
    if (!Array.isArray(ce.por_metrica)) errs.push(`${prefix}.criterio_exito.por_metrica debe ser array`)
    else errs.push(...validateArrayItems(ce.por_metrica, `${prefix}.criterio_exito.por_metrica`, validateCriterioMetricaItem))
    if (typeof ce.zona_fracaso !== 'string') errs.push(`${prefix}.criterio_exito.zona_fracaso debe ser string`)
  }

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

  // Propósito (estructura + items).
  // OPCIONAL desde la regla "no re-emitir sub-trees congelados" (commit bb689f5):
  // durante 3.x, el modelo OMITE proposito/situacion. Aceptamos ausente (undefined)
  // o cadena vacía (caso modelo confundido entre "omitir" y "campo sin valor").
  // Si está presente como objeto, validamos la estructura interna.
  const p = parsed?.proposito
  const propositoOmitido = p === undefined || p === null || p === ''
  if (!propositoOmitido) {
    if (typeof p !== 'object' || Array.isArray(p)) {
      errors.push('proposito must be object (or omitted)')
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
  }

  // Situación (estructura + items). Misma regla de OPCIONAL que proposito.
  const s = parsed?.situacion
  const situacionOmitida = s === undefined || s === null || s === ''
  if (!situacionOmitida) {
    if (typeof s !== 'object' || Array.isArray(s)) {
      errors.push('situacion must be object (or omitted)')
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
  }

  // Datos faltantes (array de strings). También OPCIONAL — durante 3.x suelen
  // estar resueltos y el modelo puede omitirlos.
  if (parsed?.datos_faltantes !== undefined && parsed?.datos_faltantes !== null) {
    if (!Array.isArray(parsed.datos_faltantes)) {
      errors.push(`datos_faltantes (si presente) must be array, got ${typeof parsed.datos_faltantes}`)
    } else {
      parsed.datos_faltantes.forEach((d: any, i: number) => {
        if (typeof d !== 'string') errors.push(`datos_faltantes[${i}] must be string, got ${typeof d}`)
      })
    }
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

  // cambio_retroactivo (Fase F — H7 control suave).
  // Opcional. Si presente, validar shape mínimo: detectado debe ser boolean.
  // Si detectado=true, los otros campos son altamente recomendados pero la
  // ausencia parcial no bloquea (defensive: aplicar directo si falta info).
  if (parsed?.cambio_retroactivo !== undefined) {
    const cr = parsed.cambio_retroactivo
    if (typeof cr !== 'object' || cr === null || Array.isArray(cr)) {
      errors.push(`cambio_retroactivo (si presente) debe ser objeto, got ${Array.isArray(cr) ? 'array' : typeof cr}`)
    } else {
      if (typeof cr.detectado !== 'boolean') {
        errors.push(`cambio_retroactivo.detectado debe ser boolean, got ${typeof cr.detectado}`)
      }
      // Si detectado=true, validar tipos pero permitir ausencia (graceful degradation).
      if (cr.detectado === true) {
        if (cr.toca_material_validado !== undefined && typeof cr.toca_material_validado !== 'boolean') errors.push(`cambio_retroactivo.toca_material_validado (si presente) debe ser boolean`)
        if (cr.es_estructural !== undefined && typeof cr.es_estructural !== 'boolean') errors.push(`cambio_retroactivo.es_estructural (si presente) debe ser boolean`)
        if (cr.bloque_afectado !== undefined && typeof cr.bloque_afectado !== 'string') errors.push(`cambio_retroactivo.bloque_afectado (si presente) debe ser string`)
        if (cr.texto_previo !== undefined && typeof cr.texto_previo !== 'string') errors.push(`cambio_retroactivo.texto_previo (si presente) debe ser string`)
        if (cr.descripcion_cambio !== undefined && typeof cr.descripcion_cambio !== 'string') errors.push(`cambio_retroactivo.descripcion_cambio (si presente) debe ser string`)
        if (cr.impactos_detectados !== undefined && (!Array.isArray(cr.impactos_detectados) || cr.impactos_detectados.some((s: any) => typeof s !== 'string'))) {
          errors.push(`cambio_retroactivo.impactos_detectados (si presente) debe ser array de strings`)
        }
      }
    }
  }

  // proxima_respuesta_metadata (Issue B / Mínimo dinámico de respuestas).
  // Opcional. Si presente, debe ser objeto con campos opcionales:
  // caracteres_minimos (number), palabras_minimas (number), placeholder_textarea (string).
  if (parsed?.proxima_respuesta_metadata !== undefined) {
    const meta = parsed.proxima_respuesta_metadata
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      errors.push(`proxima_respuesta_metadata (si presente) debe ser objeto, got ${Array.isArray(meta) ? 'array' : typeof meta}`)
    } else {
      if (meta.caracteres_minimos !== undefined && typeof meta.caracteres_minimos !== 'number') {
        errors.push(`proxima_respuesta_metadata.caracteres_minimos (si presente) debe ser number`)
      }
      if (meta.palabras_minimas !== undefined && typeof meta.palabras_minimas !== 'number') {
        errors.push(`proxima_respuesta_metadata.palabras_minimas (si presente) debe ser number`)
      }
      if (meta.placeholder_textarea !== undefined && typeof meta.placeholder_textarea !== 'string') {
        errors.push(`proxima_respuesta_metadata.placeholder_textarea (si presente) debe ser string`)
      }
    }
  }

  // plan (Paso 3) — opcional. Solo presente cuando el modelo está construyendo el
  // Paso 3. Validamos shape de los sub-bloques que ya implementamos (Fase B = 3.0
  // Preparativos). Otros sub-bloques (inventario/palancas/borrador/estres/curado)
  // se permiten pasar sin validar shape interno hasta que su Fase los implemente.
  if (parsed?.plan !== undefined) {
    if (typeof parsed.plan !== 'object' || parsed.plan === null || Array.isArray(parsed.plan)) {
      errors.push(`plan (si presente) debe ser objeto, got ${Array.isArray(parsed.plan) ? 'array' : typeof parsed.plan}`)
    } else {
      if (parsed.plan.preparativos !== undefined) {
        errors.push(...validatePreparativos(parsed.plan.preparativos, 'plan.preparativos'))
      }
      if (parsed.plan.inventario !== undefined) {
        errors.push(...validateInventario(parsed.plan.inventario, 'plan.inventario'))
      }
      if (parsed.plan.palancas !== undefined) {
        errors.push(...validatePalancas(parsed.plan.palancas, 'plan.palancas'))
      }
      if (parsed.plan.estres !== undefined) {
        errors.push(...validateEstres(parsed.plan.estres, 'plan.estres'))
      }
      // borrador, curado: shape interno se valida en sus Fases respectivas
      // (D Chunk B y E). Por ahora aceptar como cualquier valor.
    }
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
  incoming: PropositorPE | undefined,
): MergeResult<PropositorPE> {
  const c = current ?? PROPOSITO_DEFAULT
  // Incoming omitido (regla "no re-emitir sub-trees congelados" en 3.x): preservar current intacto.
  if (incoming === undefined || incoming === null) {
    return { value: c, events: [{ type: 'preserved_empty', field: 'proposito (omitido por modelo)' }] }
  }
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
  incoming: SituacionPE | undefined,
): MergeResult<SituacionPE> {
  const c = current ?? SITUACION_DEFAULT
  // Incoming omitido (regla "no re-emitir sub-trees congelados" en 3.x): preservar current intacto.
  if (incoming === undefined || incoming === null) {
    return { value: c, events: [{ type: 'preserved_empty', field: 'situacion (omitido por modelo)' }] }
  }
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
  incoming: string[] | undefined,
): MergeResult<string[]> {
  const cur = current ?? []
  // Incoming omitido: preservar current.
  if (incoming === undefined || incoming === null) {
    return { value: cur, events: [{ type: 'preserved_empty', field: 'datos_faltantes (omitido por modelo)' }] }
  }
  const { value, event } = pickField('datos_faltantes', cur, incoming)
  return { value, events: event ? [event] : [] }
}

/** paso_actual nunca debe regresar — toma el max. */
export function mergePasoActual(current: number, incoming: number): number {
  return Math.max(current, incoming)
}

/**
 * sub_bloque_actual nunca debe regresar en el orden canónico del wizard.
 *
 * Caso real (mayo 2026): el PATCH /paso3/palancas/respuestas transicionó
 * entrevista de '3.B' a '3.C'. El siguiente turno del chat, el modelo emitió
 * PANEL_UPDATE con sub_bloque_actual='3.B' (no se enteró de la transición), y
 * saveWithRetry escribió ese valor sin filtrar → entrevista retrocedió a '3.B'.
 * El usuario quedó stuck con preguntas_validador llenas pero sub_bloque atrás.
 *
 * Esta función define el orden canónico y devuelve el current si incoming es
 * anterior. Si incoming es desconocido (ej. typo del modelo), también preservar
 * current — más seguro que aceptar un sub_bloque inválido.
 */
const SUB_BLOQUE_ORDER = [
  '0',
  '1.A', '1.B', '1.C', '1.D', '1.E',
  '2.A', '2.B', '2.C', '2.D', '2.E', '2.F', '2.G',
  '3.0', '3.A', '3.B', '3.C', '3.D', '3.E',
  'completado',  // terminal — wizard llegó al fin del scope implementado
]
export function mergeSubBloque(current: string, incoming: string): string {
  const curIdx = SUB_BLOQUE_ORDER.indexOf(current)
  const incIdx = SUB_BLOQUE_ORDER.indexOf(incoming)
  // Incoming desconocido: preservar current (defensiva contra typos del modelo).
  if (incIdx === -1) return current
  // Current desconocido o vacío: aceptar incoming (caso inicial).
  if (curIdx === -1) return incoming
  // Solo permitir avance o quedarse en el mismo sub_bloque.
  return incIdx >= curIdx ? incoming : current
}

/**
 * Merge protector para PlanoPE (Paso 3). Cada sub-bloque (preparativos,
 * inventario, palancas, borrador, estres, curado) se mergea por sub-key:
 * incoming pisa current sólo si incoming no está vacío. Sub-keys ausentes
 * en incoming se preservan del current (consistencia con patrón H7
 * retroactividad fluida — el modelo no necesita re-emitir todo el plan
 * en cada turno, solo lo que cambió).
 *
 * Para preparativos, validamos campo a campo (igual que mergeProposito).
 * Para los otros sub-bloques (inventario/palancas/borrador/estres/curado),
 * por ahora hacemos pick top-level — los validators de cada uno llegan
 * en sus Fases.
 */
export function mergePlan(
  current: PlanoPE | undefined,
  incoming: PlanoPE | undefined,
): MergeResult<PlanoPE | undefined> {
  if (!incoming) return { value: current, events: [] }
  const c = current ?? {}
  const events: MergeEvent[] = []
  const result: PlanoPE = {}

  // preparativos: merge campo a campo si está presente en incoming
  if (incoming.preparativos !== undefined) {
    const merged = mergePreparativos(c.preparativos, incoming.preparativos)
    if (merged.value !== undefined) result.preparativos = merged.value
    events.push(...merged.events)
  } else if (c.preparativos !== undefined) {
    result.preparativos = c.preparativos
  }

  // inventario: merge campo a campo (Fase C). Decisiones del usuario sobre
  // movimientos individuales (estado_usuario) son load-bearing — nunca pisar
  // un movimiento "aceptado/editado/quitado" con uno "pendiente".
  if (incoming.inventario !== undefined) {
    const merged = mergeInventario(c.inventario, incoming.inventario)
    if (merged.value !== undefined) result.inventario = merged.value
    events.push(...merged.events)
  } else if (c.inventario !== undefined) {
    result.inventario = c.inventario
  }

  // palancas: merge por id de PalancaQAPE (Fase D Chunk 1). Las respuestas
  // del usuario son load-bearing — preservar respuesta no-vacía si incoming
  // tiene la misma pregunta con respuesta vacía.
  if (incoming.palancas !== undefined) {
    const merged = mergePalancas(c.palancas, incoming.palancas)
    if (merged.value !== undefined) result.palancas = merged.value
    events.push(...merged.events)
  } else if (c.palancas !== undefined) {
    result.palancas = c.palancas
  }

  // estres: merge por id de EstresQAPE (Fase D Chunk C). Mismo patrón que palancas
  // — respuesta del user es load-bearing, respuesta_estructurada y panel-metadata
  // se persisten cliente-side y deben preservarse si incoming los omite.
  if (incoming.estres !== undefined) {
    const merged = mergeEstres(c.estres, incoming.estres)
    if (merged.value !== undefined) result.estres = merged.value
    events.push(...merged.events)
  } else if (c.estres !== undefined) {
    result.estres = c.estres
  }

  // Sub-bloques posteriores: pick top-level (sin merge interno hasta su Fase).
  for (const key of ['borrador', 'curado'] as const) {
    const inc = incoming[key]
    const cur = c[key]
    const { value, event } = pickField(`plan.${key}`, cur as any, inc as any)
    if (value !== undefined) (result as any)[key] = value
    if (event) events.push(event)
  }

  return { value: result, events }
}

/**
 * Merge protector para InventarioPE. Combina movimientos por id, preservando
 * decisiones del usuario sobre movimientos individuales. Un movimiento del
 * current con estado != 'pendiente' NUNCA se pisa con un movimiento del
 * incoming con el mismo id si el incoming es 'pendiente' (= estado del modelo
 * sin decisión del usuario).
 */
function mergeInventario(
  current: InventarioPE | undefined,
  incoming: InventarioPE,
): MergeResult<InventarioPE> {
  const events: MergeEvent[] = []
  if (!current) {
    return { value: incoming, events: [{ type: 'updated', field: 'plan.inventario', from: '(nuevo)', to: `array[${incoming.movimientos?.length ?? 0}]` }] }
  }

  // Indexar current por id para lookup rápido
  const curById = new Map<string, MovimientoPE>()
  for (const m of current.movimientos ?? []) curById.set(m.id, m)

  // Para cada movimiento del incoming, merge con current si existe
  const movMerged: MovimientoPE[] = []
  for (const inc of incoming.movimientos ?? []) {
    const cur = curById.get(inc.id)
    if (!cur) {
      // movimiento nuevo del incoming
      movMerged.push(inc)
      continue
    }
    // Si current tiene decisión del usuario, preservarla
    if (cur.estado_usuario !== 'pendiente' && inc.estado_usuario === 'pendiente') {
      movMerged.push(cur)  // preservar decisión usuario
      events.push({ type: 'preserved_empty', field: `plan.inventario.movimientos[${inc.id}].estado_usuario` })
    } else {
      // incoming gana (puede ser nueva decisión del usuario, o cambio del modelo)
      movMerged.push(inc)
    }
    curById.delete(inc.id)
  }
  // Movimientos que estaban en current pero no en incoming: preservar
  // (modelo puede haberse olvidado de re-emitir). Coherente con regla "estado
  // completo acumulado" del PANEL_UPDATE.
  for (const remaining of curById.values()) {
    movMerged.push(remaining)
    events.push({ type: 'preserved_empty', field: `plan.inventario.movimientos[${remaining.id}] (omitido por modelo)` })
  }

  // resumenes_categoria: tomar incoming si tiene, sino current
  const resumenes = (incoming.resumenes_categoria?.length ?? 0) > 0
    ? incoming.resumenes_categoria
    : (current.resumenes_categoria ?? [])

  return {
    value: {
      movimientos: movMerged,
      resumenes_categoria: resumenes,
      generado_en: incoming.generado_en || current.generado_en,
      costo_usd: incoming.costo_usd ?? current.costo_usd,
      latencia_ms: incoming.latencia_ms ?? current.latencia_ms,
    },
    events,
  }
}

/**
 * Merge protector para PalancasPE. Combina arrays preguntas_principal y
 * preguntas_validador por id. Si el incoming tiene una pregunta con respuesta
 * vacía pero el current ya tiene la misma pregunta con respuesta poblada,
 * preserva la respuesta del current (= no perder lo que el usuario respondió).
 */
function mergePalancas(
  current: PalancasPE | undefined,
  incoming: PalancasPE,
): MergeResult<PalancasPE> {
  const events: MergeEvent[] = []
  if (!current) return { value: incoming, events: [{ type: 'updated', field: 'plan.palancas', from: '(nuevo)', to: `principal[${incoming.preguntas_principal?.length ?? 0}] validador[${incoming.preguntas_validador?.length ?? 0}]` }] }

  function mergeArr(curArr: PalancaQAPE[], incArr: PalancaQAPE[], label: string): PalancaQAPE[] {
    const curById = new Map<string, PalancaQAPE>()
    for (const q of curArr) curById.set(q.id, q)
    const out: PalancaQAPE[] = []
    for (const inc of incArr) {
      const cur = curById.get(inc.id)
      // Caso especial: cur tiene respuesta y inc la dejó vacía → preservar cur completo.
      if (cur && cur.respuesta && !inc.respuesta) {
        out.push(cur)
        events.push({ type: 'preserved_empty', field: `plan.palancas.${label}[${inc.id}].respuesta` })
        curById.delete(inc.id)
        continue
      }
      // Caso general: usar inc como base, pero preservar campos persistidos por el
      // CLIENTE que el modelo no reemite. respuesta_estructurada se persiste vía
      // PATCH /paso3/palancas/respuesta-estructurada (Mejora 1 / Fase D Chunk A) —
      // el modelo NO la conoce ni debe regenerarla. Si el modelo emite incoming
      // sin respuesta_estructurada pero current la tenía, preservar.
      const merged: PalancaQAPE = { ...inc }
      if (cur?.respuesta_estructurada !== undefined && inc.respuesta_estructurada === undefined) {
        merged.respuesta_estructurada = cur.respuesta_estructurada
        events.push({ type: 'preserved_empty', field: `plan.palancas.${label}[${inc.id}].respuesta_estructurada (cliente-only)` })
      }
      // Preservar metadata del Panel Interactivo (Fase D Chunk A): modo_interaccion
      // y compañía se emiten UNA VEZ cuando la pregunta se crea. En turnos
      // subsiguientes el modelo a veces re-emite la pregunta (misma id) con texto
      // actualizado pero SIN re-emitir el metadata. Sin esta preservación, el
      // merge dropea modo_interaccion → el panel deja de renderizarse y el user
      // ve la pregunta de seguimiento sin las fichas, incluso si ya había marcado.
      if (cur?.modo_interaccion !== undefined && inc.modo_interaccion === undefined) {
        merged.modo_interaccion = cur.modo_interaccion
        events.push({ type: 'preserved_empty', field: `plan.palancas.${label}[${inc.id}].modo_interaccion (panel-metadata)` })
      }
      if (cur?.campos_a_mostrar !== undefined && inc.campos_a_mostrar === undefined) {
        merged.campos_a_mostrar = cur.campos_a_mostrar
      }
      if (cur?.instruccion_panel !== undefined && inc.instruccion_panel === undefined) {
        merged.instruccion_panel = cur.instruccion_panel
      }
      if (cur?.restriccion_minima !== undefined && inc.restriccion_minima === undefined) {
        merged.restriccion_minima = cur.restriccion_minima
      }
      if (cur?.restriccion_maxima !== undefined && inc.restriccion_maxima === undefined) {
        merged.restriccion_maxima = cur.restriccion_maxima
      }
      out.push(merged)
      curById.delete(inc.id)
    }
    // Items que estaban en current pero no en incoming: preservar
    for (const remaining of curById.values()) {
      out.push(remaining)
      events.push({ type: 'preserved_empty', field: `plan.palancas.${label}[${remaining.id}] (omitido por modelo)` })
    }
    return out
  }

  return {
    value: {
      preguntas_principal: mergeArr(current.preguntas_principal ?? [], incoming.preguntas_principal ?? [], 'preguntas_principal'),
      preguntas_validador: mergeArr(current.preguntas_validador ?? [], incoming.preguntas_validador ?? [], 'preguntas_validador'),
      costo_validador_usd: incoming.costo_validador_usd ?? current.costo_validador_usd,
      latencia_validador_ms: incoming.latencia_validador_ms ?? current.latencia_validador_ms,
    },
    events,
  }
}

/**
 * Merge protector para EstresPE. Combina preguntas[] por id, preservando:
 *   - respuesta del usuario (texto) si incoming la dejó vacía
 *   - respuesta_estructurada (persistida cliente-side vía endpoint dedicado)
 *   - panel-metadata (modo_interaccion, campos_a_mostrar, instruccion_panel,
 *     restriccion_minima/maxima) que el modelo emite UNA VEZ al crear la pregunta
 *   - ajuste_aplicado (lo registra el modelo en su PANEL_UPDATE, pero si en un
 *     turno posterior el modelo NO lo reemite por simplificación, preservar)
 *
 * Mismo razonamiento que mergePalancas — load-bearing user-side fields no se
 * pisan con vacío.
 */
function mergeEstres(
  current: EstresPE | undefined,
  incoming: EstresPE,
): MergeResult<EstresPE> {
  const events: MergeEvent[] = []
  if (!current) return { value: incoming, events: [{ type: 'updated', field: 'plan.estres', from: '(nuevo)', to: `preguntas[${incoming.preguntas?.length ?? 0}]` }] }

  const curArr = current.preguntas ?? []
  const incArr = incoming.preguntas ?? []
  const curById = new Map<string, EstresQAPE>()
  for (const q of curArr) curById.set(q.id, q)
  const out: EstresQAPE[] = []
  for (const inc of incArr) {
    const cur = curById.get(inc.id)
    // Caso especial: cur tiene respuesta y inc la dejó vacía → preservar cur completo.
    if (cur && cur.respuesta && !inc.respuesta) {
      out.push(cur)
      events.push({ type: 'preserved_empty', field: `plan.estres.preguntas[${inc.id}].respuesta` })
      curById.delete(inc.id)
      continue
    }
    const merged: EstresQAPE = { ...inc }
    if (cur?.respuesta_estructurada !== undefined && inc.respuesta_estructurada === undefined) {
      merged.respuesta_estructurada = cur.respuesta_estructurada
      events.push({ type: 'preserved_empty', field: `plan.estres.preguntas[${inc.id}].respuesta_estructurada (cliente-only)` })
    }
    if (cur?.ajuste_aplicado !== undefined && inc.ajuste_aplicado === undefined) {
      merged.ajuste_aplicado = cur.ajuste_aplicado
      events.push({ type: 'preserved_empty', field: `plan.estres.preguntas[${inc.id}].ajuste_aplicado` })
    }
    // Panel metadata — mismo razonamiento que mergePalancas.
    if (cur?.modo_interaccion !== undefined && inc.modo_interaccion === undefined) {
      merged.modo_interaccion = cur.modo_interaccion
      events.push({ type: 'preserved_empty', field: `plan.estres.preguntas[${inc.id}].modo_interaccion (panel-metadata)` })
    }
    if (cur?.campos_a_mostrar !== undefined && inc.campos_a_mostrar === undefined) merged.campos_a_mostrar = cur.campos_a_mostrar
    if (cur?.instruccion_panel !== undefined && inc.instruccion_panel === undefined) merged.instruccion_panel = cur.instruccion_panel
    if (cur?.restriccion_minima !== undefined && inc.restriccion_minima === undefined) merged.restriccion_minima = cur.restriccion_minima
    if (cur?.restriccion_maxima !== undefined && inc.restriccion_maxima === undefined) merged.restriccion_maxima = cur.restriccion_maxima
    out.push(merged)
    curById.delete(inc.id)
  }
  // Preguntas que estaban en current pero no en incoming: preservar
  for (const remaining of curById.values()) {
    out.push(remaining)
    events.push({ type: 'preserved_empty', field: `plan.estres.preguntas[${remaining.id}] (omitido por modelo)` })
  }

  return {
    value: { preguntas: out },
    events,
  }
}

function mergePreparativos(
  current: PreparativosPE | undefined,
  incoming: PreparativosPE,
): MergeResult<PreparativosPE> {
  const c: PreparativosPE = current ?? {
    areas_afectadas: [],
    supuestos_exogenos: [],
    priorizacion_inicial: { desvio_elegido: '', razon: '' },
    criterio_exito: { por_metrica: [], zona_fracaso: '' },
  }
  const events: MergeEvent[] = []

  const areas = pickField('plan.preparativos.areas_afectadas', c.areas_afectadas, incoming.areas_afectadas)
  if (areas.event) events.push(areas.event)

  const supuestos = pickField('plan.preparativos.supuestos_exogenos', c.supuestos_exogenos, incoming.supuestos_exogenos)
  if (supuestos.event) events.push(supuestos.event)

  // priorizacion_inicial: si incoming tiene desvio_elegido no vacío, gana
  const priIncomingFull = !isEmpty(incoming.priorizacion_inicial?.desvio_elegido)
  const priorizacion = priIncomingFull ? incoming.priorizacion_inicial : c.priorizacion_inicial
  if (priIncomingFull && JSON.stringify(c.priorizacion_inicial) !== JSON.stringify(incoming.priorizacion_inicial)) {
    events.push({
      type: 'updated',
      field: 'plan.preparativos.priorizacion_inicial',
      from: previewValue(c.priorizacion_inicial),
      to: previewValue(incoming.priorizacion_inicial),
    })
  }

  // criterio_exito: por_metrica (array) + zona_fracaso (string)
  const porMetrica = pickField('plan.preparativos.criterio_exito.por_metrica', c.criterio_exito.por_metrica, incoming.criterio_exito.por_metrica)
  const zonaFracaso = pickField('plan.preparativos.criterio_exito.zona_fracaso', c.criterio_exito.zona_fracaso, incoming.criterio_exito.zona_fracaso)
  if (porMetrica.event) events.push(porMetrica.event)
  if (zonaFracaso.event) events.push(zonaFracaso.event)

  return {
    value: {
      areas_afectadas: areas.value,
      supuestos_exogenos: supuestos.value,
      priorizacion_inicial: priorizacion,
      criterio_exito: {
        por_metrica: porMetrica.value,
        zona_fracaso: zonaFracaso.value,
      },
    },
    events,
  }
}
