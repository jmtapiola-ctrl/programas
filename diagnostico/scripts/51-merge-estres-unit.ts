// Unit-test puro de `mergeEstres` (vía mergePlan) — Fase D Chunk C.
//
// Casos críticos a cubrir:
//   - respuesta_estructurada del cliente PRESERVADA al re-emitir el modelo
//     (mismo patrón que mergePalancas).
//   - ajuste_aplicado PRESERVADO si el modelo lo registra una vez y luego
//     omite reemisión (panel-metadata del 3.D).
//   - panel metadata (modo_interaccion, restricciones, etc.) preservada cuando
//     el modelo re-emite la pregunta como follow-up text-only.
//   - Preguntas omitidas en incoming se mantienen del current (estado acumulado).

import { mergePlan } from '@/lib/pe-panel-update'
import type { PlanoPE } from '@/lib/types'

let total = 0
let pasados = 0
const fallas: string[] = []

function assertEq(label: string, actual: unknown, expected: unknown): void {
  total++
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pasados++
    console.log(`  ✅ ${label}`)
  } else {
    fallas.push(label)
    console.log(`  ❌ ${label}`)
    console.log(`       expected: ${JSON.stringify(expected)}`)
    console.log(`       actual:   ${JSON.stringify(actual)}`)
  }
}

console.log('\n─── Test 1: respuesta_estructurada del cliente PRESERVADA ───')
{
  const current: PlanoPE = {
    estres: {
      preguntas: [
        {
          id: 'E-1',
          pregunta: '¿Cuál movimiento es más frágil ante atraso de 60 días?',
          respuesta: '',
          modo_interaccion: 'seleccion_unica',
          restriccion_minima: 1,
          restriccion_maxima: 1,
          respuesta_estructurada: { modo: 'seleccion_unica', movimiento_id: 'M-1' },
        },
      ],
    },
  }
  const incoming: Partial<PlanoPE> = {
    estres: {
      preguntas: [
        {
          id: 'E-1',
          pregunta: '¿Cuál movimiento es más frágil ante atraso de 60 días?',
          respuesta: 'M-1 porque toda la cadena cuelga de la contratación',
          observacion_modelo: 'Observación: confirma single point of failure',
          modo_interaccion: 'seleccion_unica',
          restriccion_minima: 1,
          restriccion_maxima: 1,
          // SIN respuesta_estructurada — el modelo no la regenera
        },
      ],
    },
  }
  const merged = mergePlan(current, incoming as PlanoPE)
  const e1 = merged.value?.estres?.preguntas?.[0]
  assertEq('respuesta texto del modelo se aplica', e1?.respuesta, 'M-1 porque toda la cadena cuelga de la contratación')
  assertEq('observacion_modelo se aplica', e1?.observacion_modelo, 'Observación: confirma single point of failure')
  assertEq('respuesta_estructurada PRESERVADA', e1?.respuesta_estructurada, { modo: 'seleccion_unica', movimiento_id: 'M-1' })
}

console.log('\n─── Test 2: ajuste_aplicado PRESERVADO si modelo omite reemisión ───')
{
  const current: PlanoPE = {
    estres: {
      preguntas: [
        {
          id: 'E-2',
          pregunta: '¿Atajo posible para M-10?',
          respuesta: 'Sí, usar mocks generados automáticamente con OpenAPI spec',
          ajuste_aplicado: { tipo: 'inventario', descripcion: 'Agregar paso de auto-generación de mocks en M-10' },
        },
      ],
    },
  }
  const incoming: Partial<PlanoPE> = {
    estres: {
      preguntas: [
        {
          id: 'E-2',
          pregunta: '¿Atajo posible para M-10?',
          respuesta: 'Sí, usar mocks generados automáticamente con OpenAPI spec',
          // SIN ajuste_aplicado — modelo se olvidó de reemitir
        },
      ],
    },
  }
  const merged = mergePlan(current, incoming as PlanoPE)
  const e2 = merged.value?.estres?.preguntas?.[0]
  assertEq('ajuste_aplicado PRESERVADO', e2?.ajuste_aplicado, { tipo: 'inventario', descripcion: 'Agregar paso de auto-generación de mocks en M-10' })
}

console.log('\n─── Test 3: panel metadata preservado si modelo re-emite sin él ───')
{
  const current: PlanoPE = {
    estres: {
      preguntas: [
        {
          id: 'E-3',
          pregunta: '¿Cuáles movimientos son innecesarios si M-1 funciona perfecto?',
          respuesta: '',
          modo_interaccion: 'marcado_simple',
          campos_a_mostrar: ['nombre', 'que_resuelve', 'banda_ancha'],
          instruccion_panel: 'Marcá los movimientos que harías solo por reaseguro',
          restriccion_minima: 0,
          respuesta_estructurada: { modo: 'marcado_simple', marcados: ['M-15', 'M-18'] },
        },
      ],
    },
  }
  const incoming: Partial<PlanoPE> = {
    estres: {
      preguntas: [
        {
          id: 'E-3',
          pregunta: '¿Cuáles movimientos son innecesarios si M-1 funciona perfecto? — seguimiento',
          respuesta: 'M-15 (alertas Sentry) y M-18 (docs) son reaseguro, no críticos',
          // SIN metadata del panel
        },
      ],
    },
  }
  const merged = mergePlan(current, incoming as PlanoPE)
  const e3 = merged.value?.estres?.preguntas?.[0]
  assertEq('respuesta texto del modelo se aplica', e3?.respuesta, 'M-15 (alertas Sentry) y M-18 (docs) son reaseguro, no críticos')
  assertEq('modo_interaccion PRESERVADO', e3?.modo_interaccion, 'marcado_simple')
  assertEq('campos_a_mostrar PRESERVADO', e3?.campos_a_mostrar, ['nombre', 'que_resuelve', 'banda_ancha'])
  assertEq('instruccion_panel PRESERVADO', e3?.instruccion_panel, 'Marcá los movimientos que harías solo por reaseguro')
  assertEq('restriccion_minima PRESERVADA', e3?.restriccion_minima, 0)
  assertEq('respuesta_estructurada PRESERVADA', e3?.respuesta_estructurada, { modo: 'marcado_simple', marcados: ['M-15', 'M-18'] })
}

console.log('\n─── Test 4: pregunta nueva (E-2) sin current — pasa thru ───')
{
  const current: PlanoPE = {
    estres: {
      preguntas: [
        { id: 'E-1', pregunta: 'Q1', respuesta: 'A1' },
      ],
    },
  }
  const incoming: Partial<PlanoPE> = {
    estres: {
      preguntas: [
        { id: 'E-1', pregunta: 'Q1', respuesta: 'A1' },
        {
          id: 'E-2',
          pregunta: 'Q2 nueva',
          respuesta: '',
          modo_interaccion: 'marcado_simple',
          instruccion_panel: 'Marcá los frágiles',
        },
      ],
    },
  }
  const merged = mergePlan(current, incoming as PlanoPE)
  const arr = merged.value?.estres?.preguntas ?? []
  assertEq('hay 2 preguntas después del merge', arr.length, 2)
  assertEq('E-2 nueva pasa thru con metadata', arr[1]?.modo_interaccion, 'marcado_simple')
  assertEq('E-2 instruccion_panel', arr[1]?.instruccion_panel, 'Marcá los frágiles')
}

console.log('\n─── Test 5: pregunta omitida en incoming se preserva del current ───')
{
  const current: PlanoPE = {
    estres: {
      preguntas: [
        { id: 'E-1', pregunta: 'Q1', respuesta: 'A1' },
        { id: 'E-2', pregunta: 'Q2', respuesta: 'A2' },
      ],
    },
  }
  const incoming: Partial<PlanoPE> = {
    estres: {
      preguntas: [
        // Solo emite E-2; el modelo se olvidó de E-1
        { id: 'E-2', pregunta: 'Q2', respuesta: 'A2 actualizada' },
      ],
    },
  }
  const merged = mergePlan(current, incoming as PlanoPE)
  const arr = merged.value?.estres?.preguntas ?? []
  assertEq('hay 2 preguntas (E-1 preservada + E-2 actualizada)', arr.length, 2)
  const e1 = arr.find(q => q.id === 'E-1')
  const e2 = arr.find(q => q.id === 'E-2')
  assertEq('E-1 preservada', e1?.respuesta, 'A1')
  assertEq('E-2 actualizada', e2?.respuesta, 'A2 actualizada')
}

// ─── Resumen ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`Total: ${total} | Pasados: ${pasados} | Fallaron: ${total - pasados}`)
if (fallas.length > 0) {
  console.log(`\nFALLAS:`)
  for (const f of fallas) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`✅ TODOS LOS TESTS PASAN`)
