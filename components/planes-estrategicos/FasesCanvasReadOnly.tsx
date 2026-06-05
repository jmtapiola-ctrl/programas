'use client'

// Wrapper read-only del cronograma visual (Gantt-style) que aparece en P-4
// del wizard. Para embeber en la vista de prestigio del plan (/vista) sin
// arrastrar toda la maquinaria del componente del wizard (modales de unify
// dueños, drag override, clustering API, etc.).
//
// Reusa: computeSchedule (CPM), dateToX (posicionamiento proporcional),
// faseKeySort, fasesDelSchedule, y el componente DAGSecuenciacion en modo
// readOnly con xBandConfig (lanes verticales = cuatrimestres) + bandConfig
// (lanes horizontales = dueños).
//
// Simplificaciones vs P-4 del wizard:
//   - Packing simple: una fila por mov dentro de su dueño (no greedy packing).
//   - Sin warnings de coherencia, sin tooltips de cronograma, sin badges.
//   - Sin drag interactivo. Todo readOnly.
//
// Estos sacrificios son OK porque el caso de uso es "primera lectura del
// ejecutivo" — quiere ver CUÁNDO y QUIÉN, no editar.

import { useMemo, useState } from 'react'
import type { InventarioPE, MovimientoPE, DAGMovPE } from '@/lib/types'
import {
  computeSchedule,
  dateToX,
  faseKeySort,
  fasesDelSchedule,
  buildFaseDisplayLabel,
  type ScheduleResult,
} from '@/lib/computeSchedule'
import {
  DAGSecuenciacion,
  INTRA_GAP_X,
  type BandConfig,
} from './DAGSecuenciacion'
import { FullscreenWrapper } from './FullscreenWrapper'

const NODE_W = 240
const NODE_H = 76
const INTRA_GAP_Y = 24
const PADDING_Y = 12
const PADDING_X_BAND = 30
// 2 movs por fila — igual que P-4 — lane width que entran 2 nodos lado a lado.
const NODOS_POR_FILA = 2
const XBAND_WIDTH = NODOS_POR_FILA * NODE_W + (NODOS_POR_FILA - 1) * INTRA_GAP_X + 2 * PADDING_X_BAND

function duenoKey(m: MovimientoPE): string {
  const k = (m.dueno ?? '').trim()
  return k.length > 0 ? k : '(sin dueño)'
}

interface Props {
  inventario: InventarioPE
  // Alto del contenedor. Default 800px.
  height?: string
}

export function FasesCanvasReadOnly({ inventario, height = '800px' }: Props) {
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null)

  const movimientos = useMemo(
    () => inventario.movimientos.filter(m => m.estado_usuario !== 'quitado'),
    [inventario.movimientos],
  )

  const baseDate = useMemo(() => new Date(), [])
  const schedule = useMemo(
    () => computeSchedule(movimientos, baseDate),
    [movimientos, baseDate],
  )

  // FaseKeys activos: todos los cuatrimestres que el cronograma toca, sort
  // cronológico. Si nada está scheduled (movs sin duración), default a Q2-año.
  const faseKeysActivos = useMemo(() => {
    const keys = new Set<string>()
    for (const sched of schedule.values()) {
      for (const k of fasesDelSchedule(sched)) keys.add(k)
    }
    if (keys.size === 0) keys.add(`Q2-${baseDate.getFullYear()}`)
    return Array.from(keys).sort((a, b) => faseKeySort(a) - faseKeySort(b))
  }, [schedule, baseDate])

  // Mov → fase de arranque (para ordenamiento de dueños por earliest phase).
  const faseDeMov = useMemo(() => {
    const map = new Map<string, string>()
    for (const [movId, sched] of schedule.entries()) {
      map.set(movId, sched.faseKey)
    }
    return map
  }, [schedule])

  // Lanes X: lanes verticales = cuatrimestres activos. labels Q2-2026, Q3-2026, etc.
  // bandLabel usa buildFaseDisplayLabel para que en lugar de "Q2-2026" se vea
  // "Arranque (Q2 · may-jun 2026)" — mismo display que P-4 del wizard.
  const xBandConfig: BandConfig = useMemo(() => ({
    bandKeyFn: (m: MovimientoPE) => {
      const sched = schedule.get(m.id)
      return sched ? sched.faseKey : (faseKeysActivos[0] ?? 'Q2-2026')
    },
    bandOrden: faseKeysActivos,
    bandLabel: (k: string) => buildFaseDisplayLabel(k),
    topHeaderHeight: 0,
  }), [schedule, faseKeysActivos])

  // Lanes Y: lanes horizontales = dueños. Orden por earliest phase de cualquier
  // mov del dueño (los dueños con movs tempranos arriba).
  const duenoEarliestOrden = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movimientos) {
      const fase = faseDeMov.get(m.id) ?? faseKeysActivos[0] ?? 'Q2-2026'
      const orden = faseKeySort(fase)
      const d = duenoKey(m)
      const prev = map.get(d)
      if (prev === undefined || orden < prev) map.set(d, orden)
    }
    return map
  }, [movimientos, faseDeMov, faseKeysActivos])

  const duenoOrden = useMemo(() => {
    return Array.from(duenoEarliestOrden.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([d]) => d)
  }, [duenoEarliestOrden])

  // Cantidad de movs por dueño — usamos como extraFilas para que cada mov tenga
  // su propia fila vertical dentro del lane del dueño (packing simple).
  const totalMovsPorDueno = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movimientos) {
      const d = duenoKey(m)
      map.set(d, (map.get(d) ?? 0) + 1)
    }
    return map
  }, [movimientos])

  const bandConfigPorDueno: BandConfig = useMemo(() => ({
    bandKeyFn: duenoKey,
    bandOrden: duenoOrden,
    topHeaderHeight: 36,
    extraFilas: (k: string) => Math.max(0, (totalMovsPorDueno.get(k) ?? 0) - 1),
  }), [duenoOrden, totalMovsPorDueno])

  // movsACanvas: posiciones x/y derivadas del schedule + packing por dueño.
  const movsACanvas: DAGMovPE[] = useMemo(() => {
    const result: DAGMovPE[] = []
    // Map dueño → lista de movs ordenados por arranca asc (para asignar fila).
    const movsPorDueno = new Map<string, MovimientoPE[]>()
    for (const m of movimientos) {
      const d = duenoKey(m)
      const arr = movsPorDueno.get(d) ?? []
      arr.push(m)
      movsPorDueno.set(d, arr)
    }
    for (const [, arr] of movsPorDueno) {
      arr.sort((a, b) => {
        const sa = schedule.get(a.id)
        const sb = schedule.get(b.id)
        const ta = sa ? sa.arranca.getTime() : 0
        const tb = sb ? sb.arranca.getTime() : 0
        return ta - tb || a.id.localeCompare(b.id)
      })
    }

    // Computo Y base de cada banda según el orden de duenoOrden.
    // Cada banda mide topHeaderHeight + (numMovs * (NODE_H + GAP)) + PADDING.
    let yCursor = 0
    const yBasePorDueno = new Map<string, number>()
    for (const d of duenoOrden) {
      yBasePorDueno.set(d, yCursor)
      const n = totalMovsPorDueno.get(d) ?? 1
      const headerH = 36
      const bandHeight = headerH + n * (NODE_H + INTRA_GAP_Y) + PADDING_Y * 2
      yCursor += bandHeight
    }

    for (const [d, arr] of movsPorDueno) {
      const yBase = (yBasePorDueno.get(d) ?? 0) + 36 + PADDING_Y  // saltar header y padding top
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i]
        const sched = schedule.get(m.id) as ScheduleResult | undefined
        const arrancaX = sched
          ? dateToX(sched.arranca, faseKeysActivos, XBAND_WIDTH)
          : PADDING_X_BAND
        const trabajoTerminaX = sched
          ? dateToX(sched.trabajoTermina, faseKeysActivos, XBAND_WIDTH)
          : arrancaX + NODE_W
        const width = Math.max(NODE_W, trabajoTerminaX - arrancaX)
        const y = yBase + i * (NODE_H + INTRA_GAP_Y)
        result.push({
          mov_id: m.id,
          x: arrancaX,
          y,
          width,
        })
      }
    }
    return result
  }, [movimientos, schedule, faseKeysActivos, duenoOrden, totalMovsPorDueno])

  if (movimientos.length === 0) {
    return (
      <p className="empty">El inventario no tiene movimientos activos para mostrar el cronograma.</p>
    )
  }

  // Header inline arriba de cada banda Y con el nombre del dueño + count de movs.
  const bandHeaderExtra = (key: string) => {
    const n = totalMovsPorDueno.get(key) ?? 0
    return (
      <span className="text-[12px] font-semibold text-foreground/85">
        {key} <span className="text-[11px] text-muted-foreground font-normal">· {n} mov{n === 1 ? '' : 's'}</span>
      </span>
    )
  }

  return (
    <FullscreenWrapper defaultHeight={height} expandLabel="Pantalla completa">
      {(h) => (
        <div
          style={{
            height: h,
            width: '100%',
            border: '1px solid #d4d4cf',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#ffffff',
            color: '#1a1a1a',
            ['--background' as any]: '#ffffff',
            ['--foreground' as any]: '#1a1a1a',
            ['--card' as any]: '#fafafa',
            ['--card-foreground' as any]: '#1a1a1a',
            ['--popover' as any]: '#ffffff',
            ['--popover-foreground' as any]: '#1a1a1a',
            ['--muted' as any]: '#f1f1ee',
            ['--muted-foreground' as any]: '#5a5a55',
            ['--border' as any]: '#d4d4cf',
            ['--sidebar-border' as any]: '#d4d4cf',
            ['--accent' as any]: '#ebebe2',
            ['--accent-foreground' as any]: '#1a1a1a',
          }}
        >
          <DAGSecuenciacion
            movsACanvas={movsACanvas}
            todosLosMovs={movimientos}
            movSeleccionadoId={seleccionadoId}
            onSeleccionar={setSeleccionadoId}
            onAgregarMov={() => {}}
            onMoverNodo={() => {}}
            onCrearPrecondicion={() => {}}
            onQuitarPrecondicion={() => {}}
            onCambiarTipoEdge={() => {}}
            bandConfig={bandConfigPorDueno}
            xBandConfig={xBandConfig}
            xBandWidth={XBAND_WIDTH}
            nodosPorFila={NODOS_POR_FILA}
            bandHeaderExtra={bandHeaderExtra}
            readOnly
            hideCategoria
          />
        </div>
      )}
    </FullscreenWrapper>
  )
}

// Re-export para que el page server component pueda importarlo sin warnings.
// Aunque sea identidad, este archivo es 'use client' y eso lo deja como island.
export default FasesCanvasReadOnly
