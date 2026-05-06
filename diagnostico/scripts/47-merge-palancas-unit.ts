// Unit-test puro de `mergePalancas` (vía mergePlan) — Fase D Chunk A bug fix.
//
// Caso crítico: respuesta_estructurada se persiste vía PATCH dedicado
// (`/paso3/palancas/respuesta-estructurada`) — el modelo NO la conoce ni debe
// regenerarla. Si el modelo emite incoming sin respuesta_estructurada pero
// current la tenía, el merge debe preservarla.
//
// Sin esta protección, el siguiente turno del modelo borra la decisión
// estructurada del usuario, dejando el plan inconsistente y rompiendo la UX
// del panel interactivo.

import { parsePanelUpdate, mergePlan } from '@/lib/pe-panel-update'
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

console.log('\n─── Test 1: respuesta_estructurada del cliente NO debe perderse ───')
{
  const current: PlanoPE = {
    palancas: {
      preguntas_principal: [
        {
          id: 'P-1',
          origen: 'principal',
          pregunta: '¿Cuál es la palanca más fuerte?',
          respuesta: '',
          modo_interaccion: 'seleccion_unica',
          restriccion_minima: 1,
          restriccion_maxima: 1,
          // El cliente persistió esto via PATCH después de que el user confirmó:
          respuesta_estructurada: { modo: 'seleccion_unica', movimiento_id: 'M-1' },
        },
      ],
      preguntas_validador: [],
    },
  }

  // Lo que el modelo emite en el siguiente turno: pobló respuesta texto +
  // observacion, pero NO incluye respuesta_estructurada (el modelo no la conoce).
  const incoming: Partial<PlanoPE> = {
    palancas: {
      preguntas_principal: [
        {
          id: 'P-1',
          origen: 'principal',
          pregunta: '¿Cuál es la palanca más fuerte?',
          respuesta: 'M-1 porque el QA es el core...',
          observacion_modelo: 'M-1 es impacto pero no operativa.',
          modo_interaccion: 'seleccion_unica',
          restriccion_minima: 1,
          restriccion_maxima: 1,
          // SIN respuesta_estructurada — el modelo no la regenera
        },
      ],
      preguntas_validador: [],
    },
  }

  const merged = mergePlan(current, incoming as PlanoPE)
  const p1 = merged.value?.palancas?.preguntas_principal?.[0]
  assertEq('respuesta texto del modelo se aplica', p1?.respuesta, 'M-1 porque el QA es el core...')
  assertEq('observacion_modelo se aplica', p1?.observacion_modelo, 'M-1 es impacto pero no operativa.')
  assertEq('respuesta_estructurada del cliente PRESERVADA', p1?.respuesta_estructurada, { modo: 'seleccion_unica', movimiento_id: 'M-1' })
}

console.log('\n─── Test 2: respuesta_estructurada del modelo (incoming) tiene precedencia si la emite ───')
{
  const current: PlanoPE = {
    palancas: {
      preguntas_principal: [
        {
          id: 'P-1',
          origen: 'principal',
          pregunta: '¿X?',
          respuesta: '',
          modo_interaccion: 'seleccion_unica',
          respuesta_estructurada: { modo: 'seleccion_unica', movimiento_id: 'M-OLD' },
        },
      ],
      preguntas_validador: [],
    },
  }
  const incoming: Partial<PlanoPE> = {
    palancas: {
      preguntas_principal: [
        {
          id: 'P-1',
          origen: 'principal',
          pregunta: '¿X?',
          respuesta: 'razonamiento',
          modo_interaccion: 'seleccion_unica',
          // incoming explicit incluye respuesta_estructurada con valor distinto
          respuesta_estructurada: { modo: 'seleccion_unica', movimiento_id: 'M-NEW' },
        },
      ],
      preguntas_validador: [],
    },
  }
  // En la práctica el modelo NO debería emitir respuesta_estructurada distinta,
  // pero si lo hace (quizás adoptamos en backlog que él la regenere), debe ganar
  // el incoming. Este test documenta el comportamiento.
  const merged = mergePlan(current, incoming as PlanoPE)
  const p1 = merged.value?.palancas?.preguntas_principal?.[0]
  assertEq('respuesta_estructurada del incoming gana cuando está presente', p1?.respuesta_estructurada, { modo: 'seleccion_unica', movimiento_id: 'M-NEW' })
}

console.log('\n─── Test 3: pregunta nueva (P-2) sin current — pasa thru ───')
{
  const current: PlanoPE = {
    palancas: {
      preguntas_principal: [
        { id: 'P-1', origen: 'principal', pregunta: 'A', respuesta: 'r1', respuesta_estructurada: { modo: 'seleccion_unica', movimiento_id: 'M-1' } },
      ],
      preguntas_validador: [],
    },
  }
  const incoming: Partial<PlanoPE> = {
    palancas: {
      preguntas_principal: [
        { id: 'P-1', origen: 'principal', pregunta: 'A', respuesta: 'r1', modo_interaccion: 'seleccion_unica' },
        { id: 'P-2', origen: 'principal', pregunta: 'B', respuesta: '', modo_interaccion: 'seleccion_multiple_ranked', restriccion_minima: 3, restriccion_maxima: 3 },
      ],
      preguntas_validador: [],
    },
  }
  const merged = mergePlan(current, incoming as PlanoPE)
  const arr = merged.value?.palancas?.preguntas_principal ?? []
  assertEq('hay 2 preguntas después del merge', arr.length, 2)
  assertEq('P-1 conserva respuesta_estructurada', arr[0]?.respuesta_estructurada, { modo: 'seleccion_unica', movimiento_id: 'M-1' })
  assertEq('P-2 nueva pasa thru con metadata', arr[1]?.modo_interaccion, 'seleccion_multiple_ranked')
  assertEq('P-2 sin respuesta_estructurada (correcto, recién emitida)', arr[1]?.respuesta_estructurada, undefined)
}

console.log('\n─── Test 4: regresión del comportamiento existente — respuesta texto preservada ───')
{
  const current: PlanoPE = {
    palancas: {
      preguntas_principal: [
        { id: 'P-1', origen: 'principal', pregunta: 'A', respuesta: 'razonamiento existente' },
      ],
      preguntas_validador: [],
    },
  }
  const incoming: Partial<PlanoPE> = {
    palancas: {
      preguntas_principal: [
        // Modelo "olvida" la respuesta texto (caso edge): debe preservarse
        { id: 'P-1', origen: 'principal', pregunta: 'A', respuesta: '' },
      ],
      preguntas_validador: [],
    },
  }
  const merged = mergePlan(current, incoming as PlanoPE)
  const p1 = merged.value?.palancas?.preguntas_principal?.[0]
  assertEq('respuesta texto preservada cuando incoming la deja vacía', p1?.respuesta, 'razonamiento existente')
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
