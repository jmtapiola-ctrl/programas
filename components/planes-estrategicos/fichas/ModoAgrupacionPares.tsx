'use client'

// Modo Agrupación de Pares: usuario click en ficha A → modo "asociando", click
// en ficha B → crea par A→B, visualizado con flecha SVG. Múltiples pares
// permitidos.
//
// Implementación de las flechas: SVG overlay absoluto sobre el grid de fichas,
// líneas con marker arrow al final. Posiciones recalculadas con
// getBoundingClientRect en useLayoutEffect (re-render en resize).

import { useLayoutEffect, useRef, useState } from 'react'
import type { MovimientoPE, CampoFichaMovimiento, RespuestaEstructurada } from '@/lib/types'
import { FichaMovimiento, type EstadoFicha, type GestionInventario } from './FichaMovimiento'

interface Props {
  movimientos: MovimientoPE[]
  campos: CampoFichaMovimiento[]
  pares: Array<{ desde: string; hacia: string }>
  onChange: (pares: Array<{ desde: string; hacia: string }>) => void
  gestion?: GestionInventario
}

export function ModoAgrupacionPares({ movimientos, campos, pares, onChange, gestion }: Props) {
  const [asociandoDesde, setAsociandoDesde] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  function handleClick(id: string) {
    if (asociandoDesde === null) {
      setAsociandoDesde(id)
      return
    }
    if (asociandoDesde === id) {
      // click en la misma ficha → cancelar
      setAsociandoDesde(null)
      return
    }
    // 2do click → crear par. Si el par ya existe, lo deshacemos.
    const yaExiste = pares.some(p => p.desde === asociandoDesde && p.hacia === id)
    if (yaExiste) {
      onChange(pares.filter(p => !(p.desde === asociandoDesde && p.hacia === id)))
    } else {
      onChange([...pares, { desde: asociandoDesde, hacia: id }])
    }
    setAsociandoDesde(null)
  }

  function quitarPar(desde: string, hacia: string) {
    onChange(pares.filter(p => !(p.desde === desde && p.hacia === hacia)))
  }

  function rolDeFicha(id: string): EstadoFicha {
    if (asociandoDesde === id) return { tipo: 'asociando' }
    const esDesde = pares.some(p => p.desde === id)
    const esHacia = pares.some(p => p.hacia === id)
    if (esDesde && esHacia) return { tipo: 'conectado', rol: 'desde' }  // ambos — privilegiamos 'desde' visual
    if (esDesde) return { tipo: 'conectado', rol: 'desde' }
    if (esHacia) return { tipo: 'conectado', rol: 'hacia' }
    return { tipo: 'normal' }
  }

  return (
    <div className="space-y-3">
      {/* Status del modo asociar */}
      {asociandoDesde && (
        <div className="rounded-md bg-amber-950/40 border border-amber-700 px-3 py-2 text-[12px] text-amber-200">
          ⚡ Asociando desde <strong>{asociandoDesde}</strong> "{movimientos.find(m => m.id === asociandoDesde)?.nombre}" →
          click en la ficha destino, o en la misma para cancelar.
        </div>
      )}

      {/* Lista compacta de pares creados */}
      {pares.length > 0 && (
        <div className="rounded-md border border-purple-700/40 bg-purple-950/20 p-2 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-300 mb-1">
            Pares creados ({pares.length})
          </p>
          {pares.map((p, i) => {
            const movDesde = movimientos.find(m => m.id === p.desde)
            const movHacia = movimientos.find(m => m.id === p.hacia)
            return (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="font-mono text-[11px] text-purple-300">{p.desde}</span>
                <span className="text-foreground/70 truncate flex-1">{movDesde?.nombre}</span>
                <span className="text-purple-300">→</span>
                <span className="font-mono text-[11px] text-purple-300">{p.hacia}</span>
                <span className="text-foreground/70 truncate flex-1">{movHacia?.nombre}</span>
                <button onClick={() => quitarPar(p.desde, p.hacia)} className="text-muted-foreground hover:text-red-400 px-1" aria-label="Quitar par">
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Grid con SVG overlay de flechas */}
      <div ref={containerRef} className="relative">
        <FlechasSVG containerRef={containerRef} pares={pares} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 relative">
          {movimientos.map(m => (
            <FichaMovimiento
              key={m.id}
              movimiento={m}
              campos={campos}
              estado={rolDeFicha(m.id)}
              onClick={() => handleClick(m.id)}
              htmlId={`ficha-pair-${m.id}`}
              cambioReciente={gestion?.agregados.has(m.id) ? 'agregado' : gestion?.editados.has(m.id) ? 'editado' : undefined}
              onEditar={gestion ? () => gestion.onEditar(m.id) : undefined}
              onQuitar={gestion ? () => gestion.onQuitar(m.id) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Componente del overlay SVG con flechas. Recalcula posiciones via
// getBoundingClientRect cuando cambian los pares o el viewport.
function FlechasSVG({ containerRef, pares }: { containerRef: React.RefObject<HTMLDivElement | null>; pares: Array<{ desde: string; hacia: string }> }) {
  const [coords, setCoords] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; key: string }>>([])
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    function recompute() {
      const container = containerRef.current
      if (!container) return
      const cRect = container.getBoundingClientRect()
      setSize({ width: cRect.width, height: cRect.height })
      const next: typeof coords = []
      for (const p of pares) {
        const desdeEl = document.getElementById(`ficha-pair-${p.desde}`)
        const haciaEl = document.getElementById(`ficha-pair-${p.hacia}`)
        if (!desdeEl || !haciaEl) continue
        const dRect = desdeEl.getBoundingClientRect()
        const hRect = haciaEl.getBoundingClientRect()
        // Punto de salida: lado derecho de desde. Punto de entrada: lado izquierdo de hacia.
        // Si están en la misma columna (overlap horizontal), arriba/abajo.
        const sameRow = Math.abs(dRect.top - hRect.top) < 30
        const x1 = sameRow ? (dRect.right > hRect.left ? dRect.left - cRect.left : dRect.right - cRect.left) : dRect.left + dRect.width / 2 - cRect.left
        const y1 = sameRow ? dRect.top + dRect.height / 2 - cRect.top : dRect.bottom - cRect.top
        const x2 = sameRow ? (dRect.right > hRect.left ? hRect.right - cRect.left : hRect.left - cRect.left) : hRect.left + hRect.width / 2 - cRect.left
        const y2 = sameRow ? hRect.top + hRect.height / 2 - cRect.top : hRect.top - cRect.top
        next.push({ x1, y1, x2, y2, key: `${p.desde}->${p.hacia}` })
      }
      setCoords(next)
    }
    recompute()
    window.addEventListener('resize', recompute)
    // Retry tras un rAF para asegurar que el grid ya re-renderizó
    const raf = requestAnimationFrame(recompute)
    return () => {
      window.removeEventListener('resize', recompute)
      cancelAnimationFrame(raf)
    }
  }, [pares, containerRef])

  if (coords.length === 0 || size.width === 0) return null

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-10"
      width={size.width}
      height={size.height}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="rgb(168 85 247)" />
        </marker>
      </defs>
      {coords.map(c => (
        <line
          key={c.key}
          x1={c.x1}
          y1={c.y1}
          x2={c.x2}
          y2={c.y2}
          stroke="rgb(168 85 247)"
          strokeWidth="2"
          strokeDasharray="4 2"
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  )
}

export function buildRespuesta_agrupacionPares(pares: Array<{ desde: string; hacia: string }>): RespuestaEstructurada | null {
  if (pares.length === 0) return null
  return { modo: 'agrupacion_pares', pares }
}

export function isCompleto_agrupacionPares(pares: Array<{ desde: string; hacia: string }>, min?: number, max?: number): boolean {
  const minReal = min ?? 1
  if (pares.length < minReal) return false
  if (max !== undefined && pares.length > max) return false
  return true
}
