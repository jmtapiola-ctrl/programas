// CPM (Critical Path Method) scheduling para movs del plan estratégico.
//
// Inputs por mov:
//   - duracion_meses_ejecucion: cuánto dura el trabajo activo del mov.
//   - dueno_es_vacante + dueno_semanas_cobertura: lead time antes de poder
//     arrancar el mov (si el dueño todavía no está). Heurística legacy: si el
//     string del dueño contiene "vacanc"/"vacante" y no hay flag, asumir 8 sem.
//   - precondiciones con tipos (+ opcional lag en meses por edge):
//       'fs' (Finish-to-Start): B.arranca >= A.termina + lag. Estricto.
//       'ff' (Finish-to-Finish): B.termina >= A.termina + lag. B puede arrancar
//             en paralelo; solo se queda "abierto" esperando que A cierre si su
//             duración natural no alcanza.
//       'continuo' (trailing): B.arranca >= A.arranca + lag AND B.termina >=
//             A.termina + lag. Captura relaciones "paralelo desfasado" donde
//             A va transfiriendo entregables a B continuamente.
//       'sugerida': sin constraint de scheduling (señal lógica solamente).
//       Lag por edge en `m.precondiciones_lag_meses[precId]`. Default 0.
//
// Output por mov:
//   - arranca, termina (Date objects + YYYY-MM strings).
//   - fase del arranque (Q1/Q2/Q3/Q4 + año). Phases se extienden dinámicamente.
//
// Algoritmo:
//   1. Filtrar movs con duracion >= 1 (los sin duración quedan fuera).
//   2. Topological sort siguiendo deps FS y FF. Defensive: detectar ciclos.
//   3. Para cada mov en orden:
//      arranca = max(today, vacancia_completion_date, max(A.termina) para FS)
//      termina = max(arranca + dur, max(A.termina) para FF)
//   4. Fase = quarter del arranca (Q1-Q4 + año).

import type { MovimientoPE } from './types'
import { normalizeDepTipoEdge } from './types'

export interface ScheduleResult {
  movId: string
  arranca: Date
  // arranca "natural" sin override: max(today, vacancia, max(FS precondición termina)).
  // Si arranca === arrancaNatural, el mov está en su posición CPM por defecto.
  // Si arranca !== arrancaNatural, el user lo postergó manualmente con override.
  arrancaNatural: Date
  // True si el mov tiene un arranca_override válido aplicado (postergado por user).
  tieneOverride: boolean
  // True si el mov tenía un arranca_override pero se descartó por ser anterior
  // al piso natural (no se puede adelantar — viola constraints CPM).
  overrideDescartado: boolean
  // Fin del TRABAJO ACTIVO = arranca + duracion_meses_ejecucion. Es lo que la
  // barra Gantt muestra. Si no hay FF que extienda el cierre formal, equivale
  // a `termina`.
  trabajoTermina: Date
  // Cierre FORMAL del mov: puede ser posterior a trabajoTermina si una
  // precondición FF cierra después (el mov queda "abierto" esperando). Se usa
  // para determinar las phases que el mov toca (extensión dinámica de columnas).
  termina: Date
  arrancaYM: string
  terminaYM: string
  // Fase del arranque del mov. Formato: `Q{quarter}-{year}`. Ej: "Q2-2026",
  // "Q1-2027". El sistema extiende las fases tantos quarters como haga falta
  // hasta cubrir el termina del mov más tardío. NO existe 'fuera-horizonte':
  // todo mov con duración cargada cae en alguna fase.
  faseKey: string
  faseQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  faseYear: number
  durMeses: number
  // Indica que el mov fue empujado por una vacancia (no por deps), para mostrar
  // razonamiento en UI.
  empujadoPorVacancia: boolean
  // Indica que el mov fue empujado por una precondición FS o FF, para mostrar
  // qué mov es el cuello de botella (id del que más empuja).
  empujadoPorDuraId: string | null
}

const MS_PER_DAY = 86400000

// Suma N meses calendario a una fecha. No usa setMonth directo porque queremos
// preservar el día del mes (con clamp si el mes destino no tiene ese día).
function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime())
  const targetMonth = out.getMonth() + months
  out.setMonth(targetMonth)
  return out
}

function toYM(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

// Detección de vacancia: flag explícito O heurística legacy sobre el string.
const DEFAULT_VACANCIA_SEMANAS = 8
function detectarVacancia(m: MovimientoPE): { esVacante: boolean; semanas: number } {
  if (m.dueno_es_vacante === true) {
    return {
      esVacante: true,
      semanas: m.dueno_semanas_cobertura && m.dueno_semanas_cobertura > 0
        ? m.dueno_semanas_cobertura
        : DEFAULT_VACANCIA_SEMANAS,
    }
  }
  const d = (m.dueno ?? '').toLowerCase()
  if (/vacanc|vacante/.test(d)) {
    return { esVacante: true, semanas: DEFAULT_VACANCIA_SEMANAS }
  }
  return { esVacante: false, semanas: 0 }
}

// Calendar-quarter mapping: Q1=ene-mar, Q2=abr-jun, Q3=jul-sep, Q4=oct-dic.
// Para 2026, Q2 funcionalmente es may-jun porque el plan arranca en mayo (no
// hay movs anteriores). Para 2027+ usa estándar. La diferencia es display-only
// (ver buildFaseDisplayLabel abajo).
export function faseDeFecha(d: Date): {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  year: number
  key: string
} {
  const mes = d.getMonth() + 1  // 1-12
  const year = d.getFullYear()
  const quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' =
    mes <= 3 ? 'Q1' : mes <= 6 ? 'Q2' : mes <= 9 ? 'Q3' : 'Q4'
  return { quarter, year, key: `${quarter}-${year}` }
}

// Display label de una fase. Para 2026 mantiene el labeling original (may-jun,
// etc), para 2027+ usa el estándar calendar.
export function buildFaseDisplayLabel(faseKey: string): string {
  const m = faseKey.match(/^Q([1-4])-(\d{4})$/)
  if (!m) return faseKey
  const q = m[1]
  const year = m[2]
  const labels2026: Record<string, string> = {
    Q2: 'Arranque (Q2 · may-jun 2026)',
    Q3: 'Aceleración (Q3 · jul-sep 2026)',
    Q4: 'Consolidación (Q4 · oct-dic 2026)',
  }
  if (year === '2026' && labels2026[`Q${q}`]) return labels2026[`Q${q}`]
  const meses: Record<string, string> = {
    Q1: 'ene-mar', Q2: 'abr-jun', Q3: 'jul-sep', Q4: 'oct-dic',
  }
  return `Q${q} · ${meses[`Q${q}`]} ${year}`
}

// Sort key numérica para ordenar faseKeys cronológicamente.
export function faseKeySort(key: string): number {
  const m = key.match(/^Q([1-4])-(\d{4})$/)
  if (!m) return Number.MAX_SAFE_INTEGER
  return parseInt(m[2], 10) * 4 + parseInt(m[1], 10)
}

// Primer día (00:00) de la fase. Q2-2026 → 1 abr 2026.
export function startOfPhase(faseKey: string): Date {
  const m = faseKey.match(/^Q([1-4])-(\d{4})$/)
  if (!m) return new Date()
  const q = parseInt(m[1], 10)
  const year = parseInt(m[2], 10)
  const monthStart = (q - 1) * 3  // Q1→0, Q2→3, Q3→6, Q4→9.
  return new Date(year, monthStart, 1, 0, 0, 0)
}

// Último instante de la fase. Q2-2026 → 30 jun 2026 23:59:59.
export function endOfPhase(faseKey: string): Date {
  const m = faseKey.match(/^Q([1-4])-(\d{4})$/)
  if (!m) return new Date()
  const q = parseInt(m[1], 10)
  const year = parseInt(m[2], 10)
  const monthEnd = q * 3 - 1  // Q1→2, Q2→5, Q3→8, Q4→11.
  // Día 0 del mes siguiente = último día del mes objetivo.
  return new Date(year, monthEnd + 1, 0, 23, 59, 59)
}

// Convierte una fecha a coordenada X proporcional al tiempo real dentro de
// las fases activas. Cada fase ocupa xBandWidth píxeles en el canvas. Una
// fecha en el medio de Q2-2026 (un 15 de may) cae al 50% del width de la
// lane Q2-2026. Útil para visualizar movs spanning como barras Gantt
// proporcionales en lugar de "llenar cada lane que toca".
//
// Si la fecha cae FUERA del rango de faseKeysActivos:
//   - antes del primer faseKey → x=0 (clamp izquierda).
//   - después del último       → x = faseKeysActivos.length * xBandWidth (clamp derecha).
export function dateToX(d: Date, faseKeysActivos: string[], xBandWidth: number): number {
  if (faseKeysActivos.length === 0) return 0
  const fase = faseDeFecha(d)
  const idx = faseKeysActivos.indexOf(fase.key)
  if (idx === -1) {
    // d cae fuera del rango activo. Clamp a límite más cercano.
    const minSort = faseKeySort(faseKeysActivos[0])
    const dSort = faseKeySort(fase.key)
    if (dSort < minSort) return 0
    return faseKeysActivos.length * xBandWidth
  }
  const phaseStart = startOfPhase(fase.key)
  const phaseEnd = endOfPhase(fase.key)
  const totalMs = phaseEnd.getTime() - phaseStart.getTime()
  const offsetMs = Math.max(0, Math.min(totalMs, d.getTime() - phaseStart.getTime()))
  const fraction = totalMs > 0 ? offsetMs / totalMs : 0
  return idx * xBandWidth + fraction * xBandWidth
}

// Inverso de dateToX: dado un x absoluto dentro del canvas, devuelve la fecha
// que representa, snappeada al PRIMERO DEL MES (granularidad del schedule).
// Si x cae fuera del rango, clamp a la fase más cercana (primer/último día).
export function xToDate(x: number, faseKeysActivos: string[], xBandWidth: number): Date {
  if (faseKeysActivos.length === 0 || xBandWidth <= 0) return new Date()
  const totalWidth = faseKeysActivos.length * xBandWidth
  const clampedX = Math.max(0, Math.min(totalWidth, x))
  const faseIdx = Math.min(faseKeysActivos.length - 1, Math.floor(clampedX / xBandWidth))
  const faseKey = faseKeysActivos[faseIdx]
  const phaseStart = startOfPhase(faseKey)
  const phaseEnd = endOfPhase(faseKey)
  const fraction = (clampedX - faseIdx * xBandWidth) / xBandWidth
  const rawMs = phaseStart.getTime() + fraction * (phaseEnd.getTime() - phaseStart.getTime())
  const rawDate = new Date(rawMs)
  // Snap a inicio de mes (primer día). Si la fracción supera la mitad del mes,
  // redondeamos al siguiente mes para evitar bias hacia atrás.
  const monthStartCur = new Date(rawDate.getFullYear(), rawDate.getMonth(), 1, 0, 0, 0)
  const monthStartNext = new Date(rawDate.getFullYear(), rawDate.getMonth() + 1, 1, 0, 0, 0)
  const halfPoint = (monthStartCur.getTime() + monthStartNext.getTime()) / 2
  return rawDate.getTime() < halfPoint ? monthStartCur : monthStartNext
}

// Genera la lista de faseKeys consecutivos entre dos fechas (inclusive).
// Ej: start=2026-05, end=2027-03 → ['Q2-2026','Q3-2026','Q4-2026','Q1-2027'].
export function fasesEntreFechas(start: Date, end: Date): string[] {
  const out: string[] = []
  const startFase = faseDeFecha(start)
  const endFase = faseDeFecha(end)
  const startIdx = startFase.year * 4 + (startFase.quarter === 'Q1' ? 1 : startFase.quarter === 'Q2' ? 2 : startFase.quarter === 'Q3' ? 3 : 4)
  const endIdx = endFase.year * 4 + (endFase.quarter === 'Q1' ? 1 : endFase.quarter === 'Q2' ? 2 : endFase.quarter === 'Q3' ? 3 : 4)
  for (let i = startIdx; i <= endIdx; i++) {
    const y = Math.floor((i - 1) / 4)
    const q = ((i - 1) % 4) + 1
    out.push(`Q${q}-${y}`)
  }
  return out
}

// Topological sort por deps DURA. Devuelve los movs en orden de procesamiento
// (precondiciones primero). Movs en ciclo quedan al final (best effort).
function topologicalSort(movs: MovimientoPE[]): MovimientoPE[] {
  const movById = new Map(movs.map(m => [m.id, m]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const order: MovimientoPE[] = []

  function visit(mov: MovimientoPE) {
    if (visited.has(mov.id)) return
    if (visiting.has(mov.id)) {
      // Ciclo detectado. No re-procesar.
      return
    }
    visiting.add(mov.id)
    // Visitar primero las precondiciones que afectan scheduling (FF o FS).
    // 'sugerida' no se sigue en el topo sort (no constraint).
    for (const precId of mov.precondiciones ?? []) {
      const tipo = normalizeDepTipoEdge(mov.precondiciones_tipo?.[precId])
      if (tipo === 'sugerida') continue
      const prec = movById.get(precId)
      if (!prec) continue
      visit(prec)
    }
    visiting.delete(mov.id)
    visited.add(mov.id)
    order.push(mov)
  }

  for (const m of movs) visit(m)
  return order
}

export function computeSchedule(
  movs: MovimientoPE[],
  baseDate: Date = new Date(),
): Map<string, ScheduleResult> {
  // Solo movs activos con duración definida.
  const elegibles = movs.filter(m =>
    m.estado_usuario !== 'quitado' &&
    typeof m.duracion_meses_ejecucion === 'number' &&
    m.duracion_meses_ejecucion >= 1,
  )

  const order = topologicalSort(elegibles)
  const schedule = new Map<string, ScheduleResult>()

  for (const m of order) {
    // 1. Base = today.
    let arranca = new Date(baseDate.getTime())
    let empujadoPorVacancia = false
    let empujadoPorDuraId: string | null = null

    // 2. Lead time por vacancia.
    const vac = detectarVacancia(m)
    if (vac.esVacante && vac.semanas > 0) {
      const vacEnd = new Date(baseDate.getTime() + vac.semanas * 7 * MS_PER_DAY)
      if (vacEnd > arranca) {
        arranca = vacEnd
        empujadoPorVacancia = true
      }
    }

    // 3. Precondiciones.
    //    FS+lag: B.arranca >= A.termina + lag (estricto, empuja arranca).
    //    FF+lag: B.termina >= A.termina + lag (solo extiende termina, NO empuja
    //        arranca — B puede arrancar en paralelo).
    //    continuo+lag: B.arranca >= A.arranca + lag AND B.termina >= A.termina + lag
    //        (combo SS+FF con lag simétrico, captura "trailing" continuous).
    //    sugerida: sin constraint de scheduling.
    //    `lag` por edge: m.precondiciones_lag_meses[precId] ?? 0. Clamp >= 0.
    const dur = m.duracion_meses_ejecucion as number
    let ffTerminaFloor: Date | null = null
    let ffTerminaFloorPrecId: string | null = null
    for (const precId of m.precondiciones ?? []) {
      const tipo = normalizeDepTipoEdge(m.precondiciones_tipo?.[precId])
      if (tipo === 'sugerida') continue
      const precSched = schedule.get(precId)
      if (!precSched) continue  // prec sin duración o en ciclo → ignorar
      const lag = Math.max(0, m.precondiciones_lag_meses?.[precId] ?? 0)
      if (tipo === 'fs') {
        // FS+lag: B.arranca >= A.termina + lag.
        const candidate = lag > 0 ? addMonths(precSched.termina, lag) : precSched.termina
        if (candidate > arranca) {
          arranca = candidate
          empujadoPorDuraId = precId
          empujadoPorVacancia = false
        }
      } else if (tipo === 'ff') {
        // FF+lag: trackear el max(A.termina + lag) entre todas las precs FF.
        const candidate = lag > 0 ? addMonths(precSched.termina, lag) : precSched.termina
        if (!ffTerminaFloor || candidate > ffTerminaFloor) {
          ffTerminaFloor = candidate
          ffTerminaFloorPrecId = precId
        }
      } else if (tipo === 'continuo') {
        // Continuo+lag: aplica AMBOS pisos.
        //   1. Arranca: B.arranca >= A.arranca + lag (como SS).
        //   2. Termina: B.termina >= A.termina + lag (como FF).
        const arrCandidate = lag > 0 ? addMonths(precSched.arranca, lag) : precSched.arranca
        if (arrCandidate > arranca) {
          arranca = arrCandidate
          empujadoPorDuraId = precId
          empujadoPorVacancia = false
        }
        const terCandidate = lag > 0 ? addMonths(precSched.termina, lag) : precSched.termina
        if (!ffTerminaFloor || terCandidate > ffTerminaFloor) {
          ffTerminaFloor = terCandidate
          ffTerminaFloorPrecId = precId
        }
      }
    }

    // 4. arrancaNatural = piso CPM antes de aplicar override del user.
    //    Si hay arranca_override válido (>= arrancaNatural), lo usamos.
    //    Si el override es anterior al piso, lo descartamos (no se puede
    //    adelantar — violaría constraints reales del plan).
    const arrancaNatural = arranca
    let tieneOverride = false
    let overrideDescartado = false
    if (m.arranca_override && /^\d{4}-\d{2}$/.test(m.arranca_override)) {
      const [oy, omo] = m.arranca_override.split('-').map(Number)
      const overrideDate = new Date(oy, omo - 1, 1, 0, 0, 0)
      if (overrideDate.getTime() >= arrancaNatural.getTime()) {
        arranca = overrideDate
        tieneOverride = true
      } else {
        overrideDescartado = true
      }
    }

    // 5. trabajoTermina = arranca + duración (lo que muestra la barra Gantt).
    //    termina = max(trabajoTermina, max(A.termina) para FFs). Si una FF
    //    tiene una termina posterior, el mov sigue "abierto" formalmente
    //    esperando que la precondición cierre, pero el trabajo activo ya cerró.
    const trabajoTermina = addMonths(arranca, dur)
    let termina = trabajoTermina
    if (ffTerminaFloor && ffTerminaFloor > termina) {
      termina = ffTerminaFloor
      // Si la FF efectivamente extiende el cierre formal, atribuímos el empuje
      // a ese prec (cuello de botella visible para el user). Sobrescribe
      // attribution de FS si hubiera, porque FF binds el cierre.
      empujadoPorDuraId = ffTerminaFloorPrecId
      empujadoPorVacancia = false
    }
    const fase = faseDeFecha(arranca)

    schedule.set(m.id, {
      movId: m.id,
      arranca,
      arrancaNatural,
      tieneOverride,
      overrideDescartado,
      trabajoTermina,
      termina,
      arrancaYM: toYM(arranca),
      terminaYM: toYM(termina),
      faseKey: fase.key,
      faseQuarter: fase.quarter,
      faseYear: fase.year,
      durMeses: dur,
      empujadoPorVacancia,
      empujadoPorDuraId,
    })
  }

  return schedule
}

// Helper: lista de movs sin duración (necesitan completar el campo).
export function movsSinDuracion(movs: MovimientoPE[]): MovimientoPE[] {
  return movs.filter(m =>
    m.estado_usuario !== 'quitado' &&
    (typeof m.duracion_meses_ejecucion !== 'number' || m.duracion_meses_ejecucion < 1),
  )
}

// Helper: las fases (faseKeys) que el span (arranca→trabajoTermina) cubre,
// para spanning visual. Usa `trabajoTermina` y NO `termina` — la barra Gantt
// representa el trabajo activo; el cierre formal extendido por FF se ve via
// el edge a la precondición, no inflando la barra ni las phases.
// Multi-year aware: cruza años naturalmente.
// Ej: arranca=2026-05 trabajoTermina=2027-03 → ['Q2-2026','Q3-2026','Q4-2026','Q1-2027'].
export function fasesDelSchedule(s: ScheduleResult): string[] {
  return fasesEntreFechas(s.arranca, s.trabajoTermina)
}
