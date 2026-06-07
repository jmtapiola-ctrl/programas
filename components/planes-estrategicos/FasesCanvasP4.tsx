'use client'

// FasesCanvasP4 — panel especializado para la pregunta P-4 del 3.B con
// modo_interaccion='secuenciacion'.
//
// Layout: card compacto en el sidebar derecho + modal fullscreen al clickear
// "Abrir editor". El modal usa el mismo ModalShell pattern del 3.A.6 para
// dar ancho real al canvas DAG.
//
// Flow:
//   1. Al montar el panel, dispara llamada a Opus en background para sugerir
//      fases. Loading state en el card mientras espera.
//   2. Cuando recibe respuesta, pre-popula `fases` con la sugerencia.
//   3. Card muestra balance Q2/Q3/Q4 + warnings de coherencia + botón.
//   4. Click "Abrir editor" → modal fullscreen con canvas DAG (Y=fases).
//   5. User drage entre fases, modal se cierra al click "Cerrar" (state
//      mantiene cambios in-progress).
//   6. Confirm definitivo vive en el FOOTER del PanelInventarioInteractivo
//      (estándar para todos los modos). No tiene Confirm propio el modal.

import { BTN_CTA_SM } from '@/components/ui/button-styles'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MovimientoPE, PalancaQAPE, EstresQAPE, InventarioPE } from '@/lib/types'
import { normalizeDepTipoEdge } from '@/lib/types'
import { computeDuenosSignature } from '@/lib/dueno-signature'
import { computeSchedule, movsSinDuracion, fasesDelSchedule, buildFaseDisplayLabel, faseKeySort, dateToX, xToDate, type ScheduleResult } from '@/lib/computeSchedule'
import { UnificarDuenosModal } from './UnificarDuenosModal'
import {
  DAGSecuenciacion,
  computeBandLayout,
  INTRA_GAP_X,
  type BandConfig,
} from './DAGSecuenciacion'

// Phases (faseKey format: "Q2-2026", "Q1-2027"...) son DINÁMICOS — se derivan
// del schedule en runtime. La cantidad de phases se extiende según el termina
// más tardío de algún mov. Display labels via buildFaseDisplayLabel.

const NODE_W_LOCAL = 240
const NODE_H_LOCAL = 76

// ─── Helpers de warnings de coherencia ───────────────────────────────────────

const ORDEN_FASES: Record<string, number> = { Q2: 0, Q3: 1, Q4: 2 }

// Fin de fase como Date (asumiendo año del `today`). Q2 termina 30/06, Q3
// 30/09, Q4 31/12. Devuelve null si la fase no es Q2/Q3/Q4.
function endOfPhase(fase: string, today: Date): Date | null {
  const y = today.getFullYear()
  if (fase === 'Q2') return new Date(y, 5, 30, 23, 59, 59)
  if (fase === 'Q3') return new Date(y, 8, 30, 23, 59, 59)
  if (fase === 'Q4') return new Date(y, 11, 31, 23, 59, 59)
  return null
}

// Computa las razones de warning para un mov en una fase asignada. Devuelve
// array de strings (vacío si no hay warnings).
//   1) Depende de una precondición DURA que está en una fase posterior.
//   2) El dueño es vacante con N sem de cobertura que NO cierra dentro de la
//      fase asignada (today + N sem > end-of-fase).
function computeWarningReasons(
  m: MovimientoPE,
  faseDeMov: Map<string, string>,
  today: Date,
): string[] {
  const miFase = faseDeMov.get(m.id)
  if (!miFase) return []
  const miOrden = ORDEN_FASES[miFase] ?? 99
  const reasons: string[] = []

  // Razón 1: precondición FF/FS/continuo en fase posterior (constraint violado).
  for (const precId of m.precondiciones ?? []) {
    const tipo = normalizeDepTipoEdge(m.precondiciones_tipo?.[precId])
    if (tipo !== 'ff' && tipo !== 'fs' && tipo !== 'continuo') continue
    const precFase = faseDeMov.get(precId)
    if (!precFase) continue
    const precOrden = ORDEN_FASES[precFase] ?? 99
    if (precOrden > miOrden) {
      reasons.push(`Depende de ${precId} (${tipo.toUpperCase()}) que está en ${precFase} — debería estar listo antes de ${miFase}.`)
      break
    }
  }

  // Razón 2: vacancia que no entra en la fase asignada.
  const esVac = m.dueno_es_vacante === true ||
    /vacanc|vacante/.test((m.dueno ?? '').toLowerCase())
  if (esVac) {
    const semanas = m.dueno_semanas_cobertura ?? 8
    const earliestStart = new Date(today.getTime() + semanas * 7 * 86400000)
    const endFase = endOfPhase(miFase, today)
    if (endFase && earliestStart > endFase) {
      const fechaStr = earliestStart.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
      reasons.push(`Vacante de ${semanas} sem → arranca recién ${fechaStr}, no entra en ${miFase}.`)
    }
  }

  return reasons
}
// 24px: mismo valor que el INTRA_GAP_Y interno de DAGSecuenciacion. Deja
// espacio para los badges (⚠️/🔥/✓) del nodo de abajo sin que se peguen al
// cuerpo del nodo de arriba.
const INTRA_GAP_Y = 24

// ─── Helpers ───────────────────────────────────────────────────────────────
// Los helpers de span (computeSpan/SpanInfo/faseToFirstMonth/shiftYM) se
// removieron. Ahora todo el scheduling viene de lib/computeSchedule via
// computeSchedule() + fasesDelSchedule(). El user carga `duracion_meses_ejecucion`
// en 3.A y el sistema computa arranca/termina en P-4 vía CPM.
const PADDING_Y = 12
// 2 movs por fila: cada lane vertical mide 2 × NODE_W + gap + padding lateral.
// 30px de padding por lado deja 60px de espacio total entre nodos de bandas
// adyacentes — suficiente para que el chip de tipo (BLANDA/DURA) entre cerca
// del target sin pisar el nodo de la banda previa.
const NODOS_POR_FILA_P4 = 2
const PADDING_X_BAND = 30
const XBAND_WIDTH_P4 =
  NODOS_POR_FILA_P4 * NODE_W_LOCAL + (NODOS_POR_FILA_P4 - 1) * INTRA_GAP_X + 2 * PADDING_X_BAND

interface Sugerencia {
  fase: string
  razonamiento: string
}

interface Props {
  movimientos: MovimientoPE[]
  fases: Array<{ fase: string; movimientos: string[] }>
  onChange: (fases: Array<{ fase: string; movimientos: string[] }>) => void
  planId: string
  pregunta: PalancaQAPE | EstresQAPE
  // Firma persistida del set de dueños al momento del último review del modal
  // UnificarDuenos. Si la firma actual del inventario coincide, skipeamos el
  // modal y abrimos el canvas directo.
  duenosRevisadosSignature?: string
  // Callback con el inventario actualizado tras un side-effect del modal (ej:
  // unificación de dueños). El parent hace setPlan con el nuevo inventario.
  onInventarioUpdate?: (inv: InventarioPE) => void
  // Trigger del MovimientoFormModal en modo editar para el mov clickeado.
  // El parent (entrevista/page.tsx) ya maneja el modal — solo le pasamos
  // el movId. Permite editar dueño/vacancia/ventana_temporal/etc directo
  // desde el canvas sin volver a 3.A.6.
  onVerDetalleMov?: (movId: string) => void
}

export function FasesCanvasP4({ movimientos, fases, onChange, planId, pregunta, duenosRevisadosSignature, onInventarioUpdate, onVerDetalleMov }: Props) {
  // Sugerencias cacheadas: si la pregunta ya tiene sugerencias_ai persistidas.
  const sugerenciasPersistidas: { [movId: string]: string } | undefined =
    pregunta.respuesta_estructurada?.modo === 'secuenciacion'
      ? pregunta.respuesta_estructurada.sugerencias_ai
      : undefined
  const razonamientosPersistidos: { [movId: string]: string } | undefined =
    pregunta.respuesta_estructurada?.modo === 'secuenciacion'
      ? pregunta.respuesta_estructurada.razonamientos_ai
      : undefined

  const [sugerencias, setSugerencias] = useState<{ [movId: string]: Sugerencia }>(() => {
    if (sugerenciasPersistidas) {
      const out: { [movId: string]: Sugerencia } = {}
      for (const [movId, fase] of Object.entries(sugerenciasPersistidas)) {
        out[movId] = { fase, razonamiento: razonamientosPersistidos?.[movId] ?? '' }
      }
      return out
    }
    return {}
  })
  const [loading, setLoading] = useState(false)
  const [errorAi, setErrorAi] = useState<string | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)

  // Clustering de dueños (AI detecta variantes de la misma persona).
  // Se dispara una vez al mount, en paralelo a las sugerencias de fases. El
  // resultado se muestra en el modal de revisión que el user ve SIEMPRE antes
  // de entrar al canvas (vía botón "Revisar dueños y abrir editor").
  const [clustersDuenos, setClustersDuenos] = useState<Array<{ variantes: string[]; canonico_sugerido: string }>>([])
  const [clusteringLoading, setClusteringLoading] = useState(false)
  const [modalUnificarAbierto, setModalUnificarAbierto] = useState(false)

  const movsActivos = useMemo(
    () => movimientos.filter(m => m.estado_usuario !== 'quitado'),
    [movimientos],
  )

  // Año del plan (referencia para visualización).
  const planYear = useMemo(() => new Date().getFullYear(), [])

  // Schedule determinístico (CPM): computa arranca/termina/fase para cada mov
  // con duración cargada. Movs sin duración quedan fuera del schedule.
  const baseDate = useMemo(() => new Date(), [])
  const schedule = useMemo(
    () => computeSchedule(movsActivos, baseDate),
    [movsActivos, baseDate],
  )

  // Movs sin duración: necesitan que el user complete el campo en el form
  // antes de aparecer en el cronograma.
  const movsIncompletos = useMemo(
    () => movsSinDuracion(movsActivos),
    [movsActivos],
  )

  // faseKeysActivos: lista cronológicamente ordenada de TODOS los faseKey que
  // aparecen en el schedule. Las phases se extienden dinámicamente según el
  // termina más tardío. Si nada está scheduled, default a Q2-{año actual}.
  const faseKeysActivos = useMemo(() => {
    const keys = new Set<string>()
    for (const sched of schedule.values()) {
      // Incluye TODAS las phases que el mov spanning toca, no solo la de arranca.
      for (const k of fasesDelSchedule(sched)) keys.add(k)
    }
    if (keys.size === 0) keys.add(`Q2-${planYear}`)  // default si vacío
    return Array.from(keys).sort((a, b) => faseKeySort(a) - faseKeySort(b))
  }, [schedule, planYear])

  // fasesCoherentes: cada mov asignado a su fase de ARRANQUE. Movs sin schedule
  // (sin duración) no aparecen — quedan en el banner "incompletos".
  const fasesCoherentes = useMemo(() => {
    const nuevas: Array<{ fase: string; movimientos: string[] }> = faseKeysActivos.map(k => ({
      fase: k, movimientos: [],
    }))
    for (const [movId, sched] of schedule.entries()) {
      const target = nuevas.find(f => f.fase === sched.faseKey)
      if (target && !target.movimientos.includes(movId)) target.movimientos.push(movId)
    }
    return nuevas
  }, [schedule, faseKeysActivos])

  // Persistir el sync cuando fasesCoherentes diverge de fases prop. Esto pasa
  // típicamente después de editar duracion/vacancia/deps via ✎ form. El PATCH a
  // respuesta_estructurada queda consistente con el cronograma computado.
  useEffect(() => {
    const fasesPropMap = new Map(fases.map(f => [f.fase, new Set(f.movimientos)]))
    let difiere = false
    for (const f of fasesCoherentes) {
      const propSet = fasesPropMap.get(f.fase) ?? new Set()
      if (propSet.size !== f.movimientos.length) { difiere = true; break }
      for (const mid of f.movimientos) {
        if (!propSet.has(mid)) { difiere = true; break }
      }
      if (difiere) break
    }
    if (difiere) {
      const filtrado = fasesCoherentes.filter(f => f.movimientos.length > 0)
      onChange(filtrado)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fasesCoherentes])

  // Lookup: movId → fase actual. Usa fasesCoherentes (schedule-derived).
  const faseDeMov = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of fasesCoherentes) {
      for (const mid of f.movimientos) map.set(mid, f.fase)
    }
    return map
  }, [fasesCoherentes])

  // (movsFueraHorizonte removed: con extensión dinámica de phases, todo mov con
  // duración cae en alguna fase. Lo que antes era "fuera de horizonte 2026"
  // ahora simplemente aparece en Q1-2027 / Q2-2027 / etc.)

  // DEPRECATED: sugerencias de fase via AI ya no se disparan automáticamente.
  // El cronograma se computa determinísticamente vía computeSchedule (CPM).
  // El sugerencias/loading/errorAi state se conserva por compat con piezas
  // legacy del UI pero no se popula.

  // Clustering de dueños: corre EN PARALELO al fetch de sugerencias, una vez
  // por mount. Silent fail si la AI no responde — el banner simplemente no
  // aparece. Re-corre si el inventario cambia (ej: después de un unify, debería
  // devolver clusters: []).
  useEffect(() => {
    if (clusteringLoading) return
    let abortado = false
    setClusteringLoading(true)
    fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/clusterizar-duenos`, {
      method: 'POST',
    })
      .then(r => r.json())
      .then(data => {
        if (abortado) return
        if (data?.ok && Array.isArray(data.clusters)) {
          setClustersDuenos(data.clusters)
        } else {
          // Silent fail — no rompemos el flow de P-4 si el clustering falla.
          console.warn('[FasesCanvasP4] clustering de dueños falló:', data?.error)
          setClustersDuenos([])
        }
      })
      .catch(e => {
        if (!abortado) {
          console.warn('[FasesCanvasP4] clustering de dueños error:', e)
          setClustersDuenos([])
        }
      })
      .finally(() => {
        if (!abortado) setClusteringLoading(false)
      })
    return () => { abortado = true }
    // Re-disparamos si el inventario cambia (ej: post-unify). Usamos
    // movimientos.length + concat de dueños como cheap hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientos.map(m => m.dueno).join('|')])

  async function handleAplicarUnify(renames: Record<string, string>) {
    const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/unificar-duenos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renames }),
    })
    const data = await res.json()
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error ?? `HTTP ${res.status}`)
    }
    if (onInventarioUpdate && data.inventario_actualizado) {
      onInventarioUpdate(data.inventario_actualizado as InventarioPE)
    }
    // El clustering re-correrá en el próximo render del useEffect (movimientos
    // cambia vía onInventarioUpdate → setPlan).
    setClustersDuenos([])
  }

  // Si la firma actual del set de dueños coincide con la firma persistida del
  // último review, el user ya revisó este set — skipeamos el modal en el
  // próximo "Abrir editor". Si cambió (mov nuevo con dueño nuevo, dueño
  // editado, etc), volvemos a mostrar.
  const duenosYaRevisados = useMemo(() => {
    if (!duenosRevisadosSignature) return false
    return computeDuenosSignature(movsActivos) === duenosRevisadosSignature
  }, [movsActivos, duenosRevisadosSignature])

  // Triggered desde "Abrir editor de fases": skipea el modal si el set actual
  // ya fue revisado; sino lo muestra primero.
  function handleAbrirEditor() {
    if (duenosYaRevisados) {
      setModalAbierto(true)
    } else {
      setModalUnificarAbierto(true)
    }
  }

  // onContinuar del UnificarDuenosModal: persiste la firma actual del set de
  // dueños (para skipear el modal en futuros mounts) y abre el canvas. Fire &
  // forget — silent fail si el POST falla, no rompemos el flow.
  function handleContinuarAlEditor() {
    setModalUnificarAbierto(false)
    setModalAbierto(true)
    fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/marcar-duenos-revisados`, {
      method: 'POST',
    })
      .then(r => r.json())
      .then(data => {
        if (data?.ok && onInventarioUpdate && data.inventario_actualizado) {
          onInventarioUpdate(data.inventario_actualizado as InventarioPE)
        }
      })
      .catch(e => {
        console.warn('[FasesCanvasP4] marcar-duenos-revisados error:', e)
      })
  }

  // Balance counter dinámico: cuenta por cada faseKey activo + sin asignar
  // (que ahora = sin duración cargada).
  interface BalanceEntry { faseKey: string; label: string; count: number }
  const balance = useMemo<{ porFase: BalanceEntry[]; sinAsignar: number }>(() => {
    const porFase: BalanceEntry[] = fasesCoherentes.map(f => ({
      faseKey: f.fase,
      label: buildFaseDisplayLabel(f.fase),
      count: f.movimientos.length,
    }))
    const asignados = new Set(fasesCoherentes.flatMap(f => f.movimientos))
    const sinAsignar = movsActivos.filter(m => !asignados.has(m.id)).length
    return { porFase, sinAsignar }
  }, [fasesCoherentes, movsActivos])

  // Detección de tipos legacy ('dura'/'blanda') en el inventario. Si hay,
  // mostramos un banner para que el user dispare la migración a sugerida/ff/fs.
  // Reads ya normalizan al vuelo via normalizeDepTipoEdge, pero los strings
  // persistidos en Airtable conviene migrarlos para que futuros mantenedores
  // lean los canónicos directos.
  const tieneTiposLegacy = useMemo(() => {
    for (const m of movsActivos) {
      if (m.tipo_dependencia === ('dura' as string) || m.tipo_dependencia === ('blanda' as string)) return true
      if (m.precondiciones_tipo) {
        for (const v of Object.values(m.precondiciones_tipo)) {
          if (v === ('dura' as string) || v === ('blanda' as string)) return true
        }
      }
    }
    return false
  }, [movsActivos])
  const [migrandoLegacy, setMigrandoLegacy] = useState(false)
  const [errorMigracion, setErrorMigracion] = useState<string | null>(null)

  async function handleMigrarLegacy() {
    if (migrandoLegacy) return
    setMigrandoLegacy(true)
    setErrorMigracion(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/migrar-deps`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      if (onInventarioUpdate && data.inventario_actualizado) {
        onInventarioUpdate(data.inventario_actualizado as InventarioPE)
      }
    } catch (e: any) {
      setErrorMigracion(e?.message ?? 'Error al migrar tipos legacy')
    } finally {
      setMigrandoLegacy(false)
    }
  }

  // Warnings de coherencia: FF/FS en fase posterior + vacancia que no cierra
  // dentro de la fase asignada. Usa helper compartido con el modal canvas.
  const warningsCount = useMemo(() => {
    const today = new Date()
    let count = 0
    for (const m of movsActivos) {
      const reasons = computeWarningReasons(m, faseDeMov, today)
      if (reasons.length > 0) count++
    }
    return count
  }, [movsActivos, faseDeMov])

  // ─── Render del card del panel ──────────────────────────────────────────
  return (
    <>
      <div className="space-y-3 p-3">
        <div className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-3">
          <div>
            <p className="text-[12px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1">
              Balance de fases (calculado)
            </p>
            <div className="flex items-center gap-3 text-[13px] flex-wrap">
              {balance.porFase.map(b => {
                // Color por quarter pattern: Q2 emerald, Q3 amber, Q4 blue, Q1 violet.
                const q = b.faseKey.slice(0, 2)
                const colorClass = q === 'Q1' ? 'text-violet-300'
                  : q === 'Q2' ? 'text-emerald-300'
                  : q === 'Q3' ? 'text-amber-300'
                  : 'text-blue-300'
                return (
                  <span key={b.faseKey} className={colorClass}>
                    <strong className="font-semibold">{b.count}</strong> {b.faseKey}
                  </span>
                )
              })}
              {balance.sinAsignar > 0 && (
                <span className="text-red-300">
                  <strong className="font-semibold">{balance.sinAsignar}</strong> sin duración
                </span>
              )}
            </div>
          </div>
          {tieneTiposLegacy && (
            <div className="rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-100 space-y-2">
              <p>
                ⚠ Tipos de dependencia legacy detectados (<code className="text-[11px]">'dura'</code>/<code className="text-[11px]">'blanda'</code>).
              </p>
              <p className="text-amber-200/85">
                Migramos al nuevo trio <strong>Sugerida / FF / FS</strong>. Click para reescribir los strings persistidos en Airtable. La lectura ya los normaliza al vuelo — esto es defensivo.
              </p>
              {errorMigracion && (
                <p className="text-red-300">⚠ {errorMigracion}</p>
              )}
              <button
                type="button"
                onClick={handleMigrarLegacy}
                disabled={migrandoLegacy}
                className="rounded-md border border-amber-500/60 bg-amber-900/40 px-2.5 py-1 text-[12px] font-semibold text-amber-100 hover:bg-amber-800/60 disabled:opacity-50"
              >
                {migrandoLegacy ? 'Migrando…' : 'Migrar tipos a Sugerida/FF/FS'}
              </button>
            </div>
          )}
          {movsIncompletos.length > 0 && (
            <div className="rounded-md border border-yellow-700/60 bg-yellow-950/30 px-3 py-2 text-[12px] text-yellow-100 space-y-1">
              <p>
                ⚠️ <strong>{movsIncompletos.length}</strong> {movsIncompletos.length === 1 ? 'movimiento' : 'movimientos'} sin duración cargada.
              </p>
              <p className="text-yellow-200/85">
                Completá la duración (en meses) de cada mov para que aparezcan en el cronograma. Andá a 3.A o editalos desde el DAG.
              </p>
            </div>
          )}
          {warningsCount > 0 && (
            <div className="rounded-md border border-orange-700/50 bg-orange-950/30 px-3 py-2 text-[12px] text-orange-200">
              ⚠️ {warningsCount} {warningsCount === 1 ? 'inconsistencia detectada' : 'inconsistencias detectadas'}. Abrí el editor para ver los detalles.
            </div>
          )}
          {clustersDuenos.length > 0 && !duenosYaRevisados && (
            <div className="rounded-md border border-yellow-700/50 bg-yellow-950/20 px-3 py-2 text-[12px] text-yellow-200">
              ⚠️ La AI detectó <strong>{clustersDuenos.length}</strong> {clustersDuenos.length === 1 ? 'grupo' : 'grupos'} de dueños posiblemente duplicados. Vas a poder revisarlos antes de entrar al editor.
            </div>
          )}
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            El cronograma se calcula automáticamente usando la duración de cada mov, las dependencias DURA y las vacancias. Para ajustar, editá los movs desde el canvas o desde 3.A.
          </p>
          <button
            onClick={handleAbrirEditor}
            className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-md hover:bg-amber-500 transition-colors"
          >
            {duenosYaRevisados ? '🗓️ Abrir editor →' : '🧠 Revisar dueños y abrir editor →'}
          </button>
        </div>
      </div>

      {/* Modal fullscreen al estilo 3.A.6 */}
      {modalAbierto && (
        <FasesModal
          movimientos={movsActivos}
          fases={fasesCoherentes}
          onChange={onChange}
          warningsCount={warningsCount}
          onCerrar={() => setModalAbierto(false)}
          onVerDetalleMov={onVerDetalleMov}
          schedule={schedule}
          faseKeysActivos={faseKeysActivos}
          balancePorFase={balance.porFase.map(b => ({ faseKey: b.faseKey, count: b.count }))}
          balanceSinAsignar={balance.sinAsignar}
          planId={planId}
          onInventarioUpdate={onInventarioUpdate}
        />
      )}

      {/* Modal de revisión/unificación de dueños — se muestra SIEMPRE antes
          de abrir el canvas (incluso si AI no detectó clusters, para que el
          user pueda agrupar manualmente variantes que se le escaparon a la AI). */}
      {modalUnificarAbierto && (
        <UnificarDuenosModal
          clusters={clustersDuenos}
          movimientos={movimientos}
          onAplicar={handleAplicarUnify}
          onContinuar={handleContinuarAlEditor}
          onCerrar={() => setModalUnificarAbierto(false)}
        />
      )}
    </>
  )
}

// ─── Modal fullscreen con el canvas DAG (Y = fases) ──────────────────────────

interface ModalProps {
  movimientos: MovimientoPE[]
  fases: Array<{ fase: string; movimientos: string[] }>
  onChange: (fases: Array<{ fase: string; movimientos: string[] }>) => void
  warningsCount: number
  onCerrar: () => void
  onVerDetalleMov?: (movId: string) => void
  // Schedule computado por CPM: arranca/termina/fase por mov con duración.
  // Movs sin duración no aparecen en el schedule (ni en el canvas).
  schedule: Map<string, ScheduleResult>
  // Lista cronológica de faseKeys que el cronograma toca (Q2-2026, Q3-2026,
  // ..., extiende a Q1-2027 etc si hace falta).
  faseKeysActivos: string[]
  // Resumen de count por fase para el header del modal.
  balancePorFase: Array<{ faseKey: string; count: number }>
  balanceSinAsignar: number
  // planId para PATCH del override de arranca al inventario.
  planId: string
  // Callback con el inventario actualizado post-PATCH.
  onInventarioUpdate?: (inv: InventarioPE) => void
}

function FasesModal(props: ModalProps) {
  if (typeof document === 'undefined') return null
  return createPortal(<FasesModalContenido {...props} />, document.body)
}

function FasesModalContenido({
  movimientos,
  fases,
  onChange,
  warningsCount,
  onCerrar,
  onVerDetalleMov,
  schedule,
  faseKeysActivos,
  balancePorFase,
  balanceSinAsignar,
  planId,
  onInventarioUpdate,
}: ModalProps) {
  // State del modal de override de arranca (post-drag horizontal).
  // overrideEdit !== null cuando el user soltó un mov en una posición
  // diferente a su arranca natural. Sólo se aplica al PATCHear; si el user
  // cancela, el render se re-sincroniza con el inventario sin override.
  const [overrideEdit, setOverrideEdit] = useState<{
    movId: string
    movNombre: string
    arrancaNaturalYM: string
    nuevaArrancaYM: string
    razonamientoExistente: string
    invalido: boolean   // newDate < arrancaNatural — no se puede aplicar
  } | null>(null)
  const [overrideAplicando, setOverrideAplicando] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  // dragResetCounter: bump al cancelar para forzar a xyflow a re-leer
  // posiciones desde props (descarta la posición visual del drag rechazado).
  const [dragResetCounter, setDragResetCounter] = useState(0)
  // Mov seleccionado en el canvas (para el highlight de dependencias
  // — vecinos iluminados + edges resaltados). Análogo a 3.A.6.
  const [movSeleccionadoId, setMovSeleccionadoId] = useState<string | null>(null)

  // Escape cierra el modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar])

  // Año del plan para parseo de ventanas (usado en handleCambioBandaX y span).
  const planYear = useMemo(() => new Date().getFullYear(), [])

  // Lookup fase actual por mov.
  const faseDeMov = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of fases) for (const mid of f.movimientos) map.set(mid, f.fase)
    return map
  }, [fases])

  // Lookup faseKey por mov con fallback "Sin asignar" para movs sin schedule.
  const faseDeMovConDefault = useMemo(() => {
    const map = new Map(faseDeMov)
    for (const m of movimientos) if (!map.has(m.id)) map.set(m.id, 'Sin asignar')
    return map
  }, [faseDeMov, movimientos])

  // ¿Hay movs sin schedule? → lane "Sin asignar" extra al final.
  const haySinAsignar = useMemo(
    () => movimientos.some(m => !faseDeMov.has(m.id)),
    [movimientos, faseDeMov],
  )

  // xBandConfig: bandas X dinámicas según faseKeysActivos (cronológico).
  // Si hay sin-asignar, lane "Sin asignar" al final.
  const xBandConfig: BandConfig = useMemo(() => ({
    bandKeyFn: (m: MovimientoPE) => faseDeMovConDefault.get(m.id) ?? 'Sin asignar',
    bandOrden: haySinAsignar ? [...faseKeysActivos, 'Sin asignar'] : [...faseKeysActivos],
    bandLabel: (k: string) => k === 'Sin asignar' ? 'Sin asignar' : buildFaseDisplayLabel(k),
  }), [faseDeMovConDefault, haySinAsignar, faseKeysActivos])

  // Función para obtener el dueño "key" de un mov (trim + fallback "Sin dueño").
  const duenoKey = (m: MovimientoPE) => {
    const d = (m.dueno ?? '').trim()
    return d || 'Sin dueño'
  }

  // Vacancia derivada por dueño: un dueño se considera "vacante" para sort y
  // display si AL MENOS UNO de sus movs en la fase más temprana tiene
  // `dueno_es_vacante=true` o (heurística legacy) un string que contiene
  // "vacanc"/"vacante". El máximo de `dueno_semanas_cobertura` se usa para el
  // badge (worst case lead time del dueño).
  // ─── Sort de bandas Y por DUEÑO ─────────────────────────────────────────
  //
  // Criterios en orden:
  //   1. earliest phase: la fase MÁS TEMPRANA en que el dueño tiene al menos
  //      un mov asignado. Q2 < Q3 < Q4 < Sin asignar.
  //   2. es_vacante: en la MISMA fase, los dueños NO-vacantes van ARRIBA de
  //      los vacantes. Los no-vacantes pueden arrancar YA; los vacantes
  //      tienen lead time de N semanas para cubrir el puesto.
  //   3. outgoingSum desc: suma de out-degree (desbloquea.length) de los movs
  //      del dueño EN la earliest phase — el cuello de botella primero.
  //
  // Ejemplo: si A (no vacante, Q2, out=3), B (no vacante, Q2, out=6), C
  // (vacante, Q2, out=10), D (no vacante, Q3, out=7) →
  // Orden: B, A, C, D.
  const duenoStats = useMemo(() => {
    const fOrden = (f: string) => f === 'Q2' ? 0 : f === 'Q3' ? 1 : f === 'Q4' ? 2 : 99
    const stats = new Map<string, {
      earliestOrden: number
      outgoingSum: number
      esVacante: boolean
      semanasMax: number      // max semanas_cobertura entre movs vacantes del dueño en earliest phase
    }>()
    function isVacante(m: MovimientoPE): boolean {
      if (m.dueno_es_vacante === true) return true
      // Heurística legacy: string del dueño contiene "vacanc"/"vacante".
      const d = (m.dueno ?? '').toLowerCase()
      return /vacanc|vacante/.test(d)
    }
    for (const m of movimientos) {
      if (m.estado_usuario === 'quitado') continue
      const dueno = duenoKey(m)
      const fase = faseDeMovConDefault.get(m.id) ?? 'Sin asignar'
      const fNum = fOrden(fase)
      const out = (m.desbloquea ?? []).length
      const vac = isVacante(m)
      const sem = m.dueno_semanas_cobertura ?? 0
      const ex = stats.get(dueno)
      if (!ex) {
        stats.set(dueno, {
          earliestOrden: fNum,
          outgoingSum: out,
          esVacante: vac,
          semanasMax: vac ? sem : 0,
        })
      } else if (fNum < ex.earliestOrden) {
        // Nueva fase más temprana: reset stats (solo cuentan los movs en esa fase).
        stats.set(dueno, {
          earliestOrden: fNum,
          outgoingSum: out,
          esVacante: vac,
          semanasMax: vac ? sem : 0,
        })
      } else if (fNum === ex.earliestOrden) {
        ex.outgoingSum += out
        ex.esVacante = ex.esVacante || vac
        if (vac && sem > ex.semanasMax) ex.semanasMax = sem
      }
    }
    return stats
  }, [movimientos, faseDeMovConDefault])

  const duenoOrden = useMemo<string[]>(() => {
    return Array.from(duenoStats.entries())
      .sort((a, b) => {
        if (a[1].earliestOrden !== b[1].earliestOrden) return a[1].earliestOrden - b[1].earliestOrden
        // Mismo phase: non-vacante arriba (false < true cuando casteamos a number).
        if (a[1].esVacante !== b[1].esVacante) return a[1].esVacante ? 1 : -1
        return b[1].outgoingSum - a[1].outgoingSum
      })
      .map(([dueno]) => dueno)
  }, [duenoStats])

  // Span por mov derivado de schedule. Si un mov no está en schedule (sin
  // duración cargada), no aparece en el map → no se renderea en el canvas.
  const spanInfoPorMov = useMemo(() => {
    const map = new Map<string, { fases: string[]; numFases: number; durMeses: number }>()
    for (const m of movimientos) {
      if (m.estado_usuario === 'quitado') continue
      const sched = schedule.get(m.id)
      if (!sched) continue  // sin schedule → excluir del canvas
      const fases = fasesDelSchedule(sched)
      map.set(m.id, {
        fases,
        numFases: fases.length || 1,
        durMeses: sched.durMeses,
      })
    }
    return map
  }, [movimientos, schedule])

  // Total de movs por dueño (cada uno consume una fila vertical en su band:
  // V2 del layout — todos los movs son barras Gantt proporcionales, no hay
  // distinción single-fase/spanning).
  const totalMovsPorDueno = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movimientos) {
      if (m.estado_usuario === 'quitado') continue
      const dueno = duenoKey(m)
      map.set(dueno, (map.get(dueno) ?? 0) + 1)
    }
    return map
  }, [movimientos])

  // bandConfig Y: por DUEÑO. m.dueno es string libre en V1 (sin Organigrama).
  // topHeaderHeight: reserva 36px al top de cada banda para un header
  // horizontal con el nombre del dueño (mucho más legible que rotado).
  // bandOrden: orden por earliest phase + outgoing count (ver duenoOrden arriba).
  // extraFilas: como nodosPorFila se pasa 9999 (force baseRows=1), extraFilas
  //   carga el peso del row-count: total_movs - 1 = filas extra para que la
  //   banda tenga una fila por mov.
  const bandConfigPorDueno: BandConfig = useMemo(() => ({
    bandKeyFn: duenoKey,
    bandOrden: duenoOrden,
    topHeaderHeight: 36,
    extraFilas: (k: string) => Math.max(0, (totalMovsPorDueno.get(k) ?? 0) - 1),
  }), [duenoOrden, totalMovsPorDueno])

  // Posiciones sintéticas — V2 unificada (Gantt-style):
  //   X = dateToX(arranca) — posición proporcional al calendario real.
  //   width = max(NODE_W, dateToX(trabajoTermina) - dateToX(arranca)) — la
  //     ficha ES la barra. Piso NODE_W para que el contenido entre siempre.
  //   Y = baseY + rowIdx * (NODE_H + GAP) — cada mov en su propia fila dentro
  //     de su dueño. Sin grid de sub-columnas: la dimensión X la define el
  //     tiempo, no la grilla.
  //
  // Packing simple por dueño: assignacion greedy por arranca asc. Si dos movs
  // del mismo dueño NO se solapan en tiempo, comparten fila; si se solapan,
  // van en filas diferentes. Pegamos al inicio del horizonte si no hay schedule.
  const movsACanvas = useMemo(() => {
    // nodosPorFila=9999 para forzar baseRows=1; el row-count real viene de
    // extraFilas en bandConfigPorDueno.
    const layout = computeBandLayout(
      movimientos,
      bandConfigPorDueno,
      xBandConfig.bandKeyFn,
      9999,
    )

    // Packing por dueño: cada fila contiene intervalos no-solapados.
    const rowIdx = new Map<string, number>()
    const movsPorDueno = new Map<string, MovimientoPE[]>()
    for (const m of movimientos) {
      if (m.estado_usuario === 'quitado') continue
      const dueno = duenoKey(m)
      const arr = movsPorDueno.get(dueno) ?? []
      arr.push(m)
      movsPorDueno.set(dueno, arr)
    }
    for (const [, arr] of movsPorDueno) {
      arr.sort((a, b) => {
        const sa = schedule.get(a.id)
        const sb = schedule.get(b.id)
        const ta = sa ? sa.arranca.getTime() : 0
        const tb = sb ? sb.arranca.getTime() : 0
        if (ta !== tb) return ta - tb
        return a.id.localeCompare(b.id)
      })
      const rows: Array<Array<{ start: number; end: number }>> = []
      for (const m of arr) {
        const sched = schedule.get(m.id)
        const start = sched ? sched.arranca.getTime() : 0
        const end = sched ? sched.trabajoTermina.getTime() : start
        let placedRow = -1
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const overlap = row.some(iv => !(iv.end <= start || end <= iv.start))
          if (!overlap) {
            row.push({ start, end })
            placedRow = i
            break
          }
        }
        if (placedRow === -1) {
          rows.push([{ start, end }])
          placedRow = rows.length - 1
        }
        rowIdx.set(m.id, placedRow)
      }
    }

    return movimientos
      .filter(m => m.estado_usuario !== 'quitado')
      .map(m => {
        const dueno = duenoKey(m)
        const band = layout.bandPorCat.get(dueno)
        const headerH = band?.topHeaderHeight ?? 0
        const baseY = (band?.yStart ?? 0) + headerH + PADDING_Y
        const sched = schedule.get(m.id)
        // X y width derivados de las fechas reales del schedule. La ficha es
        // la barra Gantt — no hay tail separado.
        const arrancaX = sched
          ? dateToX(sched.arranca, faseKeysActivos, XBAND_WIDTH_P4)
          : PADDING_X_BAND
        const trabajoTerminaX = sched
          ? dateToX(sched.trabajoTermina, faseKeysActivos, XBAND_WIDTH_P4)
          : arrancaX + NODE_W_LOCAL
        const width = Math.max(NODE_W_LOCAL, trabajoTerminaX - arrancaX)
        const row = rowIdx.get(m.id) ?? 0
        const y = baseY + row * (NODE_H_LOCAL + INTRA_GAP_Y)
        return {
          mov_id: m.id,
          x: arrancaX,
          y,
          width,
          spanInfo: spanInfoPorMov.get(m.id),
        }
      })
  }, [movimientos, xBandConfig, bandConfigPorDueno, spanInfoPorMov, schedule, faseKeysActivos])

  // Drag deshabilitado: CPM determina las fechas. handleCambioBandaX queda como
  // no-op; permitirCambioBandaX={false} en DAGSecuenciacion previene el trigger.
  function handleCambioBandaX(_movId: string, _nuevaFase: string) {
    // intencionalmente no-op
  }

  const warningPorMov = useMemo(() => {
    const today = new Date()
    const warnings = new Map<string, string>()
    for (const m of movimientos) {
      if (m.estado_usuario === 'quitado') continue
      const reasons = computeWarningReasons(m, faseDeMovConDefault, today)
      if (reasons.length > 0) warnings.set(m.id, reasons.join(' '))
    }
    return warnings
  }, [movimientos, faseDeMovConDefault])

  // Tooltip por mov: razonamiento del schedule (vacancia/dura) si aplica, +
  // alerta si el mov cae fuera del horizonte 2026. Cualquier referencia a otro
  // mov (ej: "M-12") se enriquece con su nombre entre comillas para que el
  // tooltip sea legible sin tener que mirar el inventario.
  const nombrePorMovId = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of movimientos) map.set(m.id, m.nombre)
    return map
  }, [movimientos])
  const tooltipPorMov = useMemo(() => {
    const map = new Map<string, string>()
    function ym(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    function ref(id: string): string {
      const n = nombrePorMovId.get(id)
      return n ? `${id} "${n}"` : id
    }
    for (const [movId, sched] of schedule.entries()) {
      const partes: string[] = []
      const trabajoYM = ym(sched.trabajoTermina)
      partes.push(`Trabajo: ${sched.arrancaYM} → ${trabajoYM} (${sched.durMeses}m)`)
      // Si una FF extiende el cierre formal más allá del trabajo activo,
      // anotamos cierre formal separado.
      if (sched.termina.getTime() > sched.trabajoTermina.getTime()) {
        partes.push(`Cierre formal: ${sched.terminaYM} (esperando precondición FF)`)
      }
      if (sched.empujadoPorVacancia) partes.push('Empujado por vacancia (lead time)')
      if (sched.empujadoPorDuraId) partes.push(`Empujado por dependencia → ${ref(sched.empujadoPorDuraId)}`)
      if (sched.tieneOverride) partes.push(`Movido manualmente: natural ${ym(sched.arrancaNatural)} → override ${sched.arrancaYM}`)
      if (sched.overrideDescartado) partes.push(`⚠ Override descartado (anterior al piso natural ${ym(sched.arrancaNatural)})`)
      if (partes.length > 0) map.set(movId, partes.join(' · '))
    }
    return map
  }, [schedule, nombrePorMovId])

  // ─── Drag override: callback cuando el user arrastra un mov horizontalmente
  //     en el canvas P-4. Recibe la X absoluta donde lo soltó. Convertimos a
  //     fecha vía xToDate, validamos contra arrancaNatural, abrimos el modal
  //     de razonamiento.
  function handleArrancaOverrideDrag(movId: string, xAbsoluto: number) {
    const mov = movimientos.find(m => m.id === movId)
    if (!mov) return
    const sched = schedule.get(movId)
    if (!sched) return
    const nuevaFecha = xToDate(xAbsoluto, faseKeysActivos, XBAND_WIDTH_P4)
    const nuevaArrancaYM = `${nuevaFecha.getFullYear()}-${String(nuevaFecha.getMonth() + 1).padStart(2, '0')}`
    const arrancaNaturalYM = `${sched.arrancaNatural.getFullYear()}-${String(sched.arrancaNatural.getMonth() + 1).padStart(2, '0')}`
    // Si la nueva fecha == natural Y no hay override previo, es no-op — solo
    // descarta el drag visual sin abrir modal.
    if (nuevaArrancaYM === arrancaNaturalYM && !mov.arranca_override) {
      setDragResetCounter(c => c + 1)
      return
    }
    const invalido = nuevaFecha.getTime() < sched.arrancaNatural.getTime()
    setOverrideEdit({
      movId,
      movNombre: mov.nombre,
      arrancaNaturalYM,
      nuevaArrancaYM,
      razonamientoExistente: mov.arranca_override_razonamiento ?? '',
      invalido,
    })
    setOverrideError(null)
  }

  // Editar tipo/lag de una dependencia EXISTENTE desde el canvas de fases.
  // Antes era no-op acá (solo en 3.A.6) → el editor abría, "Aplicar" cerraba y no
  // pasaba nada. Como el lag/tipo afecta el CPM (y por ende el Gantt que el user
  // está mirando), tiene sentido editarlo acá. Persiste DIRECTO vía /decision (no
  // por el chat → no lo toca el merge-protector). La edge ya existe; solo cambia
  // su tipo/lag. onInventarioUpdate refresca → schedule + Gantt se recomputan.
  async function aplicarCambiarTipoEdge(desde: string, hacia: string, tipo: 'sugerida' | 'ff' | 'fs' | 'continuo', lagMeses: number) {
    const target = movimientos.find(m => m.id === hacia)
    if (!target) return
    const nuevoTipo = { ...(target.precondiciones_tipo ?? {}), [desde]: tipo }
    const nuevoLag = { ...(target.precondiciones_lag_meses ?? {}) }
    const lag = Math.max(0, Math.floor(lagMeses ?? 0))
    if (tipo !== 'sugerida' && lag > 0) nuevoLag[desde] = lag
    else delete nuevoLag[desde]
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movimiento_id: hacia,
          estado: 'editado',
          patch: {
            precondiciones_tipo: nuevoTipo,
            precondiciones_lag_meses: Object.keys(nuevoLag).length > 0 ? nuevoLag : undefined,
          },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onInventarioUpdate?.(data.inventario_actualizado)
    } catch (e) {
      setOverrideError(e instanceof Error ? e.message : String(e))
    }
  }

  async function aplicarOverride(razonamiento: string) {
    if (!overrideEdit || overrideEdit.invalido) return
    setOverrideAplicando(true)
    setOverrideError(null)
    try {
      const patchBody = {
        movimiento_id: overrideEdit.movId,
        estado: 'editado',
        patch: {
          arranca_override: overrideEdit.nuevaArrancaYM,
          arranca_override_razonamiento: razonamiento.trim(),
        },
      }
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.inventario_actualizado) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      if (onInventarioUpdate) onInventarioUpdate(data.inventario_actualizado as InventarioPE)
      setOverrideEdit(null)
    } catch (e: any) {
      setOverrideError(e?.message ?? 'Error al aplicar el override')
    } finally {
      setOverrideAplicando(false)
    }
  }

  async function limpiarOverride(movId: string) {
    setOverrideAplicando(true)
    setOverrideError(null)
    try {
      const patchBody = {
        movimiento_id: movId,
        estado: 'editado',
        patch: {
          arranca_override: null,
          arranca_override_razonamiento: null,
        },
      }
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.inventario_actualizado) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      if (onInventarioUpdate) onInventarioUpdate(data.inventario_actualizado as InventarioPE)
      setOverrideEdit(null)
    } catch (e: any) {
      setOverrideError(e?.message ?? 'Error al limpiar el override')
    } finally {
      setOverrideAplicando(false)
    }
  }

  function cancelarOverride() {
    setOverrideEdit(null)
    setDragResetCounter(c => c + 1)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans"
      onClick={onCerrar}
    >
      <div
        className="flex h-[95vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0 min-w-0">
            <p className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              P-4 · Distribución por fases
            </p>
            <span className="inline-flex items-center gap-3 text-[12px]">
              {balancePorFase.map(b => {
                const q = b.faseKey.slice(0, 2)
                const colorClass = q === 'Q1' ? 'text-violet-300'
                  : q === 'Q2' ? 'text-emerald-300'
                  : q === 'Q3' ? 'text-amber-300'
                  : 'text-blue-300'
                return (
                  <span key={b.faseKey} className={colorClass}>
                    <strong className="font-semibold">{b.count}</strong> {b.faseKey}
                  </span>
                )
              })}
              {balanceSinAsignar > 0 && (
                <span className="text-red-300"><strong className="font-semibold">{balanceSinAsignar}</strong> sin asignar</span>
              )}
              {warningsCount > 0 && (
                <span className="text-orange-300">
                  ⚠️ <strong className="font-semibold">{warningsCount}</strong> inconsist.
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setDragResetCounter(c => c + 1)}
              title="Re-distribuir las fichas según el cronograma calculado (dependencias, lags y duraciones actuales). Descarta arrastres manuales visuales."
              className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
            >
              🔄 Re-distribuir
            </button>
            <button
              onClick={onCerrar}
              className={BTN_CTA_SM}
            >
              Cerrar editor
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden px-2 py-2">
          <div className="h-full overflow-hidden rounded-lg border border-sidebar-border bg-sidebar/10 relative">
            <DAGSecuenciacion
              key={`dag-${dragResetCounter}`}
              movsACanvas={movsACanvas}
              todosLosMovs={movimientos}
              movSeleccionadoId={movSeleccionadoId}
              onSeleccionar={setMovSeleccionadoId}
              onAgregarMov={() => {}}
              onMoverNodo={() => {}}
              onCrearPrecondicion={() => {}}
              onQuitarPrecondicion={() => {}}
              onCambiarTipoEdge={(desde, hacia, tipo, lagMeses) => void aplicarCambiarTipoEdge(desde, hacia, tipo, lagMeses)}
              onVerDetalle={onVerDetalleMov}
              bandConfig={bandConfigPorDueno}
              xBandConfig={xBandConfig}
              xBandWidth={XBAND_WIDTH_P4}
              lineaHoyX={dateToX(new Date(), faseKeysActivos, XBAND_WIDTH_P4)}
              // V2 layout: cada mov en su propia fila vertical (positioning
              // proporcional por fecha). nodosPorFila=9999 fuerza baseRows=1
              // en el computeBandLayout interno; el row-count real viene de
              // extraFilas (ver bandConfigPorDueno).
              nodosPorFila={9999}
              onArrancaOverrideDrag={handleArrancaOverrideDrag}
              warningPorMov={warningPorMov}
              tooltipPorMov={tooltipPorMov}
              posicionAlSeleccionar="top-left"
              bandHeaderExtra={(duenoKey) => {
                const s = duenoStats.get(duenoKey)
                if (!s?.esVacante) return null
                return (
                  <span
                    title={s.semanasMax > 0
                      ? `Puesto vacante — ${s.semanasMax} semanas estimadas para cubrir`
                      : 'Puesto vacante (lead time no especificado)'}
                    className="inline-block px-2 py-0.5 rounded-md bg-amber-700/80 border border-amber-400/50 text-amber-50 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap"
                  >
                    ⏳ Vacante{s.semanasMax > 0 ? ` · ${s.semanasMax} sem` : ''}
                  </span>
                )
              }}
            />
          </div>
        </div>
      </div>
      {overrideEdit && (
        <OverrideArrancaModal
          movId={overrideEdit.movId}
          movNombre={overrideEdit.movNombre}
          arrancaNaturalYM={overrideEdit.arrancaNaturalYM}
          nuevaArrancaYM={overrideEdit.nuevaArrancaYM}
          razonamientoExistente={overrideEdit.razonamientoExistente}
          invalido={overrideEdit.invalido}
          aplicando={overrideAplicando}
          error={overrideError}
          onAplicar={aplicarOverride}
          onLimpiar={() => limpiarOverride(overrideEdit.movId)}
          onCancelar={cancelarOverride}
        />
      )}
    </div>
  )
}

// ─── OverrideArrancaModal ───────────────────────────────────────────────────
// Modal post-drag horizontal: pide razonamiento al user por haber movido un
// mov a una fecha distinta del piso CPM natural. Solo se puede POSTERGAR
// (no adelantar) — adelantar viola constraints (vacancia, FS, hoy). Si el
// drop fue antes del piso, mostramos error y el único acción válida es
// Cancelar (volver a la posición natural).
function OverrideArrancaModal({
  movId,
  movNombre,
  arrancaNaturalYM,
  nuevaArrancaYM,
  razonamientoExistente,
  invalido,
  aplicando,
  error,
  onAplicar,
  onLimpiar,
  onCancelar,
}: {
  movId: string
  movNombre: string
  arrancaNaturalYM: string
  nuevaArrancaYM: string
  razonamientoExistente: string
  invalido: boolean
  aplicando: boolean
  error: string | null
  onAplicar: (razonamiento: string) => void
  onLimpiar: () => void
  onCancelar: () => void
}) {
  const [razonamiento, setRazonamiento] = useState(razonamientoExistente)
  const MIN_CHARS = 20
  const valido = !invalido && razonamiento.trim().length >= MIN_CHARS

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !aplicando) onCancelar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancelar, aplicando])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !aplicando && onCancelar()}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-sidebar-border bg-background shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="border-b border-sidebar-border px-6 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90">
            Postergar movimiento
          </p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-foreground">
            <span className="font-mono text-muted-foreground/80">{movId}</span> · {movNombre}
          </h2>
        </header>
        <div className="px-6 py-4 space-y-4">
          <div className="rounded-md border border-sidebar-border bg-sidebar/40 px-4 py-3 text-[13px] space-y-1.5">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Arranque natural (CPM):</span>
              <span className="font-mono text-foreground">{arrancaNaturalYM}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Nuevo arranque:</span>
              <span className={`font-mono font-semibold ${invalido ? 'text-red-300' : 'text-amber-200'}`}>
                {nuevaArrancaYM}
              </span>
            </div>
          </div>
          {invalido ? (
            <div className="rounded-md border border-red-700/60 bg-red-950/30 px-3 py-2 text-[12px] text-red-100 space-y-1">
              <p className="font-semibold">⚠ No se puede adelantar el arranque.</p>
              <p>El piso CPM ({arrancaNaturalYM}) está determinado por hoy + vacancia + precondiciones FS. Para que arranque más temprano, ajustá esas inputs (sacá vacancia, cambiá deps a sugerida, etc.) desde el form del mov.</p>
            </div>
          ) : (
            <div>
              <label className="block text-[12px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1">
                ¿Por qué postergaste este movimiento?
              </label>
              <p className="text-[12px] text-muted-foreground mb-2">
                El cronograma natural ya está calculado por CPM. Si decidiste moverlo manualmente, contá la razón (coordinación con otra área, restricción de presupuesto, conviene retrasar para hacerlo con más capacidad, etc.).
              </p>
              <textarea
                value={razonamiento}
                onChange={e => setRazonamiento(e.target.value)}
                rows={4}
                placeholder="Ej: Lo postergo a Q4 porque coordinamos con el lanzamiento de Más Dueños y queremos el equipo libre…"
                className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                {razonamiento.trim().length} / {MIN_CHARS} caracteres mínimos
              </p>
            </div>
          )}
          {error && (
            <p className="text-[12px] text-red-300">⚠ {error}</p>
          )}
        </div>
        <footer className="border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-3 bg-sidebar/30">
          <div>
            {razonamientoExistente && !invalido && (
              <button
                onClick={onLimpiar}
                disabled={aplicando}
                className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
              >
                Volver a posición natural
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancelar}
              disabled={aplicando}
              className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent/50 disabled:opacity-40"
            >
              Cancelar
            </button>
            {!invalido && (
              <button
                onClick={() => onAplicar(razonamiento)}
                disabled={aplicando || !valido}
                className="rounded-md bg-amber-600 px-4 py-1.5 text-[13px] font-bold text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aplicando ? 'Aplicando…' : 'Guardar override'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
