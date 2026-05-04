'use client'

// Modal de revisión de inventario por categoría (Sub-bloque 3.A del Paso 3).
//
// UX: el usuario revisa los movimientos del inventario UNA categoría a la vez.
// Para cada movimiento: Aceptar / Editar / Quitar. Persistencia inmediata vía
// PATCH /paso3/inventario/decision.
//
// Header: contador "Categoría X de N · Y de Z movimientos procesados".
// Footer: botón "Cerrar categoría y avanzar" se habilita cuando todos los
// movimientos de la categoría tienen decisión (no quedan en 'pendiente').
// Al cerrar última categoría: "Cerrar Inventario y avanzar a 3.B".

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { InventarioPE, MovimientoPE, PlanEstrategico } from '@/lib/types'

interface Props {
  planId: string
  plan: PlanEstrategico
  inventario: InventarioPE
  onInventarioUpdate: (inv: InventarioPE) => void
  onCerrarInventario: () => void  // dispara cierre formal de 3.A
}

export function InventarioCategoria({ planId, plan, inventario, onInventarioUpdate, onCerrarInventario }: Props) {
  // Categorías únicas detectadas en orden de aparición
  const categorias = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const m of inventario.movimientos) {
      if (!seen.has(m.categoria)) {
        seen.add(m.categoria)
        ordered.push(m.categoria)
      }
    }
    return ordered
  }, [inventario.movimientos])

  const [categoriaIdx, setCategoriaIdx] = useState(0)
  const [editando, setEditando] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (categorias.length === 0) {
    return (
      <ModalShell onClose={() => {}}>
        <p className="text-[14px] text-muted-foreground">El inventario no tiene categorías. Algo salió mal en la generación.</p>
      </ModalShell>
    )
  }

  const categoriaActual = categorias[categoriaIdx]
  const movsCategoria = inventario.movimientos.filter(m => m.categoria === categoriaActual)
  const procesados = movsCategoria.filter(m => m.estado_usuario !== 'pendiente').length
  const totalCat = movsCategoria.length
  const todosProcesados = procesados === totalCat
  const esUltimaCategoria = categoriaIdx === categorias.length - 1

  // Brecha de la categoría — primera métrica del propósito que matchee la categoría (heurística simple)
  const propMetricas = plan.proposito?.metricas ?? []

  async function aplicarDecision(movimientoId: string, estado: 'aceptado' | 'editado' | 'quitado', patch?: Partial<MovimientoPE>) {
    setSavingId(movimientoId)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id: movimientoId, estado, patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onInventarioUpdate(data.inventario_actualizado)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingId(null)
      setEditando(null)
    }
  }

  async function cerrarCategoriaYAvanzar() {
    // Persist resumen + avanzar
    const aceptados = movsCategoria.filter(m => m.estado_usuario === 'aceptado').length
    const editados = movsCategoria.filter(m => m.estado_usuario === 'editado').length
    const quitados = movsCategoria.filter(m => m.estado_usuario === 'quitado').length
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria: categoriaActual, aceptados, editados, quitados }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onInventarioUpdate(data.inventario_actualizado)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    if (esUltimaCategoria) {
      onCerrarInventario()
    } else {
      setCategoriaIdx(idx => idx + 1)
    }
  }

  return (
    <ModalShell onClose={() => {}}>
      <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Sub-bloque 3.A · Inventario · Categoría {categoriaIdx + 1} de {categorias.length}
        </p>
        <h2 className="mt-1 text-[18px] font-semibold text-foreground">{categoriaActual}</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {procesados} de {totalCat} movimientos procesados
        </p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-sidebar-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${totalCat > 0 ? (procesados / totalCat) * 100 : 0}%` }}
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Brecha de la categoría — sección Brecha mencionada en el cuestionario 3.A */}
        {propMetricas.length > 0 && (
          <BrechaCategoria proposito={plan.proposito} situacion={plan.situacion} />
        )}

        {/* Movimientos */}
        <section>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
            Movimientos propuestos ({totalCat})
          </h3>
          <div className="space-y-3">
            {movsCategoria.map(m => (
              <MovimientoCard
                key={m.id}
                movimiento={m}
                editando={editando === m.id}
                saving={savingId === m.id}
                onAceptar={() => aplicarDecision(m.id, 'aceptado')}
                onEditar={() => setEditando(m.id)}
                onQuitar={() => aplicarDecision(m.id, 'quitado')}
                onGuardarEdicion={(patch) => aplicarDecision(m.id, 'editado', patch)}
                onCancelarEdicion={() => setEditando(null)}
              />
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-700 bg-red-950/50 px-4 py-3 text-[13px] text-red-200">
            <p className="font-semibold mb-1">Error</p>
            <p>{error}</p>
          </div>
        )}
      </div>

      <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {todosProcesados
            ? '✓ Todos procesados'
            : `Faltan decidir ${totalCat - procesados} movimiento${(totalCat - procesados) === 1 ? '' : 's'}`}
        </p>
        <button
          onClick={cerrarCategoriaYAvanzar}
          disabled={!todosProcesados}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {esUltimaCategoria ? 'Cerrar Inventario y avanzar a 3.B' : 'Cerrar categoría y avanzar →'}
        </button>
      </footer>
    </ModalShell>
  )
}

function BrechaCategoria({ proposito, situacion }: { proposito?: any; situacion?: any }) {
  if (!proposito?.metricas?.length) return null
  return (
    <details className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3">
      <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        Brecha que esta categoría tiene que cerrar
      </summary>
      <div className="mt-3 space-y-2">
        {proposito.metricas.map((m: any, i: number) => (
          <div key={i} className="text-[12px] text-foreground/90">
            <p className="font-medium">{m.metrica}</p>
            <p className="mt-0.5 text-muted-foreground">
              <span className="font-mono text-[11px]">FROM:</span> {m.valor_actual || '(sin baseline)'}
              {' → '}
              <span className="font-mono text-[11px]">TO:</span> {m.valor_objetivo}
            </p>
          </div>
        ))}
        {situacion?.desvio_principal && (
          <p className="mt-2 pt-2 border-t border-sidebar-border text-[11px] text-muted-foreground italic">
            Desvío principal: {situacion.desvio_principal}
          </p>
        )}
      </div>
    </details>
  )
}

function MovimientoCard({
  movimiento,
  editando,
  saving,
  onAceptar,
  onEditar,
  onQuitar,
  onGuardarEdicion,
  onCancelarEdicion,
}: {
  movimiento: MovimientoPE
  editando: boolean
  saving: boolean
  onAceptar: () => void
  onEditar: () => void
  onQuitar: () => void
  onGuardarEdicion: (patch: Partial<MovimientoPE>) => void
  onCancelarEdicion: () => void
}) {
  const [draftNombre, setDraftNombre] = useState(movimiento.nombre)
  const [draftQueResuelve, setDraftQueResuelve] = useState(movimiento.que_resuelve)
  const [draftDueno, setDraftDueno] = useState(movimiento.dueno)
  const [draftCriterio, setDraftCriterio] = useState(movimiento.criterio_exito)

  const estado = movimiento.estado_usuario
  const colorEstado =
    estado === 'aceptado' ? 'border-green-700/50 bg-green-950/20' :
    estado === 'editado' ? 'border-blue-700/50 bg-blue-950/20' :
    estado === 'quitado' ? 'border-gray-700/50 bg-gray-950/30 opacity-50' :
    'border-sidebar-border bg-sidebar/30'

  if (editando) {
    return (
      <div className={`rounded-lg border-2 border-blue-700 bg-blue-950/30 px-4 py-3 space-y-3`}>
        <Field label="Nombre" value={draftNombre} onChange={setDraftNombre} />
        <Field label="Qué resuelve" value={draftQueResuelve} onChange={setDraftQueResuelve} multiline />
        <Field label="Dueño" value={draftDueno} onChange={setDraftDueno} />
        <Field label="Criterio de éxito" value={draftCriterio} onChange={setDraftCriterio} multiline />
        <div className="flex gap-2 justify-end pt-2 border-t border-blue-800/50">
          <button
            onClick={onCancelarEdicion}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-3 py-1 text-[12px] hover:bg-accent/50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={() => onGuardarEdicion({
              nombre: draftNombre,
              que_resuelve: draftQueResuelve,
              dueno: draftDueno,
              criterio_exito: draftCriterio,
            })}
            disabled={saving}
            className="rounded-md bg-blue-700 px-3 py-1 text-[12px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar edición'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border ${colorEstado} px-4 py-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10px] text-muted-foreground/70">{movimiento.id}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              movimiento.costo_banda_ancha === 'alta' ? 'bg-red-950/50 text-red-300 border border-red-800/50' :
              movimiento.costo_banda_ancha === 'media' ? 'bg-yellow-950/50 text-yellow-300 border border-yellow-800/50' :
              'bg-green-950/50 text-green-300 border border-green-800/50'
            }`}>
              banda {movimiento.costo_banda_ancha}
            </span>
            {estado !== 'pendiente' && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-foreground/70">
                {estado}
              </span>
            )}
          </div>
          <h4 className="text-[14px] font-semibold text-foreground">{movimiento.nombre}</h4>
        </div>
      </div>

      <div className="mt-2 space-y-1.5 text-[12px]">
        <Linea label="Qué resuelve" valor={movimiento.que_resuelve} />
        <Linea label="Ataca desvío" valor={movimiento.ataca_desvio} />
        <Linea label="Dueño" valor={movimiento.dueno} />
        <Linea label="Ventana" valor={`${movimiento.ventana_temporal.arranca} → ${movimiento.ventana_temporal.termina}`} />
        <Linea label="Costo USD" valor={`$${movimiento.costo_monetario.rango_min_usd.toLocaleString()} - $${movimiento.costo_monetario.rango_max_usd.toLocaleString()}${movimiento.costo_monetario.nota ? ` · ${movimiento.costo_monetario.nota}` : ''}`} />
        {movimiento.precondiciones.length > 0 && (
          <Linea label="Precondiciones" valor={movimiento.precondiciones.join(', ')} />
        )}
        {movimiento.desbloquea.length > 0 && (
          <Linea label="Desbloquea" valor={movimiento.desbloquea.join(', ')} />
        )}
        <Linea label="Criterio éxito" valor={movimiento.criterio_exito} />
      </div>

      {estado === 'pendiente' && (
        <div className="mt-3 pt-3 border-t border-sidebar-border flex gap-2 justify-end">
          <button
            onClick={onAceptar}
            disabled={saving}
            className="rounded-md bg-green-700 px-3 py-1 text-[12px] font-semibold text-white hover:bg-green-600 disabled:opacity-40 transition-colors"
          >
            ✓ Aceptar
          </button>
          <button
            onClick={onEditar}
            disabled={saving}
            className="rounded-md bg-blue-700 px-3 py-1 text-[12px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 transition-colors"
          >
            ✎ Editar
          </button>
          <button
            onClick={onQuitar}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-3 py-1 text-[12px] text-muted-foreground hover:bg-accent/50 disabled:opacity-40 transition-colors"
          >
            ✕ Quitar
          </button>
        </div>
      )}
    </div>
  )
}

function Linea({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="leading-snug">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-2">{label}:</span>
      <span className="text-foreground/90">{valor}</span>
    </p>
  )
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      )}
    </div>
  )
}

// Modal con createPortal para escapar cascada CSS de pe-vista-root.
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 font-sans"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] max-h-[900px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
