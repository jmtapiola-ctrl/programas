// Síntesis determinística de la pregunta de palanca (3.B) a partir de la prosa
// del modelo. El modelo, de forma recurrente, NARRA la pregunta nueva en la
// prosa ("PREGUNTA P-N — …") pero NO la agrega a plan.palancas.preguntas_principal
// del PANEL_UPDATE (ver CLAUDE.md "PANEL_UPDATE se silencia"). Sin esa entrada
// estructurada el panel del usuario queda clavado en la pregunta anterior. Los
// refuerzos de prompt NO lo resolvieron (verificado con Haiku y Sonnet), así que
// la detectamos y la sintetizamos server-side: parseamos el header + inferimos el
// modo de interacción por keywords. No depende de la adherencia del modelo.
//
// Es lógica pura (prosa + ids existentes → PalancaQAPE | null), testeable sin red
// (ver diagnostico/scripts/91-palanca-sintesis-unit.ts). Vive en su propio módulo
// para no arrastrar el route entero (Anthropic SDK, next/server) a los tests.

import type { PalancaQAPE, ModoInteraccion, CampoFichaMovimiento } from './types'

export function sintetizarPreguntaPalanca(prosa: string, idsExistentes: Set<string>): PalancaQAPE | null {
  const matches = [...prosa.matchAll(/PREGUNTA\s+P-?\s*(\d+)\s*[—–:\-]*\s*([^\n]*)/gi)]
  if (matches.length === 0) return null
  const m = matches[matches.length - 1] // la última = la pregunta de este turno
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n)) return null
  const id = `P-${n}`
  if (idsExistentes.has(id)) return null // el modelo SÍ la emitió o ya existía

  const titulo = (m[2] ?? '').trim()
  // Texto de la pregunta: primera oración con "?" después del header; fallback al título.
  const resto = prosa.slice(prosa.indexOf(m[0]) + m[0].length)
  const preg = resto.match(/([^?]{0,400}\?)/)?.[1]
  const pregunta = (preg ?? titulo).replace(/\s+/g, ' ').trim() || titulo || `Pregunta ${id}`

  // Inferencia de modo por keywords (más específico primero).
  const low = prosa.toLowerCase()
  let modo: ModoInteraccion | undefined
  let campos: CampoFichaMovimiento[] = []
  let instruccion = ''
  let min: number | undefined
  let max: number | undefined
  if (/editor de riesgos|riesgo de ejecuci|riesgo alto|salga mal/.test(low)) {
    modo = 'marcado_simple'
    campos = ['nombre', 'que_resuelve', 'criterio_exito', 'dueno', 'impacto', 'duracion_meses']
    instruccion = 'Marcá las fichas con riesgo alto + escribí la razón por mov en el editor. Puede ser ninguna.'
    min = 0
  } else if (/pares|precondici|dependencia/.test(low)) {
    modo = 'agrupacion_pares'
    campos = ['nombre', 'que_resuelve', 'cantidad_precondiciones', 'cantidad_desbloqueos']
    instruccion = 'Click en una ficha A, después en B para crear el par A→B. Podés marcar varios.'
    min = 1
  } else if (/fases|cronograma|secuenci|arrastr/.test(low)) {
    modo = 'secuenciacion'
    campos = ['nombre', 'ventana', 'banda_ancha']
    instruccion = 'Arrastrá cada movimiento a la fase donde corresponde.'
  } else if (/top\s*3|3 movimientos|orden de prioridad|priorizar|rankea/.test(low)) {
    modo = 'seleccion_multiple_ranked'
    campos = ['nombre', 'que_resuelve', 'banda_ancha', 'dueno']
    instruccion = 'Marcá los 3 movimientos que harías sí o sí, después arrastrá para ordenarlos.'
    min = 3; max = 3
  } else if (/palanca m[aá]s fuerte|ilumin|una sola ficha/.test(low)) {
    modo = 'seleccion_unica'
    campos = ['nombre', 'que_resuelve', 'cantidad_desbloqueos', 'banda_ancha']
    instruccion = 'Iluminá la ficha que considerás la palanca más fuerte.'
    min = 1; max = 1
  }
  // Sin modo inferible → pregunta de texto puro: la registramos igual (avanza el
  // tracking) pero el panel no renderiza, que es lo correcto para texto.
  return {
    id,
    origen: 'principal',
    pregunta,
    respuesta: '',
    ...(modo ? { modo_interaccion: modo, campos_a_mostrar: campos, instruccion_panel: instruccion } : {}),
    ...(min !== undefined ? { restriccion_minima: min } : {}),
    ...(max !== undefined ? { restriccion_maxima: max } : {}),
  }
}
