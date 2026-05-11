// Unit-test puro del parser sobre cambio_retroactivo (Fase F — H7).
// Sin Anthropic, sin Airtable. Valida shape + tolerancia.

import { parsePanelUpdate } from '@/lib/pe-panel-update'

let total = 0
let pasados = 0
const fallas: string[] = []

function assert(label: string, cond: boolean, info?: string): void {
  total++
  if (cond) {
    pasados++
    console.log(`  ✅ ${label}`)
  } else {
    fallas.push(label)
    console.log(`  ❌ ${label}${info ? ` — ${info}` : ''}`)
  }
}

function wrap(json: object): string {
  return `<!--PANEL_UPDATE-->\n${JSON.stringify(json)}\n<!--/PANEL_UPDATE-->`
}

const BASE = {
  paso_actual: 3,
  sub_bloque_actual: '3.D',
  proposito: { escena: 'x', metricas: [], fuera: [], horizonte: 'x', estabilidad: 'x' },
  situacion: {
    desvio_principal: 'x', desvio_cuantificado: 'x', desvios_secundarios: [],
    causa_raiz: 'x', consecuencia_6m: 'x', consecuencia_12m: 'x',
    recursos_actuales: 'x', recursos_faltantes: 'x', intentos_previos: 'x', resistencias: [],
  },
  datos_faltantes: [],
}

console.log('\n─── Test 1: cambio_retroactivo ausente — válido ───')
{
  const res = parsePanelUpdate(wrap(BASE))
  assert('parsea OK sin cambio_retroactivo', res.ok === true, res.ok === false ? res.errors.join('; ') : '')
}

console.log('\n─── Test 2: cambio_retroactivo.detectado=false — válido ───')
{
  const res = parsePanelUpdate(wrap({ ...BASE, cambio_retroactivo: { detectado: false } }))
  assert('parsea OK con detectado=false', res.ok === true, res.ok === false ? res.errors.join('; ') : '')
}

console.log('\n─── Test 3: cambio_retroactivo completo — válido ───')
{
  const res = parsePanelUpdate(wrap({
    ...BASE,
    cambio_retroactivo: {
      detectado: true,
      toca_material_validado: true,
      es_estructural: true,
      bloque_afectado: '3.A Inventario',
      texto_previo: 'M-1 era contratar QA Lead',
      descripcion_cambio: 'Cambiar M-1 a contratar Performance Engineer en su lugar',
      impactos_detectados: ['Rompe cadena M-3→M-4→M-1', 'Cambia path mínimo'],
    },
  }))
  assert('parsea OK con cambio_retroactivo completo', res.ok === true, res.ok === false ? res.errors.join('; ') : '')
  if (res.ok) {
    assert('cambio_retroactivo.detectado=true', res.data.cambio_retroactivo?.detectado === true)
    assert('toca_material_validado=true', res.data.cambio_retroactivo?.toca_material_validado === true)
    assert('es_estructural=true', res.data.cambio_retroactivo?.es_estructural === true)
    assert('bloque_afectado preserved', res.data.cambio_retroactivo?.bloque_afectado === '3.A Inventario')
    assert('impactos_detectados has 2 items', res.data.cambio_retroactivo?.impactos_detectados?.length === 2)
  }
}

console.log('\n─── Test 4: cambio_retroactivo.detectado=true con campos opcionales faltantes — válido (graceful) ───')
{
  // Defensive: si el modelo emite detectado=true pero olvida algún campo,
  // el parser NO rechaza. El backend hace fallback ('(no especificado)', '', []).
  const res = parsePanelUpdate(wrap({
    ...BASE,
    cambio_retroactivo: { detectado: true },
  }))
  assert('parsea OK con detectado=true pero sin otros campos', res.ok === true, res.ok === false ? res.errors.join('; ') : '')
}

console.log('\n─── Test 5: cambio_retroactivo con tipo inválido — rechaza ───')
{
  const res = parsePanelUpdate(wrap({
    ...BASE,
    cambio_retroactivo: { detectado: 'sí' as any },  // string en lugar de boolean
  }))
  assert('rechaza detectado no-boolean', res.ok === false)
  if (res.ok === false) {
    assert('error menciona detectado', res.errors.some(e => /detectado/.test(e)))
  }
}

console.log('\n─── Test 6: cambio_retroactivo con impactos_detectados no-array — rechaza ───')
{
  const res = parsePanelUpdate(wrap({
    ...BASE,
    cambio_retroactivo: {
      detectado: true,
      toca_material_validado: true,
      es_estructural: false,
      impactos_detectados: 'no es array',
    } as any,
  }))
  assert('rechaza impactos_detectados no-array', res.ok === false)
}

console.log('\n─── Test 7: cambio_retroactivo es array (en vez de objeto) — rechaza ───')
{
  const res = parsePanelUpdate(wrap({
    ...BASE,
    cambio_retroactivo: ['oops'] as any,
  }))
  assert('rechaza cambio_retroactivo array', res.ok === false)
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
