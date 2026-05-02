// Tests del nuevo pipeline de PANEL_UPDATE (Fase 1).
//
//   Set 1 — Parser unit tests (sin red): JSON válido, malformado, shape inválido, ausente.
//   Set 2 — Merge protector tests (sin red): nunca pisa no-vacío con vacío.
//   Set 3 — Integración con plan mock (sin red): merge de panelUpdate parcial.
//   Set 4 — Smoke test contra Anthropic (con red, ~$0.50): respuesta válida + retry.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import {
  parsePanelUpdate,
  mergeProposito,
  mergeSituacion,
  mergeDatosFaltantes,
  mergePasoActual,
} from '@/lib/pe-panel-update'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'
import type { PropositorPE, SituacionPE } from '@/lib/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`  ✔ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); fail++ }
}

// ─── Helpers para construir PANEL_UPDATEs sintéticos ──────────────────────────

function panelComplete(): string {
  return `<!--PANEL_UPDATE-->
{
  "paso_actual": 2,
  "sub_bloque_actual": "2.A",
  "proposito": {
    "escena": "Una escena clara",
    "metricas": [{"metrica":"X","valor_objetivo":"Y","valor_actual":"Z"}],
    "fuera": [{"item":"A","razon":"B"}],
    "horizonte": "Fin de 2026",
    "estabilidad": "estable"
  },
  "situacion": {
    "desvio_principal": "Desvío X",
    "desvio_cuantificado": "1 vs 6",
    "desvios_secundarios": [{"descripcion":"D1","datos":"X"}],
    "causa_raiz": "Causa Y",
    "consecuencia_6m": "C6",
    "consecuencia_12m": "C12",
    "recursos_actuales": "R actuales",
    "recursos_faltantes": "R faltantes",
    "intentos_previos": "Intentos",
    "resistencias": [{"actor":"A1","descripcion":"Por qué","mitigacion":"Cómo","tipo":"Interna","criticidad":"Alta"}]
  },
  "datos_faltantes": ["dato1","dato2"]
}
<!--/PANEL_UPDATE-->`
}

async function main() {
  // ════════════════════════════════════════════════════════════════════════
  // SET 1 — Parser unit tests
  // ════════════════════════════════════════════════════════════════════════
  console.log('═'.repeat(72))
  console.log('SET 1 — Parser unit tests (sin red)')
  console.log('═'.repeat(72))

  // 1.1 — JSON válido completo
  {
    const r = parsePanelUpdate('Texto previo del modelo. ' + panelComplete())
    check('1.1 JSON válido completo → ok=true', r.ok)
    if (r.ok) check('     paso_actual=2', r.data.paso_actual === 2)
    if (r.ok) check('     situacion.causa_raiz="Causa Y"', r.data.situacion.causa_raiz === 'Causa Y')
  }

  // 1.2 — Sin bloque
  {
    const r = parsePanelUpdate('Solo texto, sin marcadores PANEL_UPDATE.')
    check('1.2 Sin bloque → ok=false, reason=no_block', !r.ok && r.reason === 'no_block')
  }

  // 1.3 — JSON malformado (coma sobrante)
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{"paso_actual": 1, "sub_bloque_actual": "1.A",}
<!--/PANEL_UPDATE-->`)
    check('1.3 JSON malformado → ok=false, reason=malformed_json', !r.ok && r.reason === 'malformed_json')
    if (!r.ok) check('     errors no vacío', r.errors.length > 0)
  }

  // 1.4 — JSON malformado (string sin cerrar)
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{"paso_actual": 1, "sub_bloque_actual": "1.A
<!--/PANEL_UPDATE-->`)
    check('1.4 JSON con string sin cerrar → reason=malformed_json', !r.ok && r.reason === 'malformed_json')
  }

  // 1.5 — Shape inválido: falta proposito
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{"paso_actual": 1, "sub_bloque_actual": "1.A", "datos_faltantes": []}
<!--/PANEL_UPDATE-->`)
    check('1.5 Falta proposito + situacion → reason=invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok && r.reason === 'invalid_shape') {
      const hasProp = r.errors.some(e => e.includes('proposito'))
      const hasSit = r.errors.some(e => e.includes('situacion'))
      check('     errors mencionan proposito y situacion', hasProp && hasSit, r.errors.join('; '))
    }
  }

  // 1.6 — Shape inválido: causa_raiz es null
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{
  "paso_actual": 2, "sub_bloque_actual": "2.C",
  "proposito": {"escena":"x","metricas":[],"fuera":[],"horizonte":"","estabilidad":""},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":null,"consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->`)
    check('1.6 causa_raiz=null → invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok && r.reason === 'invalid_shape') {
      check('     error específico de situacion.causa_raiz', r.errors.some(e => e.includes('causa_raiz')), r.errors.join('; '))
    }
  }

  // 1.7 — Shape inválido: paso_actual como string
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{
  "paso_actual": "2", "sub_bloque_actual": "2.A",
  "proposito": {"escena":"x","metricas":[],"fuera":[],"horizonte":"","estabilidad":""},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->`)
    check('1.7 paso_actual como string → invalid_shape', !r.ok && r.reason === 'invalid_shape')
  }

  // 1.8 — Errores específicos por campo (validación strict)
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{
  "paso_actual": 2, "sub_bloque_actual": "2.A",
  "proposito": {"escena":"x","metricas":"not array","fuera":[],"horizonte":"","estabilidad":""},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->`)
    check('1.8 metricas como string → error específico', !r.ok && r.reason === 'invalid_shape' && r.errors.some(e => e.includes('proposito.metricas')))
  }

  // ════════════════════════════════════════════════════════════════════════
  // SET 1.5 — Validación strict de items dentro de arrays (Pieza 2)
  // ════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('═'.repeat(72))
  console.log('SET 1.5 — Validación strict de items (Pieza 2 — modular)')
  console.log('═'.repeat(72))

  function panelWith(arrayBody: string): string {
    return `<!--PANEL_UPDATE-->
{
  "paso_actual": 2,
  "sub_bloque_actual": "2.A",
  "proposito": {"escena":"X","metricas":[{"metrica":"M","valor_objetivo":"V","valor_actual":""}],"fuera":[{"item":"I","razon":"R"}],"horizonte":"H","estabilidad":"E"},
  "situacion": ${arrayBody},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->`
  }

  // 1.5.1 — metricas con strings sueltos en lugar de objetos (regression del bug Terravinci)
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{
  "paso_actual": 2, "sub_bloque_actual": "2.A",
  "proposito": {"escena":"x","metricas":["Volumen / 1.000+ dueños/mes","Productividad / 2x"],"fuera":[],"horizonte":"H","estabilidad":"E"},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->`)
    check('1.5.1 metricas con strings sueltos → invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok) {
      check('     error menciona "proposito.metricas[0]"', r.errors.some(e => e.includes('proposito.metricas[0]')))
      check('     error menciona el shape esperado {metrica, valor_objetivo, valor_actual}', r.errors.some(e => e.includes('metrica')))
    }
  }

  // 1.5.2 — fuera con strings sueltos
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{
  "paso_actual": 2, "sub_bloque_actual": "2.A",
  "proposito": {"escena":"x","metricas":[],"fuera":["Latam","M&A"],"horizonte":"H","estabilidad":"E"},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->`)
    check('1.5.2 fuera con strings sueltos → invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok) check('     error menciona "proposito.fuera[0]"', r.errors.some(e => e.includes('proposito.fuera[0]')))
  }

  // 1.5.3 — desvios_secundarios con strings sueltos
  {
    const r = parsePanelUpdate(panelWith(`{"desvio_principal":"D","desvio_cuantificado":"X","desvios_secundarios":["Marca masiva","PAI"],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]}`))
    check('1.5.3 desvios_secundarios con strings sueltos → invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok) check('     error menciona "situacion.desvios_secundarios[0]"', r.errors.some(e => e.includes('situacion.desvios_secundarios[0]')))
  }

  // 1.5.4 — resistencias con strings sueltos (el bug exacto del Plan Terravinci)
  {
    const r = parsePanelUpdate(panelWith(`{"desvio_principal":"D","desvio_cuantificado":"X","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":["Macro acomodándose","Reputación"]}`))
    check('1.5.4 resistencias con strings sueltos → invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok) check('     error menciona "situacion.resistencias[0]"', r.errors.some(e => e.includes('situacion.resistencias[0]')))
  }

  // 1.5.5 — resistencias con SHAPE VIEJO (3 props sin descripcion ni mitigacion) → invalid_shape
  {
    const r = parsePanelUpdate(panelWith(`{"desvio_principal":"D","desvio_cuantificado":"X","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[{"actor":"X","tipo":"Externa","criticidad":"Alta"}]}`))
    check('1.5.5 resistencias con shape viejo (sin descripcion/mitigacion) → invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok) {
      check('     error menciona "descripcion debe ser string"', r.errors.some(e => e.includes('descripcion')))
      check('     error menciona "mitigacion debe ser string"', r.errors.some(e => e.includes('mitigacion')))
    }
  }

  // 1.5.6 — TODO bien shapeado (ahora con resistencia 5-prop) → ok=true
  {
    const r = parsePanelUpdate(panelWith(`{"desvio_principal":"D","desvio_cuantificado":"X","desvios_secundarios":[{"descripcion":"D1","datos":"X1"}],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[{"actor":"A1","descripcion":"D1","mitigacion":"M1","tipo":"Interna","criticidad":"Alta"}]}`))
    check('1.5.6 todos los items con shape correcto → ok=true', r.ok)
  }

  // 1.5.7 — datos_faltantes con objetos en lugar de strings → error
  {
    const r = parsePanelUpdate(`<!--PANEL_UPDATE-->
{
  "paso_actual": 2, "sub_bloque_actual": "2.A",
  "proposito": {"escena":"x","metricas":[{"metrica":"M","valor_objetivo":"V","valor_actual":""}],"fuera":[{"item":"I","razon":"R"}],"horizonte":"H","estabilidad":"E"},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":"","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": [{"dato":"X"}]
}
<!--/PANEL_UPDATE-->`)
    check('1.5.7 datos_faltantes con objetos → invalid_shape', !r.ok && r.reason === 'invalid_shape')
    if (!r.ok) check('     error menciona "datos_faltantes[0]"', r.errors.some(e => e.includes('datos_faltantes[0]')))
  }

  // ════════════════════════════════════════════════════════════════════════
  // SET 2 — Merge protector tests
  // ════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('═'.repeat(72))
  console.log('SET 2 — Merge protector tests (sin red)')
  console.log('═'.repeat(72))

  const propositoLleno: PropositorPE = {
    escena: 'Escena completa',
    metricas: [{ metrica: 'M1', valor_objetivo: 'V1', valor_actual: 'A1' }],
    fuera: [
      { item: 'X1', razon: 'R1' },
      { item: 'X2', razon: 'R2' },
      { item: 'X3', razon: 'R3' },
      { item: 'X4', razon: 'R4' },
      { item: 'X5', razon: 'R5' },
      { item: 'X6', razon: 'R6' },
      { item: 'X7', razon: 'R7' },
      { item: 'X8', razon: 'R8' },
    ],
    horizonte: 'Fin de 2026',
    estabilidad: 'estable',
  }

  // 2.1 — incoming.fuera vacío + current.fuera con 8 items → merged conserva los 8
  {
    const incoming: PropositorPE = { ...propositoLleno, fuera: [] }
    const m = mergeProposito(propositoLleno, incoming)
    check('2.1 fuera vacío incoming → preserva los 8 items current', m.value.fuera.length === 8)
    check('     event preserved_empty para proposito.fuera', m.events.some(e => e.type === 'preserved_empty' && e.field === 'proposito.fuera'))
  }

  // 2.2 — incoming todo vacío → merged === current
  {
    const incoming: PropositorPE = { escena: '', metricas: [], fuera: [], horizonte: '', estabilidad: '' }
    const m = mergeProposito(propositoLleno, incoming)
    check('2.2 incoming todo vacío → merged.escena conserva', m.value.escena === propositoLleno.escena)
    check('     merged.metricas.length === 1', m.value.metricas.length === 1)
    check('     merged.fuera.length === 8', m.value.fuera.length === 8)
    check('     merged.horizonte conservado', m.value.horizonte === 'Fin de 2026')
    check('     5 eventos preserved_empty', m.events.filter(e => e.type === 'preserved_empty').length === 5)
  }

  // 2.3 — incoming.escena nuevo + others vacíos → escena se actualiza, otros se conservan
  {
    const incoming: PropositorPE = { escena: 'Escena NUEVA', metricas: [], fuera: [], horizonte: '', estabilidad: '' }
    const m = mergeProposito(propositoLleno, incoming)
    check('2.3 escena nuevo + otros vacíos → escena nueva, otros conservados',
      m.value.escena === 'Escena NUEVA' && m.value.metricas.length === 1 && m.value.fuera.length === 8)
    check('     1 evento updated + 4 preserved_empty',
      m.events.filter(e => e.type === 'updated').length === 1 && m.events.filter(e => e.type === 'preserved_empty').length === 4)
  }

  // 2.4 — Situacion: causa_raiz nuevo + otros mantienen
  {
    const sLleno: SituacionPE = {
      desvio_principal: 'D principal previo',
      desvio_cuantificado: 'cuant previo',
      desvios_secundarios: [{ descripcion: 'D1', datos: 'X' }],
      causa_raiz: '', consecuencia_6m: '', consecuencia_12m: '',
      recursos_actuales: '', recursos_faltantes: '', intentos_previos: '',
      resistencias: [],
    }
    const incoming: SituacionPE = {
      desvio_principal: '', desvio_cuantificado: '',
      desvios_secundarios: [],
      causa_raiz: 'Causa NUEVA',
      consecuencia_6m: '', consecuencia_12m: '',
      recursos_actuales: '', recursos_faltantes: '', intentos_previos: '',
      resistencias: [],
    }
    const m = mergeSituacion(sLleno, incoming)
    check('2.4 causa_raiz nuevo + desvio_principal previo → ambos presentes',
      m.value.causa_raiz === 'Causa NUEVA' && m.value.desvio_principal === 'D principal previo')
    check('     desvios_secundarios preservados (no pisar con [])', m.value.desvios_secundarios.length === 1)
  }

  // 2.5 — Datos faltantes
  {
    const r1 = mergeDatosFaltantes(['existing'], [])
    check('2.5 datos_faltantes vacío → preserva', r1.value.length === 1)
    const r2 = mergeDatosFaltantes(['existing'], ['nuevo1', 'nuevo2'])
    check('     datos_faltantes nuevos → reemplaza', r2.value.length === 2)
  }

  // 2.6 — pasoActual nunca regresa
  {
    check('2.6 mergePasoActual(2, 1) === 2 (no regresa)', mergePasoActual(2, 1) === 2)
    check('     mergePasoActual(1, 2) === 2 (avanza)', mergePasoActual(1, 2) === 2)
    check('     mergePasoActual(0, 0) === 0', mergePasoActual(0, 0) === 0)
  }

  // ════════════════════════════════════════════════════════════════════════
  // SET 2.5 — Detección de array shrinkage (Fase 2)
  // ════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('═'.repeat(72))
  console.log('SET 2.5 — Detección de array shrinkage (Fase 2)')
  console.log('═'.repeat(72))

  // 2.5.1 — proposito.fuera 8 → 1 (clásico bug Terravinci)
  {
    const incoming: PropositorPE = { ...propositoLleno, fuera: [{ item: 'SOLO_UNO', razon: 'R' }] }
    const m = mergeProposito(propositoLleno, incoming)
    check('2.5.1 fuera de 8 → 1: NO pisa, preserva los 8', m.value.fuera.length === 8)
    check('     event preserved_shrinkage emitido', m.events.some(e => e.type === 'preserved_shrinkage' && e.field === 'proposito.fuera'))
    const evt = m.events.find(e => e.type === 'preserved_shrinkage' && e.field === 'proposito.fuera') as any
    check(`     event detalle: current_size=8, incoming_size=1`, evt?.current_size === 8 && evt?.incoming_size === 1)
  }

  // 2.5.2 — situacion.desvios_secundarios 3 → 2 (shrinkage menor)
  {
    const sLleno: SituacionPE = {
      desvio_principal: 'D', desvio_cuantificado: 'X',
      desvios_secundarios: [{ descripcion: 'A', datos: '1' }, { descripcion: 'B', datos: '2' }, { descripcion: 'C', datos: '3' }],
      causa_raiz: '', consecuencia_6m: '', consecuencia_12m: '',
      recursos_actuales: '', recursos_faltantes: '', intentos_previos: '',
      resistencias: [],
    }
    const incoming: SituacionPE = {
      ...sLleno,
      desvios_secundarios: [{ descripcion: 'A', datos: '1' }, { descripcion: 'B', datos: '2' }],
    }
    const m = mergeSituacion(sLleno, incoming)
    check('2.5.2 desvios_secundarios 3 → 2: preserva los 3', m.value.desvios_secundarios.length === 3)
    check('     event preserved_shrinkage para desvios_secundarios',
      m.events.some(e => e.type === 'preserved_shrinkage' && e.field === 'situacion.desvios_secundarios'))
  }

  // 2.5.3 — Crecimiento NO es shrinkage (incoming más grande sí pisa)
  {
    const incoming: PropositorPE = {
      ...propositoLleno,
      fuera: [...propositoLleno.fuera, { item: 'X9', razon: 'R9' }],
    }
    const m = mergeProposito(propositoLleno, incoming)
    check('2.5.3 incoming.fuera 9 vs current.fuera 8: incoming gana (no es shrinkage)', m.value.fuera.length === 9)
    check('     NO emite preserved_shrinkage', !m.events.some(e => e.type === 'preserved_shrinkage'))
  }

  // 2.5.4 — Mismo tamaño NO es shrinkage; updated si distinto contenido
  {
    const incoming: PropositorPE = {
      ...propositoLleno,
      fuera: propositoLleno.fuera.map(f => ({ ...f, razon: f.razon + ' [editado]' })),
    }
    const m = mergeProposito(propositoLleno, incoming)
    check('2.5.4 mismo tamaño + contenido distinto: incoming gana', m.value.fuera[0].razon.includes('[editado]'))
    check('     evento updated emitido', m.events.some(e => e.type === 'updated' && e.field === 'proposito.fuera'))
  }

  // 2.5.5 — datos_faltantes shrinkage
  {
    const m = mergeDatosFaltantes(['a', 'b', 'c'], ['a'])
    check('2.5.5 datos_faltantes 3 → 1: preserva los 3', m.value.length === 3)
    check('     event preserved_shrinkage', m.events.some(e => e.type === 'preserved_shrinkage'))
  }

  // ════════════════════════════════════════════════════════════════════════
  // SET 3 — Integración con plan mock
  // ════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('═'.repeat(72))
  console.log('SET 3 — Integración con plan mock (sin red)')
  console.log('═'.repeat(72))

  // Plan mock que tiene propósito completo + situación parcial (caso real Terravinci pre-fix)
  const planMock = {
    nombre: 'Mock', tipo: 'Sr', area: 'Test',
    horizonte: 'Fin de 2026',
    proposito: propositoLleno,
    situacion: {
      desvio_principal: 'D previo',
      desvio_cuantificado: 'cuant previo',
      desvios_secundarios: [{ descripcion: 'D1', datos: 'X' }],
      causa_raiz: '', consecuencia_6m: '', consecuencia_12m: '',
      recursos_actuales: '', recursos_faltantes: '', intentos_previos: '',
      resistencias: [],
    } as SituacionPE,
    datos_faltantes: ['dato A', 'dato B'],
  }

  // Simular un PANEL_UPDATE parcial que SOLO tiene causa_raiz nueva (y todo vacío en lo demás)
  const parcial = `<!--PANEL_UPDATE-->
{
  "paso_actual": 2, "sub_bloque_actual": "2.C",
  "proposito": {"escena":"","metricas":[],"fuera":[],"horizonte":"","estabilidad":""},
  "situacion": {"desvio_principal":"","desvio_cuantificado":"","desvios_secundarios":[],"causa_raiz":"Causa raíz NUEVA del turno 2.C","consecuencia_6m":"","consecuencia_12m":"","recursos_actuales":"","recursos_faltantes":"","intentos_previos":"","resistencias":[]},
  "datos_faltantes": []
}
<!--/PANEL_UPDATE-->`
  const r = parsePanelUpdate(parcial)
  if (!r.ok) {
    fail++
    console.log(`  ✗ 3.x Parse falló inesperadamente: ${r.errors.join('; ')}`)
  } else {
    const propMerge = mergeProposito(planMock.proposito, r.data.proposito)
    const sitMerge = mergeSituacion(planMock.situacion, r.data.situacion)
    const datosMerge = mergeDatosFaltantes(planMock.datos_faltantes, r.data.datos_faltantes)
    check('3.1 propMerge.value.escena conservada', propMerge.value.escena === propositoLleno.escena)
    check('3.2 propMerge.value.fuera.length === 8 (NO pisado con [])', propMerge.value.fuera.length === 8)
    check('3.3 sitMerge.value.causa_raiz tomó la nueva', sitMerge.value.causa_raiz === 'Causa raíz NUEVA del turno 2.C')
    check('3.4 sitMerge.value.desvio_principal conservado', sitMerge.value.desvio_principal === 'D previo')
    check('3.5 sitMerge.value.desvios_secundarios.length === 1 (NO pisado)', sitMerge.value.desvios_secundarios.length === 1)
    check('3.6 datosMerge.value conservados (incoming vacío)', datosMerge.value.length === 2)
  }

  // ════════════════════════════════════════════════════════════════════════
  // SET 4 — Smoke test contra Anthropic real
  // ════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('═'.repeat(72))
  console.log('SET 4 — Smoke test contra Anthropic real (~$0.50)')
  console.log('═'.repeat(72))
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  ⚠ ANTHROPIC_API_KEY no seteado — saltando set 4')
    summary()
    return
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const sys = buildSystemPrompt(planMock, null)
  const userMsg = 'Confirmo. Ya estamos en sub-bloque 2.A, dame la pregunta sobre el desvío principal.'
  console.log(`User: "${userMsg}"`)
  console.log('Llamando a claude-opus-4-7...')

  const start = Date.now()
  const resp = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2500,
    system: sys,
    messages: [{ role: 'user', content: userMsg }],
  })
  const latency = Date.now() - start
  console.log(`✔ Respuesta recibida en ${(latency / 1000).toFixed(1)}s — input=${resp.usage.input_tokens} output=${resp.usage.output_tokens}`)

  const fullText = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  const parseRes = parsePanelUpdate(fullText)
  check('4.1 Parser acepta el PANEL_UPDATE del modelo (con sistema prompt endurecido)', parseRes.ok,
    parseRes.ok ? '' : `${parseRes.reason}: ${parseRes.errors.slice(0, 2).join('; ')}`)

  if (parseRes.ok) {
    const d = parseRes.data
    check('4.2 paso_actual es número', typeof d.paso_actual === 'number')
    check('4.3 proposito.fuera tiene los 8 items del mock (modelo respetó "estado completo acumulado")',
      d.proposito.fuera.length === 8,
      `got ${d.proposito.fuera.length}`)
    check('4.4 proposito.metricas tiene al menos 1', d.proposito.metricas.length >= 1)
  }

  // Guardar respuesta para auditoría
  fs.writeFileSync(
    path.join(ROOT, 'output', '18-test-panel-update.json'),
    JSON.stringify({
      ran_at: new Date().toISOString(),
      input_tokens: resp.usage.input_tokens,
      output_tokens: resp.usage.output_tokens,
      latency_ms: latency,
      full_response: fullText,
      parse_result: parseRes,
    }, null, 2)
  )

  summary()
}

function summary() {
  console.log()
  console.log('═'.repeat(72))
  console.log(`RESULTADO: ${pass} passed, ${fail} failed`)
  console.log('═'.repeat(72))
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })

export {}
