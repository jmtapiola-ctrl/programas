'use client'

// Vista del Borrador del plan (Sub-bloque 3.C, B.2+B.3).
//
// Modal con las 6 secciones del BorradorIteracionPE + sistema de marcas:
//   - Cada elemento (contexto, decisión N, fase N, supuesto N, criterio.X,
//     alternativa N) tiene toggle "OK" / "No me cierra (con razón)".
//   - Sección "Secuencia" tiene además drag-and-drop nativo HTML5 — el reorden
//     se trata como disconformidad implícita al re-iterar.
//   - Footer: "Re-iterar con mis disconformidades (N/3)" + "Aceptar borrador →".
//     Re-iterar requiere al menos 1 disconformidad con razón. Deshabilitado
//     en iteración 3 (sugiere volver a 3.A/3.B).

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BorradorIteracionPE, FaseSecuenciaPE, MovimientoPE } from '@/lib/types'

export interface DisconformidadMarcada {
  elemento: string         // id estable, ej "decision:2", "fase:0", "criterio:path_minimo"
  elementoLabel: string    // texto humano para el payload del endpoint
  razon: string
}

interface Props {
  iteracion: BorradorIteracionPE
  movimientos: MovimientoPE[]
  // Reorden de secuencia vía drag-and-drop. Padre persiste en memoria.
  onReorderSecuencia?: (nuevaSecuencia: FaseSecuenciaPE[]) => void
  // Re-iterar: padre llama al endpoint /generar con numero+1. Solo si hay
  // disconformidades con razón Y numero < 3.
  onReIterar?: (disconformidades: DisconformidadMarcada[]) => void
  // Aceptar: padre llama al endpoint /iteracion (PATCH iteracion_aceptada).
  onAceptar?: () => void
  saving?: boolean
  onCerrar: () => void
}

type Marca = { marca: 'ok' | 'no'; razon: string }

export function BorradorVista(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ iteracion, movimientos, onReorderSecuencia, onReIterar, onAceptar, saving, onCerrar }: Props) {
  const [secuencia, setSecuencia] = useState<FaseSecuenciaPE[]>(iteracion.secuencia_movimientos)
  // Marcas por elemento. Reset al cambiar iteración (nueva propuesta = empezar de cero).
  const [marcas, setMarcas] = useState<Map<string, Marca>>(new Map())

  useEffect(() => {
    setSecuencia(iteracion.secuencia_movimientos)
    setMarcas(new Map())
  }, [iteracion])

  const movimientosById = useMemo(() => {
    const m = new Map<string, MovimientoPE>()
    for (const mov of movimientos) m.set(mov.id, mov)
    return m
  }, [movimientos])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, saving])

  function setMarca(elementoId: string, parcial: Partial<Marca>) {
    setMarcas(prev => {
      const next = new Map(prev)
      const actual = next.get(elementoId) ?? { marca: 'ok', razon: '' }
      next.set(elementoId, { ...actual, ...parcial })
      return next
    })
  }

  function moveMovimiento(movId: string, origenIdx: number, destinoIdx: number) {
    if (origenIdx === destinoIdx) return
    const nueva = secuencia.map((f, i) => {
      if (i === origenIdx) return { ...f, movimientos: f.movimientos.filter(id => id !== movId) }
      if (i === destinoIdx && !f.movimientos.includes(movId)) return { ...f, movimientos: [...f.movimientos, movId] }
      return f
    })
    setSecuencia(nueva)
    onReorderSecuencia?.(nueva)
  }

  // Detectar si la secuencia fue reordenada (para sumarla como disconformidad implícita).
  const secuenciaReordenada = useMemo(() => {
    const orig = iteracion.secuencia_movimientos
    if (orig.length !== secuencia.length) return true
    for (let i = 0; i < orig.length; i++) {
      const a = orig[i].movimientos ?? []
      const b = secuencia[i].movimientos ?? []
      if (a.length !== b.length) return true
      for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return true
    }
    return false
  }, [iteracion.secuencia_movimientos, secuencia])

  // Disconformidades a enviar: marcas "no" con razón + reorden de secuencia si cambió.
  const disconformidadesAEnviar: DisconformidadMarcada[] = useMemo(() => {
    const out: DisconformidadMarcada[] = []
    for (const [elementoId, m] of marcas.entries()) {
      if (m.marca === 'no' && m.razon.trim()) {
        out.push({
          elemento: elementoId,
          elementoLabel: getLabel(iteracion, elementoId),
          razon: m.razon.trim(),
        })
      }
    }
    if (secuenciaReordenada) {
      out.push({
        elemento: 'secuencia_movimientos:reorder',
        elementoLabel: 'Secuencia de movimientos (reorden manual del usuario)',
        razon: `El usuario reordenó las fases manualmente. Nueva secuencia propuesta: ${JSON.stringify(secuencia.map(f => ({ fase: f.fase, movimientos: f.movimientos })))}`,
      })
    }
    return out
  }, [marcas, secuenciaReordenada, secuencia, iteracion])

  const puedeReIterar = iteracion.numero < 3 && disconformidadesAEnviar.length > 0
  const enMaxIteracion = iteracion.numero >= 3

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !saving && onCerrar()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Sub-bloque 3.C · Borrador del plan
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-foreground">
              Iteración <span className="text-primary">{iteracion.numero}</span> de 3
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Generado {new Date(iteracion.generado_en).toLocaleString('es-AR')} · ${iteracion.costo_usd.toFixed(2)} USD · {(iteracion.latencia_ms / 1000).toFixed(0)}s
            </p>
          </div>
          <button
            onClick={onCerrar}
            disabled={saving}
            aria-label="Cerrar"
            className="rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 p-1 text-[16px] leading-none disabled:opacity-40"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <Seccion titulo="1. Contexto">
            <ItemMarcable
              elementoId="contexto"
              marca={marcas.get('contexto')}
              onMarcar={setMarca}
            >
              <p className="text-[14px] text-foreground/95 leading-relaxed whitespace-pre-wrap">{iteracion.contexto}</p>
            </ItemMarcable>
          </Seccion>

          <Seccion titulo={`2. Decisiones de priorización (${iteracion.decisiones_priorizacion.length})`}>
            <ul className="space-y-3">
              {iteracion.decisiones_priorizacion.map((d, i) => (
                <li key={i}>
                  <ItemMarcable
                    elementoId={`decision:${i}`}
                    marca={marcas.get(`decision:${i}`)}
                    onMarcar={setMarca}
                  >
                    <p className="text-[13px] font-semibold text-foreground leading-snug">{i + 1}. {d.decision}</p>
                    <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed">
                      <span className="uppercase tracking-wider text-[10px] text-muted-foreground/80">Razón:</span> {d.razon}
                    </p>
                    {d.alternativas_descartadas?.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground/80 italic">
                        Descartadas: {d.alternativas_descartadas.join(' · ')}
                      </p>
                    )}
                  </ItemMarcable>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion
            titulo={`3. Secuencia de movimientos (${secuencia.length} fases)`}
            subtitulo={onReorderSecuencia ? '↔ Arrastrá un M-X entre fases para reordenar. El reorden cuenta como disconformidad al re-iterar.' : undefined}
          >
            <Timeline
              secuencia={secuencia}
              movimientosById={movimientosById}
              draggable={!!onReorderSecuencia}
              onMover={moveMovimiento}
              marcas={marcas}
              setMarca={setMarca}
            />
          </Seccion>

          <Seccion titulo={`4. Supuestos críticos (${iteracion.supuestos_criticos.length})`}>
            <ul className="space-y-2">
              {iteracion.supuestos_criticos.map((s, i) => (
                <li key={i}>
                  <ItemMarcable
                    elementoId={`supuesto:${i}`}
                    marca={marcas.get(`supuesto:${i}`)}
                    onMarcar={setMarca}
                    skin="amber"
                  >
                    <p className="text-[13px] text-amber-100 leading-snug">
                      <span className="font-semibold text-amber-200">⚠ Supuesto {i + 1}:</span> {s}
                    </p>
                  </ItemMarcable>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="5. Criterio de éxito">
            <div className="space-y-2.5">
              <ItemMarcable elementoId="criterio:pleno" marca={marcas.get('criterio:pleno')} onMarcar={setMarca} skin="green">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-green-300/80">Pleno</p>
                <p className="mt-1 text-[13px] text-green-100 leading-snug">{iteracion.criterio_exito.pleno}</p>
              </ItemMarcable>
              <ItemMarcable elementoId="criterio:minimo" marca={marcas.get('criterio:minimo')} onMarcar={setMarca} skin="yellow">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-300/80">Mínimo aceptable</p>
                <p className="mt-1 text-[13px] text-yellow-100 leading-snug">{iteracion.criterio_exito.minimo}</p>
              </ItemMarcable>
              <ItemMarcable elementoId="criterio:path_minimo" marca={marcas.get('criterio:path_minimo')} onMarcar={setMarca} skin="blue">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-300/80">Path mínimo</p>
                <p className="mt-1 text-[13px] text-blue-100 leading-snug">{iteracion.criterio_exito.path_minimo}</p>
              </ItemMarcable>
            </div>
          </Seccion>

          <Seccion titulo={`6. Alternativas descartadas (${iteracion.alternativas_descartadas.length})`}>
            <ul className="space-y-2">
              {iteracion.alternativas_descartadas.map((a, i) => (
                <li key={i}>
                  <ItemMarcable
                    elementoId={`alternativa:${i}`}
                    marca={marcas.get(`alternativa:${i}`)}
                    onMarcar={setMarca}
                  >
                    <p className="text-[13px] font-semibold text-foreground/90 leading-snug">✗ {a.decision}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">{a.razon}</p>
                  </ItemMarcable>
                </li>
              ))}
            </ul>
          </Seccion>
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">
              {disconformidadesAEnviar.length === 0
                ? 'Sin disconformidades marcadas — si todo te cierra, aceptá el borrador.'
                : `${disconformidadesAEnviar.length} disconformidad(es) marcada(s).`}
            </p>
            {enMaxIteracion && (
              <p className="text-[10px] italic text-yellow-300/80">
                Iteración 3/3 — última. Si seguís disconforme, volvé a 3.A o 3.B.
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onCerrar}
              disabled={saving}
              className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50 disabled:opacity-40"
            >
              Cerrar
            </button>
            {onReIterar && (
              <button
                onClick={() => onReIterar(disconformidadesAEnviar)}
                disabled={saving || !puedeReIterar}
                title={
                  enMaxIteracion ? 'Ya estás en iteración 3 — última permitida.' :
                  disconformidadesAEnviar.length === 0 ? 'Marcá al menos 1 disconformidad con razón.' :
                  `Re-iterar con ${disconformidadesAEnviar.length} disconformidad(es) → genera iteración ${iteracion.numero + 1}/3`
                }
                className="rounded-md bg-amber-700 hover:bg-amber-600 px-3 py-1.5 text-[13px] font-semibold text-amber-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Generando…' : `Re-iterar con disconformidades (→ ${iteracion.numero + 1}/3)`}
              </button>
            )}
            {onAceptar && (
              <button
                onClick={onAceptar}
                disabled={saving}
                title="Aceptar este borrador y avanzar a 3.D"
                className="rounded-md bg-primary hover:bg-primary/90 px-4 py-1.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Guardando…' : 'Aceptar borrador →'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function Seccion({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5">
        <h3 className="text-[15px] font-semibold text-foreground">{titulo}</h3>
        {subtitulo && <p className="mt-0.5 text-[11px] text-muted-foreground italic">{subtitulo}</p>}
      </div>
      {children}
    </section>
  )
}

// Wrapper que renderiza el contenido + toggle OK/No me cierra + razón inline.
// Convención de skins: default (gris), amber (supuestos), green/yellow/blue (criterios).
function ItemMarcable({
  elementoId,
  marca,
  onMarcar,
  skin = 'default',
  children,
}: {
  elementoId: string
  marca?: Marca
  onMarcar: (elementoId: string, parcial: Partial<Marca>) => void
  skin?: 'default' | 'amber' | 'green' | 'yellow' | 'blue'
  children: React.ReactNode
}) {
  const skinClass =
    skin === 'amber' ? 'border-amber-700/40 bg-amber-950/20' :
    skin === 'green' ? 'border-green-700/50 bg-green-950/30' :
    skin === 'yellow' ? 'border-yellow-700/50 bg-yellow-950/30' :
    skin === 'blue' ? 'border-blue-700/50 bg-blue-950/30' :
    'border-sidebar-border bg-sidebar/30'

  const esNoMeCierra = marca?.marca === 'no'

  return (
    <div className={`rounded-lg border ${skinClass} ${esNoMeCierra ? 'ring-2 ring-amber-500/40' : ''} px-4 py-3 transition-all`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">{children}</div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onMarcar(elementoId, { marca: 'ok', razon: '' })}
            title="Esta sección te cierra OK"
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              marca?.marca === 'ok'
                ? 'bg-green-600 text-green-50'
                : 'bg-transparent border border-sidebar-border text-muted-foreground hover:bg-accent/30'
            }`}
          >
            ✓ OK
          </button>
          <button
            type="button"
            onClick={() => onMarcar(elementoId, { marca: 'no' })}
            title="Marcá si no te cierra y agregá razón"
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              esNoMeCierra
                ? 'bg-amber-600 text-amber-50'
                : 'bg-transparent border border-sidebar-border text-muted-foreground hover:bg-accent/30'
            }`}
          >
            ✕ No me cierra
          </button>
        </div>
      </div>
      {esNoMeCierra && (
        <div className="mt-3">
          <textarea
            value={marca?.razon ?? ''}
            onChange={e => onMarcar(elementoId, { razon: e.target.value })}
            placeholder="Razón breve — qué te llevó a marcarlo. Va al modelo en la próxima iteración."
            rows={2}
            className="w-full resize-y rounded-md border border-amber-700/40 bg-amber-950/30 px-2 py-1.5 text-[12px] text-amber-50 placeholder:text-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-500 min-h-[48px]"
          />
        </div>
      )}
    </div>
  )
}

function Timeline({
  secuencia,
  movimientosById,
  draggable,
  onMover,
  marcas,
  setMarca,
}: {
  secuencia: FaseSecuenciaPE[]
  movimientosById: Map<string, MovimientoPE>
  draggable: boolean
  onMover: (movId: string, origenIdx: number, destinoIdx: number) => void
  marcas: Map<string, Marca>
  setMarca: (elementoId: string, parcial: Partial<Marca>) => void
}) {
  const [dragSrc, setDragSrc] = useState<{ movId: string; faseIdx: number } | null>(null)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      {secuencia.map((fase, idx) => {
        const isDropTarget = dropTargetIdx === idx && dragSrc !== null && dragSrc.faseIdx !== idx
        const elementoId = `fase:${idx}`
        return (
          <div
            key={idx}
            onDragOver={draggable ? e => {
              if (!dragSrc) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropTargetIdx(idx)
            } : undefined}
            onDragLeave={draggable ? () => {
              setDropTargetIdx(prev => prev === idx ? null : prev)
            } : undefined}
            onDrop={draggable ? e => {
              e.preventDefault()
              if (!dragSrc) return
              onMover(dragSrc.movId, dragSrc.faseIdx, idx)
              setDragSrc(null)
              setDropTargetIdx(null)
            } : undefined}
          >
            <ItemMarcable
              elementoId={elementoId}
              marca={marcas.get(elementoId)}
              onMarcar={setMarca}
            >
              <div className={`transition-all ${isDropTarget ? 'ring-2 ring-blue-500/50 rounded-md p-1 -m-1' : ''}`}>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <p className="text-[13px] font-semibold text-foreground">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mr-2">F{idx + 1}</span>
                    {fase.fase}
                  </p>
                  <p className="text-[10px] text-muted-foreground italic">{fase.movimientos.length} mov.</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug mb-2">{fase.razon_secuencia}</p>
                <div className="flex flex-wrap gap-1.5">
                  {fase.movimientos.map(movId => {
                    const mov = movimientosById.get(movId)
                    const isDragging = dragSrc?.movId === movId
                    return (
                      <div
                        key={movId}
                        draggable={draggable}
                        onDragStart={draggable ? e => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', movId)
                          setDragSrc({ movId, faseIdx: idx })
                        } : undefined}
                        onDragEnd={draggable ? () => {
                          setDragSrc(null)
                          setDropTargetIdx(null)
                        } : undefined}
                        title={mov ? `${mov.nombre} — ${mov.dueno}` : movId}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-all ${
                          draggable ? 'cursor-move' : 'cursor-default'
                        } ${
                          isDragging
                            ? 'border-blue-500 bg-blue-950/60 opacity-50'
                            : 'border-sidebar-border bg-background hover:bg-accent/40'
                        }`}
                      >
                        <span className="font-mono font-semibold text-foreground/80">{movId}</span>
                        {mov && <span className="text-foreground/70 max-w-[200px] truncate">{mov.nombre}</span>}
                      </div>
                    )
                  })}
                  {fase.movimientos.length === 0 && (
                    <p className="text-[11px] italic text-muted-foreground/60 py-2">(vacía — arrastrá un M-X acá)</p>
                  )}
                </div>
              </div>
            </ItemMarcable>
          </div>
        )
      })}
    </div>
  )
}

// Traduce un elementoId a un texto humano que va al payload del endpoint
// /paso3/borrador/generar para que Opus entienda qué marcó el usuario.
function getLabel(iteracion: BorradorIteracionPE, elementoId: string): string {
  if (elementoId === 'contexto') return 'Sección 1: contexto'
  if (elementoId.startsWith('decision:')) {
    const i = parseInt(elementoId.split(':')[1], 10)
    const d = iteracion.decisiones_priorizacion[i]
    return `Decisión #${i + 1}: ${d?.decision?.slice(0, 100) ?? ''}`
  }
  if (elementoId.startsWith('fase:')) {
    const i = parseInt(elementoId.split(':')[1], 10)
    const f = iteracion.secuencia_movimientos[i]
    return `Fase ${i + 1} "${f?.fase}": [${(f?.movimientos ?? []).join(', ')}]`
  }
  if (elementoId.startsWith('supuesto:')) {
    const i = parseInt(elementoId.split(':')[1], 10)
    return `Supuesto crítico #${i + 1}: ${iteracion.supuestos_criticos[i]?.slice(0, 100) ?? ''}`
  }
  if (elementoId === 'criterio:pleno') return `Criterio de éxito - pleno: ${iteracion.criterio_exito.pleno.slice(0, 80)}`
  if (elementoId === 'criterio:minimo') return `Criterio de éxito - mínimo: ${iteracion.criterio_exito.minimo.slice(0, 80)}`
  if (elementoId === 'criterio:path_minimo') return `Criterio de éxito - path mínimo: ${iteracion.criterio_exito.path_minimo.slice(0, 80)}`
  if (elementoId.startsWith('alternativa:')) {
    const i = parseInt(elementoId.split(':')[1], 10)
    const a = iteracion.alternativas_descartadas[i]
    return `Alternativa descartada #${i + 1}: ${a?.decision?.slice(0, 100) ?? ''}`
  }
  return elementoId
}
