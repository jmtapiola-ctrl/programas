'use client'

// RazonamientoRiesgoModal — sub-modal para capturar el razonamiento de
// "riesgo alto de ejecución" sobre UN mov del inventario. Se monta encima del
// RiesgoEjecucionModal fullscreen (z-index superior).
//
// Flow:
//   1. Si el mov ya tenía razon (`riesgo_ejecucion_razonamiento` truthy),
//      precargamos el textarea + mostramos botón "Desmarcar".
//   2. User edita la razon (min 30 chars). Guarda → PATCH al inventario.
//   3. Alternativa: click "Desmarcar" → PATCH con razon=null (limpia el flag).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MovimientoPE, InventarioPE } from '@/lib/types'

const MIN_CHARS = 30

interface Props {
  mov: MovimientoPE
  planId: string
  onSuccess: (inventarioActualizado: InventarioPE) => void
  onCerrar: () => void
}

export function RazonamientoRiesgoModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ mov, planId, onSuccess, onCerrar }: Props) {
  const yaMarcado = !!mov.riesgo_ejecucion_razonamiento
  const [razon, setRazon] = useState(mov.riesgo_ejecucion_razonamiento ?? '')
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !aplicando) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, aplicando])

  const chars = razon.trim().length
  const puedeGuardar = chars >= MIN_CHARS && !aplicando

  async function patch(nuevaRazon: string | null) {
    setAplicando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movimiento_id: mov.id,
          estado: 'editado',
          patch: { riesgo_ejecucion_razonamiento: nuevaRazon },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.inventario_actualizado) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      onSuccess(data.inventario_actualizado as InventarioPE)
      onCerrar()
    } catch (e: any) {
      setError(e?.message ?? 'Error al guardar el razonamiento')
      setAplicando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !aplicando && onCerrar()}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-sidebar-border bg-background shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="border-b border-sidebar-border px-6 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-red-400/90">
            Riesgo alto de ejecución
          </p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-foreground">
            <span className="font-mono text-muted-foreground/80">{mov.id}</span> · {mov.nombre}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">{mov.categoria}</p>
        </header>
        <div className="px-6 py-4 space-y-3">
          <div>
            <p className="text-[13px] text-foreground/90 leading-snug mb-2">
              ¿Por qué tiene riesgo alto de ejecución?
            </p>
            <p className="text-[12px] text-muted-foreground mb-2">
              Pensá en el tipo de riesgo: persona (vacancia, perfil débil), metodología
              (no probada), novedad (nunca lo hicimos), dependencia oculta, ambición
              del criterio de éxito. Las mitigaciones cambian según el tipo, por eso
              vale la pena distinguirlo.
            </p>
            <textarea
              value={razon}
              onChange={e => setRazon(e.target.value)}
              rows={5}
              placeholder="Ej: criterio de éxito muy ambicioso (10x en 6 meses) + persona vacante + nunca lo hicimos. Mitigación: validar con un piloto chico antes de comprometer fechas."
              className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {chars} / {MIN_CHARS} caracteres mínimos
            </p>
          </div>
          {error && (
            <p className="text-[12px] text-red-300">⚠ {error}</p>
          )}
        </div>
        <footer className="border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-3 bg-sidebar/30">
          <div>
            {yaMarcado && (
              <button
                onClick={() => patch(null)}
                disabled={aplicando}
                className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
              >
                Desmarcar (limpia razon)
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              disabled={aplicando}
              className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent/50 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={() => patch(razon.trim())}
              disabled={!puedeGuardar}
              title={!puedeGuardar && chars < MIN_CHARS ? `Necesitás al menos ${MIN_CHARS} caracteres` : undefined}
              className="rounded-md bg-red-600 px-4 py-1.5 text-[13px] font-bold text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {aplicando ? 'Guardando…' : yaMarcado ? 'Actualizar razon' : 'Marcar como riesgo'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
