'use client'

// Modal de preview del DAG completo propuesto por Opus (3.A.6).
//
// Opus devuelve una lista plana de dependencias. Acá las renderizamos como
// UN gran DAG visual con todos los movs activos del inventario + las flechas
// propuestas. dagre client-side calcula posiciones (rankdir LR, espaciado
// amplio para legibilidad).
//
// El user revisa el canvas (read-only) y acepta o cancela. Aceptar es
// destructivo: sobreescribe todas las precondiciones del inventario.
// Confirm explícito antes de aplicar.

import { BTN_CTA } from '@/components/ui/button-styles'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import dagre from 'dagre'
import type { InventarioPE, MovimientoPE, DAGMovPE } from '@/lib/types'
import { normalizeDepTipoEdge } from '@/lib/types'
import { DAGSecuenciacion } from './DAGSecuenciacion'

export interface DependenciaPropuesta {
  desde: string
  hacia: string
  tipo: 'sugerida' | 'ff' | 'fs' | 'continuo'
  razonamiento: string
  // Lag por edge en meses. Solo aplica a FS/FF/continuo (ignorado para
  // sugerida). Default 0 si ausente.
  lag_meses?: number
}

interface Props {
  dependencias: DependenciaPropuesta[]
  inventario: InventarioPE
  planId: string
  costoUsd: number
  latenciaMs: number
  onSuccess: (inventarioActualizado: InventarioPE) => void
  onCerrar: () => void
}

const NODE_W = 240
const NODE_H = 76

export function PropuestaDAGModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ dependencias, inventario, planId, costoUsd, latenciaMs, onSuccess, onCerrar }: Props) {
  const [aplicando, setAplicando] = useState(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)
  const [confirmandoSobreescribir, setConfirmandoSobreescribir] = useState(false)
  // Selección local del mov en el preview — habilita el spotlight de edges
  // entrantes/salientes al clickear un nodo. Solo visual; no muta nada.
  const [movSeleccionadoId, setMovSeleccionadoId] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !aplicando) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, aplicando])

  // Movs activos del inventario (no quitados) — los que se renderizan en el canvas.
  const movsActivos = useMemo(
    () => inventario.movimientos.filter(m => m.estado_usuario !== 'quitado'),
    [inventario.movimientos]
  )

  // Construcción de "movs sintéticos" para el preview: tomamos los movs reales
  // pero les sobreescribimos precondiciones/precondiciones_tipo con las deps
  // propuestas por Opus (sin mutar nada en el inventario real). Esto permite
  // que DAGSecuenciacion use su lógica existente de derivar edges desde
  // mov.precondiciones — pero mostrando la PROPUESTA, no el estado actual.
  const movsParaPreview: MovimientoPE[] = useMemo(() => {
    // Inicializamos cada mov con precondiciones/desbloquea/tipo vacíos.
    const base = new Map<string, MovimientoPE>()
    for (const m of movsActivos) {
      base.set(m.id, {
        ...m,
        precondiciones: [],
        desbloquea: [],
        precondiciones_tipo: {},
        precondiciones_lag_meses: {},
        tipo_dependencia: 'ninguna',
      })
    }
    // Aplicamos las propuestas.
    for (const d of dependencias) {
      const target = base.get(d.hacia)
      const source = base.get(d.desde)
      if (!target || !source) continue
      if (!target.precondiciones.includes(d.desde)) target.precondiciones.push(d.desde)
      const tipoNorm = normalizeDepTipoEdge(d.tipo)
      target.precondiciones_tipo = { ...(target.precondiciones_tipo ?? {}), [d.desde]: tipoNorm }
      const lag = Math.max(0, Math.floor(d.lag_meses ?? 0))
      if (tipoNorm !== 'sugerida' && lag > 0) {
        target.precondiciones_lag_meses = { ...(target.precondiciones_lag_meses ?? {}), [d.desde]: lag }
      }
      if (!source.desbloquea.includes(d.hacia)) source.desbloquea.push(d.hacia)
      if (target.tipo_dependencia === 'ninguna') target.tipo_dependencia = 'sugerida'
    }
    return Array.from(base.values())
  }, [movsActivos, dependencias])

  // Override de razonamiento por edge: para que DAGSecuenciacion muestre el
  // razonamiento de Opus en el hover del tipo. Key: `${desde}->${hacia}`.
  const razonamientosOverride: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {}
    for (const d of dependencias) {
      if (d.razonamiento && d.razonamiento.trim()) {
        map[`${d.desde}->${d.hacia}`] = d.razonamiento.trim()
      }
    }
    return map
  }, [dependencias])

  // Computar posiciones via dagre — mismas constantes que el endpoint server-side.
  const movsACanvas: DAGMovPE[] = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 130, marginx: 30, marginy: 30 })
    movsActivos.forEach(m => g.setNode(m.id, { width: NODE_W, height: NODE_H }))
    dependencias.forEach(d => g.setEdge(d.desde, d.hacia))
    dagre.layout(g)
    return movsActivos.map(m => {
      const pos = g.node(m.id)
      return {
        mov_id: m.id,
        x: (pos?.x ?? 0) - NODE_W / 2,
        y: (pos?.y ?? 0) - NODE_H / 2,
      }
    })
  }, [movsActivos, dependencias])

  async function aplicar() {
    setAplicando(true)
    setErrorServer(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/dag/aceptar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dependencias: dependencias.map(d => ({
            desde: d.desde,
            hacia: d.hacia,
            tipo: d.tipo,
            razonamiento: d.razonamiento,
            lag_meses: Math.max(0, Math.floor(d.lag_meses ?? 0)),
          })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorServer(data?.error || `Error ${res.status}`)
        setAplicando(false)
        return
      }
      onSuccess(data.inventario_actualizado)
      onCerrar()
    } catch (e: any) {
      setErrorServer(e?.message || 'Error de red')
      setAplicando(false)
    }
  }

  // Métricas para el header.
  const movsConDeps = new Set<string>()
  for (const d of dependencias) {
    movsConDeps.add(d.desde)
    movsConDeps.add(d.hacia)
  }
  const huerfanosCount = movsActivos.length - movsConDeps.size

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !aplicando && onCerrar()}
    >
      <div
        className="flex h-[95vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90">
              Propuesta del plan · Opus
            </p>
            <h2 className="mt-0.5 text-[16px] font-semibold text-foreground">
              {dependencias.length} dependencia{dependencias.length === 1 ? '' : 's'} propuesta{dependencias.length === 1 ? '' : 's'} en {movsActivos.length} movimientos
              {huerfanosCount > 0 && (
                <span className="text-[12px] text-muted-foreground font-normal ml-2">
                  · {huerfanosCount} sin conexiones (aparecen aislados)
                </span>
              )}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {(latenciaMs / 1000).toFixed(1)}s
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={aplicando}
            aria-label="Cerrar"
            className="rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 p-1 text-[16px] leading-none disabled:opacity-40"
          >
            ✕
          </button>
        </header>

        {/* Canvas único read-only con el DAG completo.
            position: relative requerido por xyflow para sus layers absolutos. */}
        <div className="flex-1 overflow-hidden bg-sidebar/10 relative">
          {dependencias.length === 0 ? (
            <div className="h-full flex items-center justify-center p-8">
              <p className="text-[14px] italic text-muted-foreground text-center">
                Opus no propuso dependencias claras para este inventario.
              </p>
            </div>
          ) : (
            <DAGSecuenciacion
              movsACanvas={movsACanvas}
              todosLosMovs={movsParaPreview}
              movSeleccionadoId={movSeleccionadoId}
              onSeleccionar={setMovSeleccionadoId}
              onAgregarMov={() => {}}
              onMoverNodo={() => {}}
              onCrearPrecondicion={() => {}}
              onQuitarPrecondicion={() => {}}
              onCambiarTipoEdge={() => {}}
              razonamientosOverride={razonamientosOverride}
              readOnly
            />
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-4 bg-sidebar/30">
          <div className="text-[12px] text-muted-foreground">
            {errorServer ? (
              <span className="text-red-300">⚠ {errorServer}</span>
            ) : aplicando ? (
              <span>Aplicando dependencias…</span>
            ) : (
              <span className="text-amber-300">
                ⚠ Aceptar va a <strong>SOBREESCRIBIR</strong> todas las precondiciones actuales del inventario.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              disabled={aplicando}
              className="rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            {!confirmandoSobreescribir ? (
              <button
                onClick={() => setConfirmandoSobreescribir(true)}
                disabled={aplicando || dependencias.length === 0}
                className={BTN_CTA}
              >
                Aceptar propuesta →
              </button>
            ) : (
              <>
                <span className="text-[12px] text-amber-300 font-semibold">¿Seguro? Esto borra el diagrama actual.</span>
                <button
                  onClick={() => setConfirmandoSobreescribir(false)}
                  disabled={aplicando}
                  className="rounded-md border border-sidebar-border px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50"
                >
                  No
                </button>
                <button
                  onClick={aplicar}
                  disabled={aplicando}
                  className="rounded-lg bg-red-700 px-4 py-2 text-[13px] font-bold text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aplicando ? 'Aplicando…' : 'Sí, sobreescribir'}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
