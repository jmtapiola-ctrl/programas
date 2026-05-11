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
  const [agregando, setAgregando] = useState(false)
  const [savingNuevo, setSavingNuevo] = useState(false)
  // Estado del flow de inferencia de dependencias post-Agregar:
  // null = no hay inferencia activa
  // { movId, status: 'inferring' } = llamando al endpoint
  // { movId, status: 'ready', propuesta } = modal abierto, user revisa
  const [inferencia, setInferencia] = useState<
    | null
    | { movId: string; status: 'inferring' }
    | { movId: string; status: 'ready'; propuesta: { precondiciones: string[]; desbloquea: string[]; tipo_dependencia: 'dura' | 'blanda' | 'ninguna'; razonamiento: string } }
  >(null)

  if (categorias.length === 0) {
    return (
      <ModalShell onClose={() => {}}>
        <p className="text-[19px] text-muted-foreground">El inventario no tiene categorías. Algo salió mal en la generación.</p>
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

  async function handleAgregarMovimiento(nuevoMovimiento: Omit<MovimientoPE, 'id' | 'estado_usuario'>) {
    setSavingNuevo(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agregar: { categoria: categoriaActual, movimiento: nuevoMovimiento },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      const invActualizado = data.inventario_actualizado
      onInventarioUpdate(invActualizado)
      setAgregando(false)

      // Disparar inferencia de dependencias para el movimiento recién agregado.
      // El id se asigna server-side; lo extraemos del inventario actualizado
      // como el último movimiento con la categoría y nombre que pasamos.
      const recien = [...invActualizado.movimientos]
        .reverse()
        .find((m: MovimientoPE) => m.categoria === categoriaActual && m.nombre === nuevoMovimiento.nombre)
      if (recien) {
        setInferencia({ movId: recien.id, status: 'inferring' })
        try {
          const inf = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/inferir-dependencias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ movimiento_id: recien.id }),
          })
          const infData = await inf.json()
          if (!inf.ok) throw new Error(infData?.error ?? `HTTP ${inf.status}`)
          setInferencia({ movId: recien.id, status: 'ready', propuesta: infData.propuesta })
        } catch (e) {
          // Si la inferencia falla, no bloquear — el movimiento se agregó OK,
          // solo no proponemos dependencias. Banner discreto.
          console.warn('[InventarioCategoria] inferencia de dependencias falló:', e)
          setError(`Movimiento agregado, pero no se pudieron inferir dependencias: ${e instanceof Error ? e.message : String(e)}. Podés editarlas manualmente más tarde.`)
          setInferencia(null)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingNuevo(false)
    }
  }

  async function handleConfirmarDependencias(precondiciones: string[], desbloquea: string[], tipo_dependencia: 'dura' | 'blanda' | 'ninguna') {
    if (!inferencia || inferencia.status !== 'ready') return
    const movId = inferencia.movId
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movimiento_id: movId,
          // Mantener el estado actual del movimiento (aceptado, porque los custom arrancan así)
          estado: 'aceptado',
          patch: { precondiciones, desbloquea, tipo_dependencia },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onInventarioUpdate(data.inventario_actualizado)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setInferencia(null)
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
        <p className="text-[15px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Sub-bloque 3.A · Inventario · Categoría {categoriaIdx + 1} de {categorias.length}
        </p>
        <h2 className="mt-1 text-[25px] font-semibold text-foreground">{categoriaActual}</h2>
        <p className="mt-1 text-[16px] text-muted-foreground">
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
          <h3 className="text-[17px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
            Movimientos propuestos ({totalCat})
          </h3>
          <div className="space-y-3">
            {movsCategoria.map(m => (
              <MovimientoCard
                key={m.id}
                movimiento={m}
                allMovimientos={inventario.movimientos}
                editando={editando === m.id}
                saving={savingId === m.id}
                onAceptar={() => aplicarDecision(m.id, 'aceptado')}
                onEditar={() => setEditando(m.id)}
                onQuitar={() => aplicarDecision(m.id, 'quitado')}
                onGuardarEdicion={(patch) => aplicarDecision(m.id, 'editado', patch)}
                onCancelarEdicion={() => setEditando(null)}
              />
            ))}

            {/* Agregar movimiento custom (modo del cuestionario 3.A:
                "agregar movimientos que YO no detecté pero VOS sí ves") */}
            {agregando ? (
              <NuevoMovimientoForm
                categoria={categoriaActual}
                saving={savingNuevo}
                onGuardar={handleAgregarMovimiento}
                onCancelar={() => setAgregando(false)}
              />
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setAgregando(true)}
                  className="w-full rounded-lg border-2 border-dashed border-red-700 bg-red-950/20 px-4 pt-4 pb-2 text-[18px] font-semibold text-red-300 hover:bg-red-900/40 hover:border-red-500 hover:text-red-100 transition-colors flex flex-col items-center gap-1"
                >
                  <span>+ AGREGAR MOVIMIENTO</span>
                  <span className="text-[12px] font-normal opacity-80">(Nuevo movimiento que achica la brecha)</span>
                </button>
                <p className="text-[15px] text-foreground text-center px-4 leading-relaxed">
                  Agregá tantos movimientos como creas necesarios hasta que sientas que son SUFICIENTES para eliminar la brecha enunciada arriba.
                </p>
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-700 bg-red-950/50 px-4 py-3 text-[17px] text-red-200">
            <p className="font-semibold mb-1">Error</p>
            <p>{error}</p>
          </div>
        )}
      </div>

      <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">
          {todosProcesados
            ? '✓ Todos procesados'
            : `Faltan decidir ${totalCat - procesados} movimiento${(totalCat - procesados) === 1 ? '' : 's'}`}
        </p>
        <button
          onClick={cerrarCategoriaYAvanzar}
          disabled={!todosProcesados}
          className="rounded-lg border border-sidebar-border bg-sidebar/60 px-3 py-2 text-[13px] font-medium text-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent/60 transition-colors"
        >
          {esUltimaCategoria ? 'Cerrar Inventario y avanzar a 3.B →' : 'Cerrar categoría y avanzar →'}
        </button>
      </footer>

      {/* Sub-modal de inferencia de dependencias post-Agregar.
          Aparece encima del modal principal cuando el flow lo dispara. */}
      {inferencia?.status === 'inferring' && (
        <InferenciaLoadingOverlay />
      )}
      {inferencia?.status === 'ready' && (
        <ConfirmarDependenciasModal
          movimientoNuevo={inventario.movimientos.find(m => m.id === inferencia.movId)!}
          allMovimientos={inventario.movimientos}
          propuesta={inferencia.propuesta}
          onConfirmar={handleConfirmarDependencias}
          onCancelar={() => setInferencia(null)}
        />
      )}
    </ModalShell>
  )
}

// Overlay simple "Inferiendo dependencias..." mientras Opus procesa.
function InferenciaLoadingOverlay() {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm font-sans">
      <div className="rounded-xl border border-sidebar-border bg-background px-8 py-6 shadow-2xl text-center space-y-3">
        <div className="flex justify-center">
          <span className="inline-flex gap-1 items-center">
            <span className="animate-bounce delay-0 h-2 w-2 rounded-full bg-primary" />
            <span className="animate-bounce delay-150 h-2 w-2 rounded-full bg-primary" />
            <span className="animate-bounce delay-300 h-2 w-2 rounded-full bg-primary" />
          </span>
        </div>
        <p className="text-[15px] font-semibold text-foreground">Analizando dependencias…</p>
        <p className="text-[12px] text-muted-foreground max-w-xs">
          Estoy revisando el resto del inventario para proponer precondiciones y desbloqueos del nuevo movimiento.
          Tarda 10-20s.
        </p>
      </div>
    </div>,
    document.body,
  )
}

// Modal de confirmación de dependencias propuestas. Cada dependencia es
// un checkbox que el user puede aceptar o rechazar individualmente. También
// permite cambiar el tipo_dependencia (dura/blanda/ninguna).
function ConfirmarDependenciasModal({
  movimientoNuevo,
  allMovimientos,
  propuesta,
  onConfirmar,
  onCancelar,
}: {
  movimientoNuevo: MovimientoPE
  allMovimientos: MovimientoPE[]
  propuesta: { precondiciones: string[]; desbloquea: string[]; tipo_dependencia: 'dura' | 'blanda' | 'ninguna'; razonamiento: string }
  onConfirmar: (precondiciones: string[], desbloquea: string[], tipo_dependencia: 'dura' | 'blanda' | 'ninguna') => void
  onCancelar: () => void
}) {
  const [preSel, setPreSel] = useState<Set<string>>(new Set(propuesta.precondiciones))
  const [desSel, setDesSel] = useState<Set<string>>(new Set(propuesta.desbloquea))
  const [tipoDep, setTipoDep] = useState<'dura' | 'blanda' | 'ninguna'>(propuesta.tipo_dependencia)

  function toggle(setter: typeof setPreSel, set: Set<string>, id: string) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
  }

  function nombre(id: string): string {
    return allMovimientos.find(m => m.id === id)?.nombre ?? '(no encontrado)'
  }

  if (typeof document === 'undefined') return null

  const tieneAlgo = propuesta.precondiciones.length > 0 || propuesta.desbloquea.length > 0

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={onCancelar}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Dependencias propuestas para
          </p>
          <h2 className="mt-1 text-[16px] font-semibold text-foreground">
            {movimientoNuevo.id} "{movimientoNuevo.nombre}"
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!tieneAlgo && (
            <p className="text-[14px] text-muted-foreground italic">
              No detecté dependencias claras con el resto del inventario. El movimiento parece independiente.
              Podés confirmar sin dependencias o cancelar y editarlas manualmente más tarde.
            </p>
          )}

          {propuesta.razonamiento && (
            <div className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
                Razonamiento del modelo
              </p>
              <p className="text-[13px] text-foreground/90 leading-relaxed">{propuesta.razonamiento}</p>
            </div>
          )}

          {propuesta.precondiciones.length > 0 && (
            <section>
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
                Precondiciones (movimientos que tienen que terminar antes)
              </h3>
              <div className="space-y-1.5">
                {propuesta.precondiciones.map(id => (
                  <label key={id} className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-sidebar/30">
                    <input
                      type="checkbox"
                      checked={preSel.has(id)}
                      onChange={() => toggle(setPreSel, preSel, id)}
                      className="mt-1"
                    />
                    <span className="text-[13px] text-foreground/90">
                      <span className="font-mono text-[12px] text-muted-foreground/80">{id}</span>{' '}
                      "{nombre(id)}"
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {propuesta.desbloquea.length > 0 && (
            <section>
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
                Desbloquea (movimientos que quedan más fáciles cuando este termine)
              </h3>
              <div className="space-y-1.5">
                {propuesta.desbloquea.map(id => (
                  <label key={id} className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-sidebar/30">
                    <input
                      type="checkbox"
                      checked={desSel.has(id)}
                      onChange={() => toggle(setDesSel, desSel, id)}
                      className="mt-1"
                    />
                    <span className="text-[13px] text-foreground/90">
                      <span className="font-mono text-[12px] text-muted-foreground/80">{id}</span>{' '}
                      "{nombre(id)}"
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {preSel.size > 0 && (
            <section>
              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-2">
                Tipo de dependencia
              </h3>
              <div className="flex gap-2">
                {(['dura', 'blanda', 'ninguna'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipoDep(t)}
                    className={`rounded-md px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors ${
                      tipoDep === t
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground italic">
                {tipoDep === 'dura' && 'Las precondiciones DEBEN estar terminadas antes de empezar este movimiento.'}
                {tipoDep === 'blanda' && 'Las precondiciones FACILITAN este movimiento, pero podés arrancar sin ellas.'}
                {tipoDep === 'ninguna' && 'Sin dependencia formal — el movimiento puede arrancar en cualquier momento.'}
              </p>
            </section>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onCancelar}
            className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50"
          >
            Saltear (sin dependencias)
          </button>
          <button
            onClick={() => onConfirmar(Array.from(preSel), Array.from(desSel), preSel.size > 0 ? tipoDep : 'ninguna')}
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Confirmar dependencias
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function BrechaCategoria({ proposito, situacion }: { proposito?: any; situacion?: any }) {
  if (!proposito?.metricas?.length) return null
  return (
    <details
      open
      className="rounded-xl border-2 border-amber-700/70 bg-gradient-to-br from-amber-950/40 to-amber-900/10 px-5 py-4 shadow-lg"
    >
      <summary className="cursor-pointer text-[18px] font-bold uppercase tracking-wide text-amber-300 flex items-center gap-2">
        <span className="text-[22px]">🎯</span>
        <span>Brecha a cerrar con esta categoría</span>
      </summary>
      <p className="mt-2 text-[13px] text-amber-200/80 italic leading-relaxed">
        Este es el norte de la categoría. Cada movimiento que aceptes o agregues tiene que contribuir a cerrar esta brecha.
      </p>
      <div className="mt-4 space-y-3">
        {proposito.metricas.map((m: any, i: number) => (
          <div key={i} className="rounded-lg bg-background/40 border border-amber-800/40 px-3 py-2">
            <p className="text-[16px] font-semibold text-foreground">{m.metrica}</p>
            <div className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[14px]">
              <span className="font-mono text-[12px] uppercase tracking-wider text-amber-400/80">Hoy</span>
              <span className="text-foreground/90">{m.valor_actual || '(sin baseline)'}</span>
              <span className="font-mono text-[12px] uppercase tracking-wider text-green-400/80">Meta</span>
              <span className="text-foreground/90">{m.valor_objetivo}</span>
            </div>
          </div>
        ))}
        {situacion?.desvio_principal && (
          <div className="rounded-lg bg-background/30 border border-amber-800/30 px-3 py-2">
            <p className="text-[12px] font-mono uppercase tracking-wider text-amber-400/80 mb-1">Desvío principal</p>
            <p className="text-[14px] text-foreground/90 leading-snug">{situacion.desvio_principal}</p>
          </div>
        )}
      </div>
    </details>
  )
}

function MovimientoCard({
  movimiento,
  allMovimientos,
  editando,
  saving,
  onAceptar,
  onEditar,
  onQuitar,
  onGuardarEdicion,
  onCancelarEdicion,
}: {
  movimiento: MovimientoPE
  allMovimientos: MovimientoPE[]
  editando: boolean
  saving: boolean
  onAceptar: () => void
  onEditar: () => void
  onQuitar: () => void
  onGuardarEdicion: (patch: Partial<MovimientoPE>) => void
  onCancelarEdicion: () => void
}) {
  // Helper para mostrar dependencias con nombres en vez de solo IDs:
  // "M-3, M-4" → 'M-3 "Definir SLA con producto", M-4 "..."'
  function formatDeps(ids: string[]): string {
    if (ids.length === 0) return ''
    return ids
      .map(id => {
        const target = allMovimientos.find(m => m.id === id)
        return target ? `${id} "${target.nombre}"` : id
      })
      .join(', ')
  }
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
            className="rounded-md border border-sidebar-border px-3 py-1 text-[13px] hover:bg-accent/50 disabled:opacity-40"
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
            className="rounded-md bg-blue-700 px-3 py-1 text-[13px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
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
            <span className="font-mono text-[15px] text-muted-foreground/70">{movimiento.id}</span>
            <span className={`rounded-full px-2 py-0.5 text-[14px] font-semibold uppercase tracking-wider ${
              movimiento.costo_banda_ancha === 'alta' ? 'bg-red-950/50 text-red-300 border border-red-800/50' :
              movimiento.costo_banda_ancha === 'media' ? 'bg-yellow-950/50 text-yellow-300 border border-yellow-800/50' :
              'bg-green-950/50 text-green-300 border border-green-800/50'
            }`}>
              {movimiento.costo_banda_ancha}
            </span>
            {estado !== 'pendiente' && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[14px] uppercase tracking-wider text-foreground/70">
                {estado}
              </span>
            )}
          </div>
          <h4 className="text-[15px] font-semibold text-foreground">{movimiento.nombre}</h4>
        </div>
      </div>

      <div className="mt-2 space-y-1.5 text-[13px]">
        <Linea label="Qué resuelve" valor={movimiento.que_resuelve} />
        <Linea label="Ataca desvío" valor={movimiento.ataca_desvio} />
        <Linea label="Dueño" valor={movimiento.dueno} />
        <Linea label="Ventana" valor={`${movimiento.ventana_temporal.arranca} → ${movimiento.ventana_temporal.termina}`} />
        <Linea label="Costo USD" valor={`$${movimiento.costo_monetario.rango_min_usd.toLocaleString()} - $${movimiento.costo_monetario.rango_max_usd.toLocaleString()}${movimiento.costo_monetario.nota ? ` · ${movimiento.costo_monetario.nota}` : ''}`} />
        {movimiento.precondiciones.length > 0 && (
          <Linea label="Precondiciones" valor={formatDeps(movimiento.precondiciones)} />
        )}
        {movimiento.desbloquea.length > 0 && (
          <Linea label="Desbloquea" valor={formatDeps(movimiento.desbloquea)} />
        )}
        <Linea label="Criterio éxito" valor={movimiento.criterio_exito} />
      </div>

      {/* Botones disponibles según estado actual:
          - Aceptar: oculto si ya está aceptado (no tiene sentido re-aceptar)
          - Quitar: oculto si ya está quitado (no tiene sentido re-quitar)
          - Editar: siempre disponible (siempre podés ajustar el contenido)
          El badge arriba indica el estado actual. */}
      <div className="mt-3 pt-3 border-t border-sidebar-border flex gap-2 justify-end">
        {estado !== 'aceptado' && (
          <button
            onClick={onAceptar}
            disabled={saving}
            className="rounded-md bg-green-700 px-3 py-1 text-[13px] font-semibold text-white hover:bg-green-600 disabled:opacity-40 transition-colors"
          >
            ✓ Aceptar
          </button>
        )}
        <button
          onClick={onEditar}
          disabled={saving}
          className={`rounded-md px-3 py-1 text-[13px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 transition-colors ${
            estado === 'editado' ? 'bg-blue-600 ring-2 ring-blue-400/40' : 'bg-blue-700'
          }`}
        >
          ✎ Editar
        </button>
        {estado !== 'quitado' && (
          <button
            onClick={onQuitar}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-3 py-1 text-[13px] text-muted-foreground hover:bg-accent/50 disabled:opacity-40 transition-colors"
          >
            ✕ Quitar
          </button>
        )}
      </div>
    </div>
  )
}

function Linea({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="leading-snug">
      <span className="text-[12px] uppercase tracking-wider text-muted-foreground/70 mr-2">{label}:</span>
      <span className="text-foreground/90">{valor}</span>
    </p>
  )
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      )}
    </div>
  )
}

// Form inline para agregar un movimiento custom a la categoría actual.
// Pre-rellena la categoría + defaults razonables. El user completa los campos
// requeridos. Si guarda OK, el endpoint asigna id (M-N+1) y estado_usuario='aceptado'.
function NuevoMovimientoForm({
  categoria,
  saving,
  onGuardar,
  onCancelar,
}: {
  categoria: string
  saving: boolean
  onGuardar: (m: Omit<MovimientoPE, 'id' | 'estado_usuario'>) => void
  onCancelar: () => void
}) {
  const hoy = new Date()
  const enTresMeses = new Date(hoy.getFullYear(), hoy.getMonth() + 3, 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  const [nombre, setNombre] = useState('')
  const [queResuelve, setQueResuelve] = useState('')
  const [atacaDesvio, setAtacaDesvio] = useState('')
  const [dueno, setDueno] = useState('')
  const [criterioExito, setCriterioExito] = useState('')
  const [arranca, setArranca] = useState(fmt(hoy))
  const [termina, setTermina] = useState(fmt(enTresMeses))
  const [bandaAncha, setBandaAncha] = useState<'baja' | 'media' | 'alta'>('media')
  const [costoMin, setCostoMin] = useState('0')
  const [costoMax, setCostoMax] = useState('0')
  const [costoNota, setCostoNota] = useState('')

  const camposCompletos = nombre.trim() && queResuelve.trim() && atacaDesvio.trim() && dueno.trim() && criterioExito.trim()

  function handleGuardar() {
    if (!camposCompletos) return
    onGuardar({
      categoria,
      nombre: nombre.trim(),
      que_resuelve: queResuelve.trim(),
      ataca_desvio: atacaDesvio.trim(),
      dueno: dueno.trim(),
      criterio_exito: criterioExito.trim(),
      ventana_temporal: { arranca, termina },
      costo_banda_ancha: bandaAncha,
      costo_monetario: {
        rango_min_usd: parseFloat(costoMin) || 0,
        rango_max_usd: parseFloat(costoMax) || 0,
        ...(costoNota.trim() ? { nota: costoNota.trim() } : {}),
      },
      precondiciones: [],
      desbloquea: [],
      tipo_dependencia: 'ninguna',
    })
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-foreground/40 bg-sidebar/30 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-foreground">Nuevo movimiento en "{categoria}"</p>
        <span className="text-[12px] text-muted-foreground">id se asigna al guardar</span>
      </div>

      <Field label="Nombre *" value={nombre} onChange={setNombre} />
      <Field label="Qué resuelve *" value={queResuelve} onChange={setQueResuelve} multiline />
      <Field label="Ataca desvío *" value={atacaDesvio} onChange={setAtacaDesvio} multiline />
      <Field label="Dueño * ('[vacancia]' si no asignado)" value={dueno} onChange={setDueno} />
      <Field label="Criterio de éxito *" value={criterioExito} onChange={setCriterioExito} multiline />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ventana arranca (YYYY-MM)" value={arranca} onChange={setArranca} />
        <Field label="Ventana termina (YYYY-MM)" value={termina} onChange={setTermina} />
      </div>

      <div className="space-y-1">
        <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Banda ancha</label>
        <div className="flex gap-2">
          {(['baja', 'media', 'alta'] as const).map(b => (
            <button
              key={b}
              type="button"
              onClick={() => setBandaAncha(b)}
              className={`rounded-md px-3 py-1 text-[13px] font-semibold capitalize transition-colors ${
                bandaAncha === b
                  ? b === 'alta' ? 'bg-red-700 text-white' : b === 'media' ? 'bg-yellow-700 text-white' : 'bg-green-700 text-white'
                  : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Costo USD mín" value={costoMin} onChange={setCostoMin} />
        <Field label="Costo USD máx" value={costoMax} onChange={setCostoMax} />
      </div>
      <Field label="Costo — nota (opcional)" value={costoNota} onChange={setCostoNota} />

      <div className="flex gap-2 justify-end pt-2 border-t border-sidebar-border">
        <button
          onClick={onCancelar}
          disabled={saving}
          className="rounded-md border border-sidebar-border px-3 py-1 text-[13px] hover:bg-accent/50 disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={handleGuardar}
          disabled={saving || !camposCompletos}
          className="rounded-md bg-primary px-3 py-1 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : 'Agregar movimiento'}
        </button>
      </div>
      {!camposCompletos && (
        <p className="text-[12px] text-yellow-400">Completá los 5 campos con * antes de guardar.</p>
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
