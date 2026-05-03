// Apply splitteado de decisiones del usuario sobre el reporte del reviewer.
//
// SPLIT (decisión cerrada P7):
//   - Errors aprobados / aprobado_con_cambios → sustitución determinística por
//     código. NO llama a Opus. Para cada error aprobado, busca su
//     `que_dice_resumen` (cita textual del resumen) en los string fields del
//     plan, y lo reemplaza por el `cambio_propuesto` (o `texto_editado` si el
//     usuario editó el texto antes de aprobar).
//   - Cross-block changes → NO-OP en Fase 4 (validador enforza que están vacíos
//     en Bloque 1, único auditable hoy). Para Bloque 2+, se registran en las
//     decisiones para tracking pero no se aplican automáticamente — un futuro
//     incremento puede modificar el snapshot del bloque previo.
//   - Questions respondidas → SÍ pasan por Opus para integración semántica.
//     La llamada a Opus la hace el endpoint /apply (no este módulo), pero la
//     selección de qué preguntas integrar la hace `splitDecisiones()` abajo.
//
// Funciones:
//   - splitDecisiones(decisiones, report): reparte decisiones en buckets.
//   - applyErrorsDeterministicamente(plan, errores aprobados, decisiones):
//     devuelve plan modificado + lista de fields actualizados + warnings.

import type {
  PlanEstrategico,
  PropositorPE,
  SituacionPE,
  ReviewerReport,
  ReviewerError,
  ReviewerQuestion,
  ReviewerCrossBlock,
  DecisionUsuario,
} from './types'

// ─── Buckets de decisiones ────────────────────────────────────────────────────

export interface DecisionesSplit {
  errorsAprobados: Array<{ error: ReviewerError; decision: DecisionUsuario }>
  questionsRespondidas: Array<{ question: ReviewerQuestion; decision: DecisionUsuario }>
  crossBlockAprobados: Array<{ cbc: ReviewerCrossBlock; decision: DecisionUsuario }>
  ignorados: number   // total de decisiones con estado ignorado o sin decision
}

export function splitDecisiones(decisiones: DecisionUsuario[], report: ReviewerReport): DecisionesSplit {
  const split: DecisionesSplit = {
    errorsAprobados: [],
    questionsRespondidas: [],
    crossBlockAprobados: [],
    ignorados: 0,
  }
  const decByHallazgo = new Map(decisiones.map(d => [d.hallazgo_id, d]))

  for (const error of report.errors) {
    const d = decByHallazgo.get(error.id)
    if (!d) { split.ignorados++; continue }
    if (d.decision === 'aprobado' || d.decision === 'aprobado_con_cambios') {
      split.errorsAprobados.push({ error, decision: d })
    } else {
      split.ignorados++
    }
  }
  for (const q of report.questions) {
    const d = decByHallazgo.get(q.id)
    if (!d) { split.ignorados++; continue }
    if (d.decision === 'respondido' && d.respuesta_usuario && d.respuesta_usuario.trim().length > 0) {
      split.questionsRespondidas.push({ question: q, decision: d })
    } else {
      split.ignorados++
    }
  }
  for (const c of report.cross_block_changes) {
    const d = decByHallazgo.get(c.id)
    if (!d) { split.ignorados++; continue }
    if (d.decision === 'aprobado' || d.decision === 'aprobado_con_cambios') {
      split.crossBlockAprobados.push({ cbc: c, decision: d })
    } else {
      split.ignorados++
    }
  }
  return split
}

// ─── Walker hardcoded de string fields del plan ──────────────────────────────
// Lista exhaustiva de paths donde un error puede aplicar. Mantener en sync con
// PropositorPE / SituacionPE de lib/types.ts.

interface StringFieldRef {
  path: string
  get(plan: PlanEstrategico): string
  set(plan: PlanEstrategico, value: string): void
}

interface ArrayItemFieldRef {
  arrayPath: string
  get(plan: PlanEstrategico): Array<Record<string, string>> | undefined
  itemKeys: string[]   // keys del item donde puede haber texto a buscar
}

const STRING_FIELDS: StringFieldRef[] = [
  // Campos del Encuadre (también modificables por errors si el reviewer los marca)
  { path: 'nombre',                 get: p => p.nombre ?? '',                set: (p, v) => { p.nombre = v } },
  { path: 'area',                   get: p => p.area ?? '',                  set: (p, v) => { p.area = v } },
  { path: 'horizonte',              get: p => p.horizonte ?? '',             set: (p, v) => { p.horizonte = v } },
  // Propósito
  { path: 'proposito.escena',       get: p => p.proposito?.escena ?? '',     set: (p, v) => { ensureProp(p); (p.proposito as PropositorPE).escena = v } },
  { path: 'proposito.horizonte',    get: p => p.proposito?.horizonte ?? '',  set: (p, v) => { ensureProp(p); (p.proposito as PropositorPE).horizonte = v } },
  { path: 'proposito.estabilidad',  get: p => p.proposito?.estabilidad ?? '',set: (p, v) => { ensureProp(p); (p.proposito as PropositorPE).estabilidad = v } },
  // Situación
  { path: 'situacion.desvio_principal',     get: p => p.situacion?.desvio_principal ?? '',     set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).desvio_principal = v } },
  { path: 'situacion.desvio_cuantificado',  get: p => p.situacion?.desvio_cuantificado ?? '',  set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).desvio_cuantificado = v } },
  { path: 'situacion.causa_raiz',           get: p => p.situacion?.causa_raiz ?? '',           set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).causa_raiz = v } },
  { path: 'situacion.consecuencia_6m',      get: p => p.situacion?.consecuencia_6m ?? '',      set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).consecuencia_6m = v } },
  { path: 'situacion.consecuencia_12m',     get: p => p.situacion?.consecuencia_12m ?? '',     set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).consecuencia_12m = v } },
  { path: 'situacion.recursos_actuales',    get: p => p.situacion?.recursos_actuales ?? '',    set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).recursos_actuales = v } },
  { path: 'situacion.recursos_faltantes',   get: p => p.situacion?.recursos_faltantes ?? '',   set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).recursos_faltantes = v } },
  { path: 'situacion.intentos_previos',     get: p => p.situacion?.intentos_previos ?? '',     set: (p, v) => { ensureSit(p); (p.situacion as SituacionPE).intentos_previos = v } },
]

const ARRAY_FIELDS: ArrayItemFieldRef[] = [
  { arrayPath: 'proposito.metricas',           get: p => p.proposito?.metricas as any,           itemKeys: ['metrica', 'valor_objetivo', 'valor_actual'] },
  { arrayPath: 'proposito.fuera',              get: p => p.proposito?.fuera as any,              itemKeys: ['item', 'razon'] },
  { arrayPath: 'situacion.desvios_secundarios', get: p => p.situacion?.desvios_secundarios as any, itemKeys: ['descripcion', 'datos'] },
  { arrayPath: 'situacion.resistencias',       get: p => p.situacion?.resistencias as any,       itemKeys: ['actor', 'descripcion', 'mitigacion', 'tipo', 'criticidad'] },
]

function ensureProp(p: PlanEstrategico): void {
  if (!p.proposito) {
    p.proposito = { escena: '', metricas: [], fuera: [], horizonte: '', estabilidad: '' }
  }
}
function ensureSit(p: PlanEstrategico): void {
  if (!p.situacion) {
    p.situacion = {
      desvio_principal: '', desvio_cuantificado: '', desvios_secundarios: [],
      causa_raiz: '', consecuencia_6m: '', consecuencia_12m: '',
      recursos_actuales: '', recursos_faltantes: '', intentos_previos: '',
      resistencias: [],
    }
  }
}

// ─── Apply de errors ─────────────────────────────────────────────────────────

export interface ApplyResult {
  planActualizado: PlanEstrategico
  fieldsModificados: string[]      // paths que se modificaron
  warnings: string[]               // errors que no se pudieron localizar en el plan
  errorsAplicados: number
  errorsNoEncontrados: number
}

export function applyErrorsDeterministicamente(
  planOriginal: PlanEstrategico,
  errorsAprobados: Array<{ error: ReviewerError; decision: DecisionUsuario }>,
): ApplyResult {
  // Deep clone para no mutar el original.
  const plan: PlanEstrategico = JSON.parse(JSON.stringify(planOriginal))
  const fieldsModificados: string[] = []
  const warnings: string[] = []
  let aplicados = 0
  let noEncontrados = 0

  for (const { error, decision } of errorsAprobados) {
    const textoFinal = decision.decision === 'aprobado_con_cambios' && decision.texto_editado
      ? decision.texto_editado
      : error.cambio_propuesto

    const target = locateFieldByText(plan, error.que_dice_resumen)

    if (!target) {
      warnings.push(`Error ${error.id}: no se encontró el texto "${error.que_dice_resumen.slice(0, 80)}..." en ningún campo del plan. NO se aplicó.`)
      noEncontrados++
      continue
    }

    applyAtTarget(plan, target, error.que_dice_resumen, textoFinal)
    fieldsModificados.push(target.kind === 'string' ? target.path : `${target.arrayPath}[${target.index}].${target.itemKey}`)
    aplicados++
  }

  return {
    planActualizado: plan,
    fieldsModificados,
    warnings,
    errorsAplicados: aplicados,
    errorsNoEncontrados: noEncontrados,
  }
}

// ─── Localizador del campo que contiene el texto ────────────────────────────

type LocatedTarget =
  | { kind: 'string'; path: string }
  | { kind: 'array'; arrayPath: string; index: number; itemKey: string }

function locateFieldByText(plan: PlanEstrategico, needle: string): LocatedTarget | null {
  // Strategy: 1) substring exact match. Si encuentra, gana el match más largo
  // (evita ambigüedad cuando el texto aparece en múltiples campos cortos).
  const matches: Array<{ target: LocatedTarget; valueLen: number }> = []

  // Strings directos
  for (const f of STRING_FIELDS) {
    const v = f.get(plan)
    if (v && v.includes(needle)) {
      matches.push({ target: { kind: 'string', path: f.path }, valueLen: v.length })
    }
  }
  // Arrays
  for (const af of ARRAY_FIELDS) {
    const arr = af.get(plan)
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i]
      if (!item || typeof item !== 'object') continue
      for (const key of af.itemKeys) {
        const v = item[key as string]
        if (typeof v === 'string' && v.includes(needle)) {
          matches.push({ target: { kind: 'array', arrayPath: af.arrayPath, index: i, itemKey: key }, valueLen: v.length })
        }
      }
    }
  }

  if (matches.length === 0) return null
  // Si hay múltiples matches, elegir el campo con valor más largo (probablemente
  // es la cita más específica vs un fragmento que aparece accidentalmente en otro lado).
  matches.sort((a, b) => b.valueLen - a.valueLen)
  return matches[0].target
}

// ─── Diff helper para Pantalla 4 ─────────────────────────────────────────────

/**
 * Compara el snapshot pre-apply contra el plan actual y devuelve los paths de
 * campos que cambiaron. Usado por Pantalla 4 para marcar visualmente los campos
 * modificados.
 *
 * Granularidad: paths a nivel de campo string o array completo. Si CUALQUIER
 * item de un array cambió (agregado/removido/editado), todo el array se marca.
 */
export function computeFieldsModificados(
  snapshot: { proposito?: PropositorPE; situacion?: SituacionPE; datos_faltantes: string[] },
  current: PlanEstrategico,
): Set<string> {
  const modificados = new Set<string>()

  // Strings simples del propósito.
  for (const f of ['escena', 'horizonte', 'estabilidad'] as const) {
    if ((snapshot.proposito?.[f] ?? '') !== (current.proposito?.[f] ?? '')) {
      modificados.add(`proposito.${f}`)
    }
  }
  // Arrays del propósito.
  if (JSON.stringify(snapshot.proposito?.metricas ?? []) !== JSON.stringify(current.proposito?.metricas ?? [])) {
    modificados.add('proposito.metricas')
  }
  if (JSON.stringify(snapshot.proposito?.fuera ?? []) !== JSON.stringify(current.proposito?.fuera ?? [])) {
    modificados.add('proposito.fuera')
  }

  // Strings simples de situación.
  const sitStrings = [
    'desvio_principal', 'desvio_cuantificado', 'causa_raiz',
    'consecuencia_6m', 'consecuencia_12m',
    'recursos_actuales', 'recursos_faltantes', 'intentos_previos',
  ] as const
  for (const f of sitStrings) {
    if ((snapshot.situacion?.[f] ?? '') !== (current.situacion?.[f] ?? '')) {
      modificados.add(`situacion.${f}`)
    }
  }
  // Arrays de situación.
  if (JSON.stringify(snapshot.situacion?.desvios_secundarios ?? []) !== JSON.stringify(current.situacion?.desvios_secundarios ?? [])) {
    modificados.add('situacion.desvios_secundarios')
  }
  if (JSON.stringify(snapshot.situacion?.resistencias ?? []) !== JSON.stringify(current.situacion?.resistencias ?? [])) {
    modificados.add('situacion.resistencias')
  }

  // datos_faltantes.
  if (JSON.stringify(snapshot.datos_faltantes ?? []) !== JSON.stringify(current.datos_faltantes ?? [])) {
    modificados.add('datos_faltantes')
  }

  return modificados
}

function applyAtTarget(plan: PlanEstrategico, target: LocatedTarget, oldText: string, newText: string): void {
  if (target.kind === 'string') {
    const f = STRING_FIELDS.find(x => x.path === target.path)
    if (!f) return
    const current = f.get(plan)
    f.set(plan, current.split(oldText).join(newText))
    return
  }
  // array
  const af = ARRAY_FIELDS.find(x => x.arrayPath === target.arrayPath)
  if (!af) return
  const arr = af.get(plan)
  if (!arr || !arr[target.index]) return
  const item = arr[target.index] as any
  const current = item[target.itemKey]
  if (typeof current === 'string') {
    item[target.itemKey] = current.split(oldText).join(newText)
  }
}
