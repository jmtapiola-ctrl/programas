// Unit-test puro de `parsePanelUpdate` (lib/pe-panel-update.ts).
//
// Sin red, sin Airtable, sin LLM. $0 USD. Segundos de runtime. 100% reproducible.
//
// Cobertura:
//   1. Cambio aditivo de Fase 0 (cierre_sugerido?: boolean opcional).
//   2. Regresión del parser pre-existente (shapes de items en arrays).
//   3. Comportamiento del merge protector (mergeProposito) para casos edge.
//
// Criterio: 100% de los assertions pasan. Si cualquiera falla → NO-GO sobre el merge.

import { parsePanelUpdate, mergeProposito } from '@/lib/pe-panel-update'
import type { PropositorPE } from '@/lib/types'

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

function assertOk(label: string, cond: boolean, detail?: string): void {
  total++
  if (cond) {
    pasados++
    console.log(`  ✅ ${label}`)
  } else {
    fallas.push(label)
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Fixture base: PANEL_UPDATE válido completo (sin cierre_sugerido) ───────
// Usado para verificar back-compat con turnos viejos.
const VALID_BASE_OBJ = {
  paso_actual: 1,
  sub_bloque_actual: '1.B',
  proposito: {
    escena: 'Escena ideal de prueba',
    metricas: [
      { metrica: 'M1', valor_objetivo: 'O1', valor_actual: 'A1' },
    ],
    fuera: [
      { item: 'Cosa fuera', razon: 'Razón clara' },
    ],
    horizonte: 'Fin 2026',
    estabilidad: 'Estable',
  },
  situacion: {
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
  },
  datos_faltantes: ['Dato 1', 'Dato 2'],
}

function wrapPanel(obj: any): string {
  return `Texto conversacional acá.\n\n<!--PANEL_UPDATE-->\n${JSON.stringify(obj, null, 2)}\n<!--/PANEL_UPDATE-->`
}

function panelOnly(obj: any): string {
  // Variante sin texto conversacional alrededor.
  return `<!--PANEL_UPDATE-->${JSON.stringify(obj)}<!--/PANEL_UPDATE-->`
}

// ─── Suite 1: cambio aditivo (cierre_sugerido) ──────────────────────────────
console.log('\n── Suite 1: cierre_sugerido (cambio aditivo Fase 0) ──')

// 1.1 — PANEL_UPDATE viejo SIN cierre_sugerido → OK (back-compat).
{
  const r = parsePanelUpdate(wrapPanel(VALID_BASE_OBJ))
  assertOk('1.1 PANEL_UPDATE viejo sin cierre_sugerido parsea OK', r.ok, r.ok ? '' : (r as any).reason + ': ' + (r as any).errors.join('|'))
  if (r.ok) {
    assertEq('1.1.b cierre_sugerido es undefined cuando ausente', r.data.cierre_sugerido, undefined)
  }
}

// 1.2 — cierre_sugerido: true → OK.
{
  const r = parsePanelUpdate(wrapPanel({ ...VALID_BASE_OBJ, cierre_sugerido: true }))
  assertOk('1.2 cierre_sugerido: true parsea OK', r.ok)
  if (r.ok) assertEq('1.2.b valor preservado', r.data.cierre_sugerido, true)
}

// 1.3 — cierre_sugerido: false → OK.
{
  const r = parsePanelUpdate(wrapPanel({ ...VALID_BASE_OBJ, cierre_sugerido: false }))
  assertOk('1.3 cierre_sugerido: false parsea OK', r.ok)
  if (r.ok) assertEq('1.3.b valor preservado', r.data.cierre_sugerido, false)
}

// 1.4 — cierre_sugerido: "true" (string) → invalid_shape.
{
  const r = parsePanelUpdate(wrapPanel({ ...VALID_BASE_OBJ, cierre_sugerido: 'true' }))
  assertOk('1.4 cierre_sugerido string "true" rechazado como invalid_shape', !r.ok && (r as any).reason === 'invalid_shape')
  if (!r.ok) {
    const errsConcat = (r as any).errors.join(' ')
    assertOk('1.4.b error menciona cierre_sugerido', /cierre_sugerido/i.test(errsConcat), errsConcat)
  }
}

// 1.5 — cierre_sugerido: 1 (number) → invalid_shape.
{
  const r = parsePanelUpdate(wrapPanel({ ...VALID_BASE_OBJ, cierre_sugerido: 1 }))
  assertOk('1.5 cierre_sugerido number 1 rechazado como invalid_shape', !r.ok && (r as any).reason === 'invalid_shape')
}

// 1.6 — cierre_sugerido: null → invalid_shape (null no es boolean).
{
  const r = parsePanelUpdate(wrapPanel({ ...VALID_BASE_OBJ, cierre_sugerido: null }))
  assertOk('1.6 cierre_sugerido null rechazado como invalid_shape', !r.ok && (r as any).reason === 'invalid_shape')
}

// ─── Suite 2: regresión del parser pre-existente ────────────────────────────
console.log('\n── Suite 2: regresión del parser pre-existente ──')

// 2.1 — No PANEL_UPDATE → no_block.
{
  const r = parsePanelUpdate('Solo texto conversacional, sin bloque PANEL_UPDATE.')
  assertOk('2.1 no_block detectado correctamente', !r.ok && (r as any).reason === 'no_block')
}

// 2.2 — JSON malformado → malformed_json.
{
  const r = parsePanelUpdate('<!--PANEL_UPDATE-->{ esto no es JSON válido<!--/PANEL_UPDATE-->')
  assertOk('2.2 malformed_json detectado correctamente', !r.ok && (r as any).reason === 'malformed_json')
}

// 2.3 — Resistencias en formato VIEJO (3 props: actor + descripcion + mitigacion) → invalid_shape.
//       (sugerencia del user: confirmar que el formato 3-prop ya no se acepta tras la extensión a 5 props)
{
  const objConRes3props = {
    ...VALID_BASE_OBJ,
    situacion: {
      ...VALID_BASE_OBJ.situacion,
      resistencias: [
        { actor: 'Actor X', descripcion: 'Por qué resiste', mitigacion: 'Cómo se maneja' },
      ],
    },
  }
  const r = parsePanelUpdate(wrapPanel(objConRes3props))
  assertOk('2.3 resistencia con 3 props (sin tipo+criticidad) rechazada como invalid_shape', !r.ok && (r as any).reason === 'invalid_shape')
  if (!r.ok) {
    const errs = (r as any).errors.join(' ')
    assertOk('2.3.b error menciona tipo o criticidad faltantes', /tipo|criticidad/i.test(errs), errs)
  }
}

// 2.4 — Items malformados en metricas (string suelto) → invalid_shape.
{
  const objMetricaString = {
    ...VALID_BASE_OBJ,
    proposito: { ...VALID_BASE_OBJ.proposito, metricas: ['string suelto en lugar de objeto'] as any },
  }
  const r = parsePanelUpdate(wrapPanel(objMetricaString))
  assertOk('2.4 metrica como string suelto rechazada', !r.ok && (r as any).reason === 'invalid_shape')
}

// 2.5 — Items malformados en fuera → invalid_shape.
{
  const objFueraString = {
    ...VALID_BASE_OBJ,
    proposito: { ...VALID_BASE_OBJ.proposito, fuera: ['fuera string'] as any },
  }
  const r = parsePanelUpdate(wrapPanel(objFueraString))
  assertOk('2.5 fuera como string suelto rechazada', !r.ok && (r as any).reason === 'invalid_shape')
}

// 2.6 — datos_faltantes con item no-string → invalid_shape.
{
  const objDatosObjeto = {
    ...VALID_BASE_OBJ,
    datos_faltantes: [{ x: 1 }] as any,
  }
  const r = parsePanelUpdate(wrapPanel(objDatosObjeto))
  assertOk('2.6 datos_faltantes con objeto en vez de string rechazado', !r.ok && (r as any).reason === 'invalid_shape')
}

// ─── Suite 3: edge cases sugeridos por user ─────────────────────────────────
console.log('\n── Suite 3: edge cases adicionales ──')

// 3.1 — Campo extra no declarado → debe parsear OK (ignora silenciosamente, no hay additionalProperties:false).
{
  const objConExtra = {
    ...VALID_BASE_OBJ,
    cierre_sugerido_extra: true,
    campo_inventado: 'whatever',
  }
  const r = parsePanelUpdate(wrapPanel(objConExtra as any))
  assertOk('3.1 campos extra no declarados se ignoran (parsea OK)', r.ok, r.ok ? '' : (r as any).reason + ': ' + (r as any).errors.join('|'))
}

// 3.2 — Campos correctos en orden distinto → OK (JSON.parse no le importa el orden).
{
  const objReordenado = {
    cierre_sugerido: false,
    datos_faltantes: VALID_BASE_OBJ.datos_faltantes,
    situacion: VALID_BASE_OBJ.situacion,
    proposito: VALID_BASE_OBJ.proposito,
    sub_bloque_actual: VALID_BASE_OBJ.sub_bloque_actual,
    paso_actual: VALID_BASE_OBJ.paso_actual,
  }
  const r = parsePanelUpdate(wrapPanel(objReordenado))
  assertOk('3.2 orden de campos invertido parsea OK', r.ok)
}

// 3.3 — Sin texto conversacional, solo bloque PANEL_UPDATE → OK.
{
  const r = parsePanelUpdate(panelOnly(VALID_BASE_OBJ))
  assertOk('3.3 PANEL_UPDATE sin texto envolvente parsea OK', r.ok)
}

// ─── Suite 4: merge protector (mergeProposito) — sugerencia del user ──────
console.log('\n── Suite 4: merge protector — preserved_empty + preserved_shrinkage ──')

const propCurrent: PropositorPE = {
  escena: 'Escena curada',
  metricas: [
    { metrica: 'M1', valor_objetivo: 'O1', valor_actual: 'A1' },
    { metrica: 'M2', valor_objetivo: 'O2', valor_actual: '' },
    { metrica: 'M3', valor_objetivo: 'O3', valor_actual: '' },
  ],
  fuera: [
    { item: 'Out 1', razon: 'r1' },
    { item: 'Out 2', razon: 'r2' },
  ],
  horizonte: 'Fin 2026',
  estabilidad: 'Estable',
}

// 4.1 — Incoming con metricas: [] sobre current con 3 items → preserved_empty.
{
  const propIncoming: PropositorPE = { ...propCurrent, metricas: [] }
  const result = mergeProposito(propCurrent, propIncoming)
  assertEq('4.1 metricas mantiene 3 items (preserved_empty)', result.value.metricas.length, 3)
  const ev = result.events.find(e => e.type === 'preserved_empty' && (e as any).field === 'proposito.metricas')
  assertOk('4.1.b evento preserved_empty emitido', !!ev)
}

// 4.2 — Incoming con metricas: [{...}] (1 item) sobre current con 3 → preserved_shrinkage (1 < 3).
{
  const propIncoming: PropositorPE = {
    ...propCurrent,
    metricas: [{ metrica: 'M1', valor_objetivo: 'O1-actualizado', valor_actual: 'A1-actualizado' }],
  }
  const result = mergeProposito(propCurrent, propIncoming)
  assertEq('4.2 metricas mantiene 3 items (preserved_shrinkage)', result.value.metricas.length, 3)
  const ev = result.events.find(e => e.type === 'preserved_shrinkage' && (e as any).field === 'proposito.metricas')
  assertOk('4.2.b evento preserved_shrinkage emitido con tamaños correctos',
    !!ev && (ev as any).current_size === 3 && (ev as any).incoming_size === 1)
}

// 4.3 — Incoming con escena: '' sobre current con texto → preserved_empty.
{
  const propIncoming: PropositorPE = { ...propCurrent, escena: '' }
  const result = mergeProposito(propCurrent, propIncoming)
  assertEq('4.3 escena vacía preserva la curada', result.value.escena, 'Escena curada')
}

// 4.4 — Incoming con metricas más LARGE (4 items) que current (3) → updated.
{
  const propIncoming: PropositorPE = {
    ...propCurrent,
    metricas: [
      ...propCurrent.metricas,
      { metrica: 'M4', valor_objetivo: 'O4', valor_actual: '' },
    ],
  }
  const result = mergeProposito(propCurrent, propIncoming)
  assertEq('4.4 metricas crece a 4 items', result.value.metricas.length, 4)
  const ev = result.events.find(e => e.type === 'updated' && (e as any).field === 'proposito.metricas')
  assertOk('4.4.b evento updated emitido', !!ev)
}

// ─── Caso 5: respuesta_estructurada mal formada NO debe rechazar el bloque ──
// Regresión del bug del panel atascado en 3.B: el modelo re-emitía palancas con
// una respuesta_estructurada mal formada (modo undefined) y el parser rechazaba
// TODO el PANEL_UPDATE (invalid_shape) → nada se persistía. Ahora se strippea.
{
  const bloque = `<!--PANEL_UPDATE-->
${JSON.stringify({
    paso_actual: 3,
    sub_bloque_actual: '3.B',
    cierre_sugerido: false,
    plan: {
      palancas: {
        preguntas_principal: [
          { id: 'P-1', origen: 'principal', pregunta: '¿Palanca?', respuesta: 'porque X',
            modo_interaccion: 'seleccion_unica',
            respuesta_estructurada: { movimiento_id: 'M-1' } }, // <-- sin .modo (mal formada)
          { id: 'P-2', origen: 'principal', pregunta: '¿Top 3?', respuesta: '',
            modo_interaccion: 'seleccion_multiple_ranked' },
        ],
      },
    },
  })}
<!--/PANEL_UPDATE-->`
  const res = parsePanelUpdate(bloque)
  assertOk('5.1 bloque con resp_estructurada mal formada parsea OK (no invalid_shape)', res.ok,
    res.ok ? undefined : `reason=${(res as any).reason} errs=${JSON.stringify((res as any).errors)}`)
  if (res.ok) {
    const pp = (res.data.plan as any)?.palancas?.preguntas_principal ?? []
    assertEq('5.2 conserva las 2 preguntas', pp.length, 2)
    assertOk('5.3 respuesta_estructurada fue strippeada de P-1', pp[0]?.respuesta_estructurada === undefined)
  }
}

// ─── Resumen final ────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72))
console.log(`Total: ${pasados}/${total} assertions pasaron`)
if (fallas.length > 0) {
  console.log(`\n❌ FALLAS:`)
  for (const f of fallas) console.log(`  - ${f}`)
  console.log('\nVERDICT: NO-GO sobre el merge.')
  process.exit(1)
} else {
  console.log('\nVERDICT: ✅ GO — parser y merge protector funcionan como esperado.')
}

export {}
