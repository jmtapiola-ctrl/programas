'use client'

// UnificarDuenosModal — UI de confirmación de los clusters propuestos por
// la AI para unificar variantes de dueños del inventario, MÁS una sección de
// agrupado manual donde el user puede crear clusters propios para variantes
// que la AI se filtró.
//
// Flow: se monta SIEMPRE antes de abrir el canvas de P-4. El user revisa los
// clusters de AI, opcionalmente arma clusters manuales con variantes no
// detectadas, y clickea "Continuar al editor" — el modal aplica las
// unificaciones marcadas y notifica al parent que abra el canvas.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MovimientoPE } from '@/lib/types'

interface Cluster {
  variantes: string[]
  canonico_sugerido: string
}

interface Props {
  // Clusters detectados por la AI (puede ser []).
  clusters: Cluster[]
  // Movimientos del inventario (para contar movs afectados por variante).
  movimientos: MovimientoPE[]
  // Aplicar las unificaciones marcadas. Si renames es {}, no hace nada server-side.
  onAplicar: (renames: Record<string, string>) => Promise<void>
  // Continuar al canvas DESPUÉS de aplicar (o sin aplicar si no hay marks).
  onContinuar: () => void
  // Cerrar el modal sin avanzar (no abre el canvas).
  onCerrar: () => void
}

interface ClusterEditState {
  aplicar: boolean              // checkbox aplicar
  canonico: string              // canónico editable
  variantesActivas: string[]    // user puede sacar variantes con ×
  esManual?: boolean            // true si fue creado manualmente (no por AI)
}

export function UnificarDuenosModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ clusters, movimientos, onAplicar, onContinuar, onCerrar }: Props) {
  // Escape cierra el modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { /* Escape NO cierra el modal (evita perder lo escrito) */ }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar])

  // Estado editable por cluster (AI o manual).
  const [estados, setEstados] = useState<ClusterEditState[]>(() =>
    clusters.map(c => ({
      aplicar: true,
      canonico: c.canonico_sugerido,
      variantesActivas: [...c.variantes],
    })),
  )
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cuenta movs por variante (info al user).
  const movsPorDueno = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of movimientos) {
      if (m.estado_usuario === 'quitado') continue
      const d = (m.dueno ?? '').trim()
      if (!d) continue
      map.set(d, (map.get(d) ?? 0) + 1)
    }
    return map
  }, [movimientos])

  // Dueños únicos del inventario, ordenados alfabéticamente.
  const todosLosDuenos = useMemo(() => {
    const set = new Set<string>()
    for (const m of movimientos) {
      if (m.estado_usuario === 'quitado') continue
      const d = (m.dueno ?? '').trim()
      if (d) set.add(d)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [movimientos])

  // Dueños YA presentes en algún cluster activo (cualquier estado, aplicar o no).
  const duenosEnAlgunCluster = useMemo(() => {
    const set = new Set<string>()
    for (const e of estados) for (const v of e.variantesActivas) set.add(v)
    return set
  }, [estados])

  // Dueños DISPONIBLES para agrupar manualmente — los que no están en ningún cluster.
  const duenosDisponibles = useMemo(() =>
    todosLosDuenos.filter(d => !duenosEnAlgunCluster.has(d)),
    [todosLosDuenos, duenosEnAlgunCluster],
  )

  // Selección actual para crear cluster manual.
  const [seleccionManual, setSeleccionManual] = useState<Set<string>>(new Set())

  // Cuántos movs se van a cambiar si se confirma todo el preview actual.
  const movsAfectadosTotal = useMemo(() => {
    let total = 0
    for (const est of estados) {
      if (!est.aplicar) continue
      const target = est.canonico.trim()
      if (!target) continue
      for (const v of est.variantesActivas) {
        if (v === target) continue
        total += movsPorDueno.get(v) ?? 0
      }
    }
    return total
  }, [estados, movsPorDueno])

  const clustersAplicables = estados.filter(e => e.aplicar && e.canonico.trim() && e.variantesActivas.length >= 2).length

  function actualizarEstado(i: number, patch: Partial<ClusterEditState>) {
    setEstados(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  }

  function sacarVariante(clusterIdx: number, variante: string) {
    setEstados(prev => prev.map((e, idx) => {
      if (idx !== clusterIdx) return e
      return { ...e, variantesActivas: e.variantesActivas.filter(v => v !== variante) }
    }))
  }

  function quitarCluster(i: number) {
    setEstados(prev => prev.filter((_, idx) => idx !== i))
  }

  function toggleSeleccionManual(dueno: string) {
    setSeleccionManual(prev => {
      const next = new Set(prev)
      if (next.has(dueno)) next.delete(dueno)
      else next.add(dueno)
      return next
    })
  }

  function crearClusterManual() {
    const variantes = Array.from(seleccionManual)
    if (variantes.length < 2) return
    // Canónico por default: el más largo (más completo).
    const canonico = variantes.reduce((a, b) => b.length > a.length ? b : a, variantes[0])
    setEstados(prev => [...prev, {
      aplicar: true,
      canonico,
      variantesActivas: variantes,
      esManual: true,
    }])
    setSeleccionManual(new Set())
  }

  async function handleContinuar() {
    setError(null)
    // Construir renames de los clusters marcados.
    const renames: Record<string, string> = {}
    for (const est of estados) {
      if (!est.aplicar) continue
      const target = est.canonico.trim()
      if (!target || est.variantesActivas.length < 2) continue
      const variantesSet = new Set(est.variantesActivas)
      for (const m of movimientos) {
        if (m.estado_usuario === 'quitado') continue
        const dueno = (m.dueno ?? '').trim()
        if (variantesSet.has(dueno) && dueno !== target) {
          renames[m.id] = target
        }
      }
    }

    setAplicando(true)
    try {
      // Solo POST si hay renames; sino skip y abrimos canvas directo.
      if (Object.keys(renames).length > 0) {
        await onAplicar(renames)
      }
      onContinuar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setAplicando(false)
    }
  }

  const totalDuenos = todosLosDuenos.length

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans"
    >
      <div
        className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground">Revisar dueños del inventario</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {clusters.length > 0
                ? `La AI detectó ${clusters.length} ${clusters.length === 1 ? 'grupo' : 'grupos'} de variantes que parecen duplicados. Confirmá los que querés unificar, o agregá grupos manualmente abajo.`
                : `La AI no detectó duplicados. Si ves variantes de la misma persona en la lista de abajo, marcalas y agrupalas manualmente.`}
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={aplicando}
            className="rounded text-muted-foreground/70 hover:text-foreground hover:bg-accent/60 px-2 py-1 text-[16px] leading-none disabled:opacity-40"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Sección 1: clusters editables (AI + manuales) */}
          {estados.length > 0 && (
            <section>
              <p className="text-[12px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-2">
                Grupos a unificar ({estados.length})
              </p>
              <div className="space-y-3">
                {estados.map((est, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border-2 px-4 py-3 transition-colors ${
                      est.aplicar
                        ? est.esManual
                          ? 'border-blue-700/60 bg-blue-950/20'
                          : 'border-amber-700/60 bg-amber-950/20'
                        : 'border-sidebar-border bg-sidebar/20 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={est.aplicar}
                          onChange={e => actualizarEstado(i, { aplicar: e.target.checked })}
                          className="w-4 h-4 accent-amber-500 cursor-pointer"
                        />
                        <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Aplicar
                        </span>
                      </label>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {est.esManual && (
                            <span className="text-[10px] uppercase tracking-wider text-blue-300/80 font-semibold border border-blue-700/50 rounded px-1.5 py-0.5">
                              Manual
                            </span>
                          )}
                          {est.esManual && (
                            <button
                              onClick={() => quitarCluster(i)}
                              title="Eliminar este cluster manual"
                              className="text-[11px] text-red-300/70 hover:text-red-200"
                            >
                              Quitar grupo
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {est.variantesActivas.map(v => {
                            const count = movsPorDueno.get(v) ?? 0
                            return (
                              <span
                                key={v}
                                className="inline-flex items-center gap-1 rounded-full bg-sidebar/80 border border-sidebar-border px-2 py-0.5 text-[12px] text-foreground/90"
                              >
                                <span className="font-medium">{v}</span>
                                <span className="text-muted-foreground/70 text-[11px]">({count})</span>
                                {est.variantesActivas.length > 2 && (
                                  <button
                                    onClick={() => sacarVariante(i, v)}
                                    title="Sacar esta variante del cluster"
                                    className="ml-0.5 text-muted-foreground/60 hover:text-red-400"
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            )
                          })}
                        </div>
                        <label className="block text-[12px] uppercase tracking-wider text-muted-foreground/80 mb-1">
                          Nombre canónico
                        </label>
                        <input
                          type="text"
                          value={est.canonico}
                          onChange={e => actualizarEstado(i, { canonico: e.target.value })}
                          disabled={!est.aplicar}
                          placeholder="Ej: Lucas Mercado"
                          className="w-full rounded border border-sidebar-border bg-background px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sección 2: agrupar manualmente */}
          {duenosDisponibles.length > 0 && (
            <section>
              <p className="text-[12px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1">
                {clusters.length > 0 ? 'Otros dueños' : 'Todos los dueños del inventario'} ({duenosDisponibles.length})
              </p>
              <p className="text-[12px] text-muted-foreground mb-2">
                Marcá 2 o más que sean la misma persona y agrupalos.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {duenosDisponibles.map(d => {
                  const count = movsPorDueno.get(d) ?? 0
                  const isSel = seleccionManual.has(d)
                  return (
                    <button
                      key={d}
                      onClick={() => toggleSeleccionManual(d)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] border transition-colors ${
                        isSel
                          ? 'bg-blue-700/70 border-blue-400 text-blue-50'
                          : 'bg-sidebar/40 border-sidebar-border text-foreground/85 hover:bg-accent/40'
                      }`}
                    >
                      <span className="font-medium">{d}</span>
                      <span className="text-[11px] opacity-80">({count})</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={crearClusterManual}
                  disabled={seleccionManual.size < 2}
                  className="rounded-md bg-blue-700 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Agrupar {seleccionManual.size > 0 ? `${seleccionManual.size} seleccionados` : ''}
                </button>
                {seleccionManual.size > 0 && (
                  <button
                    onClick={() => setSeleccionManual(new Set())}
                    className="text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    Limpiar selección
                  </button>
                )}
              </div>
            </section>
          )}

          {duenosDisponibles.length === 0 && estados.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-[13px]">El inventario tiene {totalDuenos} {totalDuenos === 1 ? 'dueño' : 'dueños'} — sin variantes para revisar.</p>
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-4">
          <div className="text-[12px] text-muted-foreground">
            {clustersAplicables > 0 ? (
              <>
                <strong className="text-foreground">{clustersAplicables}</strong>{' '}
                {clustersAplicables === 1 ? 'grupo' : 'grupos'} ·{' '}
                <strong className="text-foreground">{movsAfectadosTotal}</strong> movs cambian de dueño
              </>
            ) : (
              'Sin unificaciones marcadas.'
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-[12px] text-red-300 mr-2">{error}</span>
            )}
            <button
              onClick={onCerrar}
              disabled={aplicando}
              className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-40 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleContinuar}
              disabled={aplicando}
              className="rounded-md bg-amber-600 px-4 py-1.5 text-[12px] font-bold text-white shadow-md hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {aplicando
                ? 'Aplicando…'
                : clustersAplicables > 0
                  ? `Unificar y continuar al editor`
                  : 'Continuar al editor sin cambios'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
