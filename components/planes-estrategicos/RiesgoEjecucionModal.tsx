'use client'

// RiesgoEjecucionModal — modal fullscreen para P-5 (marcado de movs con
// riesgo alto de ejecución). Muestra todas las fichas activas del inventario
// agrupadas por categoría. Click en una ficha → abre RazonamientoRiesgoModal
// para esa ficha (textarea para escribir la razon o desmarcar).
//
// El estado de marcado vive en `mov.riesgo_ejecucion_razonamiento` (presencia =
// marcado). El modal lee del inventario en cada render — al guardar/desmarcar
// el sub-modal PATCHea y el parent actualiza el inventario via onInventarioUpdate.

import { BTN_CTA } from '@/components/ui/button-styles'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MovimientoPE, InventarioPE } from '@/lib/types'
import { FichaMovimiento } from './fichas/FichaMovimiento'
import { RazonamientoRiesgoModal } from './RazonamientoRiesgoModal'
import { computeSchedule } from '@/lib/computeSchedule'

interface Props {
  movimientos: MovimientoPE[]
  planId: string
  preguntaTexto?: string
  onInventarioUpdate: (inv: InventarioPE) => void
  onCerrar: () => void
}

export function RiesgoEjecucionModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ movimientos, planId, preguntaTexto, onInventarioUpdate, onCerrar }: Props) {
  const [movEditando, setMovEditando] = useState<MovimientoPE | null>(null)
  // Pregunta expandible: por defecto se muestra clamped a 2 líneas; el user
  // puede expandirla con un click si quiere leerla completa.
  const [preguntaExpandida, setPreguntaExpandida] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !movEditando) onCerrar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, movEditando])

  // Movs activos (no quitados). Los que se muestran en la grilla.
  const movsActivos = useMemo(
    () => movimientos.filter(m => m.estado_usuario !== 'quitado'),
    [movimientos],
  )

  // Marcado vivo: cuáles tienen riesgo_ejecucion_razonamiento truthy.
  const marcadosCount = useMemo(
    () => movsActivos.filter(m => !!m.riesgo_ejecucion_razonamiento).length,
    [movsActivos],
  )

  // Agrupación por categoría — orden de aparición en el inventario.
  const categorias = useMemo(() => {
    const orden: string[] = []
    const visto = new Set<string>()
    for (const m of movsActivos) {
      if (!visto.has(m.categoria)) {
        orden.push(m.categoria)
        visto.add(m.categoria)
      }
    }
    return orden
  }, [movsActivos])

  const movsPorCategoria = useMemo(() => {
    const map = new Map<string, MovimientoPE[]>()
    for (const cat of categorias) {
      map.set(cat, movsActivos.filter(m => m.categoria === cat))
    }
    return map
  }, [categorias, movsActivos])

  // Schedule CPM para mostrar arranque/cierre real por mov (info clave para
  // evaluar riesgo: si el mov tiene poco tiempo o arranca tarde, eso es señal).
  // Los movs sin duración cargada no aparecen en el schedule → cpmInfo undefined.
  const schedule = useMemo(() => computeSchedule(movsActivos, new Date()), [movsActivos])
  function cpmInfoFor(movId: string): { arrancaYM: string; terminaYM: string; durMeses: number } | undefined {
    const sched = schedule.get(movId)
    if (!sched) return undefined
    return { arrancaYM: sched.arrancaYM, terminaYM: sched.terminaYM, durMeses: sched.durMeses }
  }

  // Después de guardar en el sub-modal, el inventario llega actualizado y el
  // movEditando se cierra. La grilla re-renderea con el nuevo estado del mov.
  function handleSubModalSuccess(invActualizado: InventarioPE) {
    onInventarioUpdate(invActualizado)
  }

  // Cuál mov mostrar en el sub-modal: si está abierto, lo buscamos en el
  // inventario actualizado (no usamos la referencia inicial — puede estar stale
  // si el user editó y volvió a abrir el mismo mov).
  const movEditandoActual = movEditando
    ? movsActivos.find(m => m.id === movEditando.id) ?? movEditando
    : null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !movEditando && onCerrar()}
    >
      <div
        className="flex h-[95vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-3 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-red-400/90">
              P-5 · Riesgo de ejecución
            </p>
            <h2 className="mt-0.5 text-[16px] font-semibold text-foreground">
              Marcá los movimientos donde más temés que la ejecución salga mal
            </h2>
            {preguntaTexto && (
              <button
                type="button"
                onClick={() => setPreguntaExpandida(v => !v)}
                title={preguntaExpandida ? 'Click para colapsar' : 'Click para ver la pregunta completa'}
                className="mt-1 block text-left text-[12px] text-muted-foreground hover:text-foreground transition-colors max-w-3xl group"
              >
                <span className={preguntaExpandida ? 'whitespace-pre-line' : 'line-clamp-2'}>
                  {preguntaTexto}
                </span>
                <span className="mt-0.5 inline-block text-[11px] text-primary/70 group-hover:text-primary">
                  {preguntaExpandida ? '▲ colapsar' : '▼ ver completa'}
                </span>
              </button>
            )}
            <p className="mt-1.5 text-[12px] text-foreground/80">
              <strong className="text-red-300">{marcadosCount}</strong> marcado{marcadosCount === 1 ? '' : 's'} de {movsActivos.length} · click en una ficha para marcar/editar
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 p-1 text-[16px] leading-none flex-shrink-0"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {categorias.map(cat => {
            const movs = movsPorCategoria.get(cat) ?? []
            const conRiesgo = movs.filter(m => !!m.riesgo_ejecucion_razonamiento).length
            return (
              <section key={cat}>
                <header className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="text-[14px] font-semibold uppercase tracking-wider text-foreground/90">
                    {cat}
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    {movs.length} mov{movs.length === 1 ? '' : 's'}
                    {conRiesgo > 0 && (
                      <span className="ml-2 text-red-300">· {conRiesgo} con riesgo</span>
                    )}
                  </p>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {movs.map(m => (
                    <FichaMovimiento
                      key={m.id}
                      movimiento={m}
                      // Campos pensados para evaluar riesgo de ejecución:
                      //   que_resuelve + criterio_exito = qué tiene que entregar.
                      //   dueno + impacto = quién + qué pesa.
                      //   duracion_meses + cpmInfo = cuánto + cuándo (variables
                      //   típicas de riesgo: poco tiempo, arranca tarde, etc).
                      campos={['nombre', 'que_resuelve', 'criterio_exito', 'dueno', 'impacto', 'duracion_meses']}
                      cpmInfo={cpmInfoFor(m.id)}
                      estado={m.riesgo_ejecucion_razonamiento ? { tipo: 'riesgo' } : { tipo: 'normal' }}
                      onClick={() => setMovEditando(m)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-4 bg-sidebar/30">
          <p className="text-[12px] text-muted-foreground">
            Cerrá este editor y confirmá la selección desde el chat.
          </p>
          <button
            onClick={onCerrar}
            className={BTN_CTA}
          >
            Cerrar (volver al chat)
          </button>
        </footer>
      </div>
      {movEditandoActual && (
        <RazonamientoRiesgoModal
          mov={movEditandoActual}
          planId={planId}
          onSuccess={handleSubModalSuccess}
          onCerrar={() => setMovEditando(null)}
        />
      )}
    </div>
  )
}
