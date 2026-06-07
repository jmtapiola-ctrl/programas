// Unit test sin red de la síntesis determinística de preguntas de palanca (3.B).
// Verifica detección del header "PREGUNTA P-N" + inferencia de modo por keywords.
// Correr: npx tsx diagnostico/scripts/91-palanca-sintesis-unit.ts

import { sintetizarPreguntaPalanca } from '../../lib/palanca-sintesis'

let pass = 0, fail = 0
function check(nombre: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${nombre}`) }
  else { fail++; console.error(`  ✗ ${nombre}${extra ? ` — ${extra}` : ''}`) }
}
const NONE = new Set<string>()

// 1. Riesgo → marcado_simple
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-4 — RIESGO DE EJECUCIÓN\n\n¿Cuáles son los movimientos donde más temés que la ejecución salga mal? Usá el editor de riesgos.', NONE)
  console.log('1 — riesgo:')
  check('id P-4', q?.id === 'P-4', q?.id)
  check('modo marcado_simple', q?.modo_interaccion === 'marcado_simple', q?.modo_interaccion)
  check('pregunta capturada', !!q?.pregunta && q.pregunta.includes('temés'))
}
// 2. Pares → agrupacion_pares
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-3 — DEPENDENCIAS CRÍTICAS\n\n¿Hay pares donde A es precondición real de B? Marcá los pares.', NONE)
  console.log('2 — pares:')
  check('id P-3', q?.id === 'P-3')
  check('modo agrupacion_pares', q?.modo_interaccion === 'agrupacion_pares', q?.modo_interaccion)
}
// 3. Palanca más fuerte → seleccion_unica
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-1 — PALANCA\n\n¿Cuál creés que es la palanca más fuerte? Iluminá la ficha.', NONE)
  console.log('3 — palanca más fuerte:')
  check('modo seleccion_unica', q?.modo_interaccion === 'seleccion_unica', q?.modo_interaccion)
  check('min=max=1', q?.restriccion_minima === 1 && q?.restriccion_maxima === 1)
}
// 4. Top 3 → seleccion_multiple_ranked
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-2 — TOP 3\n\nSi solo pudieras hacer 3 movimientos, ¿cuáles? Marcalos en orden de prioridad.', NONE)
  console.log('4 — top 3:')
  check('modo ranked', q?.modo_interaccion === 'seleccion_multiple_ranked', q?.modo_interaccion)
  check('min=max=3', q?.restriccion_minima === 3 && q?.restriccion_maxima === 3)
}
// 5. Fases → secuenciacion
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-4 — SECUENCIA\n\nMirá el cronograma. ¿Distribuí los movimientos en fases?', NONE)
  console.log('5 — fases/cronograma:')
  check('modo secuenciacion', q?.modo_interaccion === 'secuenciacion', q?.modo_interaccion)
}
// 6. id ya existente → null
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-1 — PALANCA\n\n¿Palanca más fuerte?', new Set(['P-1']))
  console.log('6 — id ya existe:')
  check('devuelve null', q === null)
}
// 7. sin header PREGUNTA → null
{
  const q = sintetizarPreguntaPalanca('Buenísimo. Anoto eso y seguimos pensando.', NONE)
  console.log('7 — sin header:')
  check('devuelve null', q === null)
}
// 8. texto puro (sin keyword de modo) → entrada sin modo
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-5 — REFLEXIÓN\n\n¿Qué te lleva a postergar ese movimiento?', NONE)
  console.log('8 — texto puro:')
  check('id P-5', q?.id === 'P-5')
  check('sin modo', q?.modo_interaccion === undefined, q?.modo_interaccion)
}
// 9. múltiples headers → gana el último
{
  const q = sintetizarPreguntaPalanca('PREGUNTA P-2 — vieja\n...\nPREGUNTA P-4 — RIESGO\n\nUsá el editor de riesgos.', NONE)
  console.log('9 — último header gana:')
  check('id P-4', q?.id === 'P-4', q?.id)
}

// 10. header SIN "PREGUNTA" (el caso P-5 real que fallaba) → debe detectarse
{
  const q = sintetizarPreguntaPalanca('P-5 — RIESGO DE EJECUCIÓN\n\n¿Cuáles son los movimientos donde más temés que la ejecución salga mal? Usá el editor de riesgos.', NONE)
  console.log('10 — header sin "PREGUNTA":')
  check('id P-5', q?.id === 'P-5', q?.id)
  check('modo marcado_simple', q?.modo_interaccion === 'marcado_simple', q?.modo_interaccion)
}
// 11. header con markdown bold → debe detectarse y no incluir los **
{
  const q = sintetizarPreguntaPalanca('**P-2 — TOP 3 POR IMPACTO**\n\n¿Cuáles 3? Marcalos en orden de prioridad.', NONE)
  console.log('11 — header markdown bold:')
  check('id P-2', q?.id === 'P-2', q?.id)
  check('modo ranked', q?.modo_interaccion === 'seleccion_multiple_ranked', q?.modo_interaccion)
}
// 12. mención suelta de "P-1" en prosa (no a inicio de línea, sin guión) → NO matchea
{
  const q = sintetizarPreguntaPalanca('Como dijiste en la P-1, la palanca es M-1. Avancemos.', NONE)
  console.log('12 — mención suelta (falso positivo):')
  check('devuelve null', q === null, JSON.stringify(q))
}

console.log(`\n${pass}/${pass + fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
