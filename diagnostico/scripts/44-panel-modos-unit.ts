// Unit tests puros de las helpers de los 5 modos del Panel Interactivo de
// Fichas (Fase D Chunk A — Ajuste 3 de Juan: smoke propio antes del checkpoint).
//
// Cubre lógica de validación (isCompleto_*) y serialización (buildRespuesta_*)
// para cada modo. Sin DOM, sin red, sin Airtable. Ejecuta en <1s.
//
// Uso:
//   npx tsx diagnostico/scripts/44-panel-modos-unit.ts

import {
  buildRespuesta_seleccionUnica,
  isCompleto_seleccionUnica,
} from '../../components/planes-estrategicos/fichas/ModoSeleccionUnica'
import {
  buildRespuesta_seleccionRanked,
  isCompleto_seleccionRanked,
} from '../../components/planes-estrategicos/fichas/ModoSeleccionMultipleRanked'
import {
  buildRespuesta_agrupacionPares,
  isCompleto_agrupacionPares,
} from '../../components/planes-estrategicos/fichas/ModoAgrupacionPares'
import {
  buildRespuesta_secuenciacion,
  isCompleto_secuenciacion,
} from '../../components/planes-estrategicos/fichas/ModoSecuenciacion'
import {
  buildRespuesta_marcadoSimple,
  isCompleto_marcadoSimple,
} from '../../components/planes-estrategicos/fichas/ModoMarcadoSimple'
import type { MovimientoPE } from '../../lib/types'

let pass = 0
let fail = 0
const fails: string[] = []

function assert(cond: boolean, name: string) {
  if (cond) {
    pass++
    process.stdout.write('.')
  } else {
    fail++
    fails.push(name)
    process.stdout.write('F')
  }
}

function deepEq<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── Mock de movimientos para tests ──

const movsMock: MovimientoPE[] = [
  { id: 'M-1', categoria: 'A', nombre: 'Mov 1', que_resuelve: '', ataca_desvio: '', costo_banda_ancha: 'media', costo_monetario: { rango_min_usd: 0, rango_max_usd: 0 }, ventana_temporal: { arranca: '2026-01', termina: '2026-02' }, precondiciones: [], desbloquea: [], tipo_dependencia: 'ninguna', dueno: 'X', criterio_exito: '', estado_usuario: 'pendiente' },
  { id: 'M-2', categoria: 'A', nombre: 'Mov 2', que_resuelve: '', ataca_desvio: '', costo_banda_ancha: 'alta', costo_monetario: { rango_min_usd: 0, rango_max_usd: 0 }, ventana_temporal: { arranca: '2026-01', termina: '2026-02' }, precondiciones: [], desbloquea: [], tipo_dependencia: 'ninguna', dueno: 'Y', criterio_exito: '', estado_usuario: 'pendiente' },
  { id: 'M-3', categoria: 'B', nombre: 'Mov 3', que_resuelve: '', ataca_desvio: '', costo_banda_ancha: 'baja', costo_monetario: { rango_min_usd: 0, rango_max_usd: 0 }, ventana_temporal: { arranca: '2026-01', termina: '2026-02' }, precondiciones: [], desbloquea: [], tipo_dependencia: 'ninguna', dueno: 'Z', criterio_exito: '', estado_usuario: 'pendiente' },
]

console.log('Suite: Modo seleccion_unica')
// build
assert(buildRespuesta_seleccionUnica(null) === null, 'build_unica null → null')
assert(deepEq(buildRespuesta_seleccionUnica('M-1'), { modo: 'seleccion_unica', movimiento_id: 'M-1' }), 'build_unica M-1 → shape correcto')
// isCompleto
assert(isCompleto_seleccionUnica(null) === false, 'isCompleto_unica null → false')
assert(isCompleto_seleccionUnica('M-1') === true, 'isCompleto_unica M-1 → true')

console.log('\nSuite: Modo seleccion_multiple_ranked')
// build
assert(buildRespuesta_seleccionRanked([]) === null, 'build_ranked vacío → null')
const ranked = buildRespuesta_seleccionRanked(['M-2', 'M-1', 'M-3'])
assert(
  ranked !== null && ranked.modo === 'seleccion_multiple_ranked' &&
    deepEq(ranked.ranking, [
      { movimiento_id: 'M-2', posicion: 1 },
      { movimiento_id: 'M-1', posicion: 2 },
      { movimiento_id: 'M-3', posicion: 3 },
    ]),
  'build_ranked posiciones según orden'
)
// isCompleto sin restricciones
assert(isCompleto_seleccionRanked([]) === false, 'isCompleto_ranked vacío sin restricción → false (length>0 requerido)')
assert(isCompleto_seleccionRanked(['M-1']) === true, 'isCompleto_ranked 1 sin restricción → true')
// isCompleto con min=3 max=3 (caso "top 3")
assert(isCompleto_seleccionRanked(['M-1'], 3, 3) === false, 'isCompleto_ranked 1/3 → false')
assert(isCompleto_seleccionRanked(['M-1', 'M-2', 'M-3'], 3, 3) === true, 'isCompleto_ranked 3/3 → true')
assert(isCompleto_seleccionRanked(['M-1', 'M-2', 'M-3'], 2, 5) === true, 'isCompleto_ranked 3 con min=2 max=5 → true')
assert(isCompleto_seleccionRanked(['M-1'], 2, 5) === false, 'isCompleto_ranked 1 con min=2 → false')

console.log('\nSuite: Modo agrupacion_pares')
// build
assert(buildRespuesta_agrupacionPares([]) === null, 'build_pares vacío → null')
const pares = buildRespuesta_agrupacionPares([{ desde: 'M-1', hacia: 'M-2' }])
assert(
  pares !== null && pares.modo === 'agrupacion_pares' && deepEq(pares.pares, [{ desde: 'M-1', hacia: 'M-2' }]),
  'build_pares 1 par → shape correcto'
)
// isCompleto
assert(isCompleto_agrupacionPares([]) === false, 'isCompleto_pares 0 sin restricción (default min=1) → false')
assert(isCompleto_agrupacionPares([{ desde: 'M-1', hacia: 'M-2' }]) === true, 'isCompleto_pares 1 → true')
assert(isCompleto_agrupacionPares([{ desde: 'M-1', hacia: 'M-2' }, { desde: 'M-2', hacia: 'M-3' }], undefined, 2) === true, 'isCompleto_pares 2/2 → true')

console.log('\nSuite: Modo secuenciacion')
// build
const seq = buildRespuesta_secuenciacion([
  { fase: 'Q1', movimientos: ['M-1'] },
  { fase: 'Q2', movimientos: ['M-2', 'M-3'] },
])
assert(
  seq.modo === 'secuenciacion' && seq.fases.length === 2,
  'build_seq → shape correcto'
)
// isCompleto: todos los movimientos deben estar en alguna fase
assert(
  isCompleto_secuenciacion([{ fase: 'Q1', movimientos: ['M-1'] }], movsMock) === false,
  'isCompleto_seq 1/3 movs en fases → false'
)
assert(
  isCompleto_secuenciacion(
    [
      { fase: 'Q1', movimientos: ['M-1', 'M-2'] },
      { fase: 'Q2', movimientos: ['M-3'] },
    ],
    movsMock
  ) === true,
  'isCompleto_seq 3/3 movs en fases → true'
)

console.log('\nSuite: Modo marcado_simple')
// build (siempre devuelve respuesta válida, incluso vacía)
assert(deepEq(buildRespuesta_marcadoSimple([]), { modo: 'marcado_simple', marcados: [] }), 'build_marcado vacío → array vacío')
assert(deepEq(buildRespuesta_marcadoSimple(['M-1', 'M-3']), { modo: 'marcado_simple', marcados: ['M-1', 'M-3'] }), 'build_marcado 2 → shape correcto')
// isCompleto: 0 marcados es válido por default (min=0 implícito)
assert(isCompleto_marcadoSimple([]) === true, 'isCompleto_marcado 0 sin restricción → true (ninguno es respuesta válida)')
assert(isCompleto_marcadoSimple(['M-1']) === true, 'isCompleto_marcado 1 → true')
assert(isCompleto_marcadoSimple([], 1) === false, 'isCompleto_marcado 0 con min=1 → false')
assert(isCompleto_marcadoSimple(['M-1'], 1, 1) === true, 'isCompleto_marcado 1/1 → true')
assert(isCompleto_marcadoSimple(['M-1', 'M-2'], undefined, 1) === false, 'isCompleto_marcado 2 con max=1 → false')

console.log('\n')
console.log('═'.repeat(50))
console.log(`Resultado: ${pass} passed, ${fail} failed`)
if (fails.length > 0) {
  console.log('\nTests que fallaron:')
  for (const f of fails) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('═'.repeat(50))
console.log('✔ Todos los unit tests de los 5 modos pasaron')
