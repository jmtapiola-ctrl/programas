'use client'

// Modales de gestión de inventario durante 3.B / 3.C / 3.D (Mejora 2 — H7
// retroactividad fluida). Vivienda separada para no inflar el shell del Panel
// Interactivo. Tres componentes:
//   - ModalAgregarMovimiento: form completo, todos los campos del MovimientoPE.
//   - ModalEditarMovimiento: form simplificado para los campos editables más
//     comunes (nombre / qué resuelve / dueño / criterio de éxito). Otros
//     atributos (banda, costo, ventana) se editan desde el modal completo de
//     3.A si es necesario.
//   - ConfirmacionQuitarMovimiento: warning si el movimiento es precondición
//     o desbloqueo de otros (riesgo de orfanización).
//
// Todos usan createPortal para escapar del scope CSS del panel.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MovimientoPE } from '@/lib/types'
import { BrechasMultiSelect, MovimientosMultiSelect } from '@/components/planes-estrategicos/InventarioCategoria'

// ── Modal: Agregar movimiento durante 3.B/3.C/3.D ────────────────────────────

interface AgregarProps {
  // Categorías existentes en el inventario para el dropdown.
  categorias: string[]
  // Categoría sugerida (la del último movimiento que el modelo destacó, o "").
  categoriaSugerida?: string
  // Métricas del propósito para el multi-select de brechas (Brechas atacadas).
  metricasProposito: { metrica: string }[]
  // Todos los movs del inventario para multi-select de dependencias.
  allMovimientos: MovimientoPE[]
  saving: boolean
  onGuardar: (m: Omit<MovimientoPE, 'id' | 'estado_usuario'>) => void
  onCancelar: () => void
}

export function ModalAgregarMovimiento({ categorias, categoriaSugerida, metricasProposito, allMovimientos, saving, onGuardar, onCancelar }: AgregarProps) {
  const hoy = new Date()
  const enTresMeses = new Date(hoy.getFullYear(), hoy.getMonth() + 3, 1)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  const [categoria, setCategoria] = useState(categoriaSugerida && categorias.includes(categoriaSugerida) ? categoriaSugerida : (categorias[0] ?? ''))
  const [categoriaCustom, setCategoriaCustom] = useState('')
  const [usaCategoriaCustom, setUsaCategoriaCustom] = useState(categorias.length === 0)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [queResuelve, setQueResuelve] = useState('')
  const [dueno, setDueno] = useState('')
  const [criterioExito, setCriterioExito] = useState('')
  const [arranca, setArranca] = useState(fmt(hoy))
  const [termina, setTermina] = useState(fmt(enTresMeses))
  const [bandaAncha, setBandaAncha] = useState<'baja' | 'media' | 'alta'>('media')
  const [impacto, setImpacto] = useState<'baja' | 'media' | 'alta'>('media')
  const [costoMin, setCostoMin] = useState('0')
  const [costoMax, setCostoMax] = useState('0')
  const [costoNota, setCostoNota] = useState('')
  const [brechas, setBrechas] = useState<string[]>([])
  const [showBrechasError, setShowBrechasError] = useState(false)
  const [precondiciones, setPrecondiciones] = useState<string[]>([])
  const [desbloquea, setDesbloquea] = useState<string[]>([])

  const categoriaFinal = (usaCategoriaCustom ? categoriaCustom : categoria).trim()
  // Brecha obligatoria solo si hay métricas del propósito (Plan Jr las hereda y
  // metricasProposito viene vacío → no se exige; el cap valida cobertura).
  const camposCompletos = !!categoriaFinal && nombre.trim() && queResuelve.trim() && dueno.trim() && criterioExito.trim() && (metricasProposito.length === 0 || brechas.length > 0)

  function handleGuardar() {
    if (!camposCompletos || saving) {
      if (metricasProposito.length > 0 && brechas.length === 0) setShowBrechasError(true)
      return
    }
    onGuardar({
      categoria: categoriaFinal,
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      que_resuelve: queResuelve.trim(),
      dueno: dueno.trim(),
      criterio_exito: criterioExito.trim(),
      ventana_temporal: { arranca, termina },
      costo_banda_ancha: bandaAncha,
      impacto,
      brechas_atacadas: brechas,
      costo_monetario: {
        rango_min_usd: parseFloat(costoMin) || 0,
        rango_max_usd: parseFloat(costoMax) || 0,
        ...(costoNota.trim() ? { nota: costoNota.trim() } : {}),
      },
      precondiciones,
      desbloquea,
      tipo_dependencia: precondiciones.length > 0 ? 'sugerida' : 'ninguna',
    })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={onCancelar}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Gestión de inventario
          </p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-foreground">Agregar movimiento</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Se sumará al inventario y aparecerá en el panel del modo actual.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Categoría — dropdown de existentes + opción custom */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Categoría *</label>
            {!usaCategoriaCustom && categorias.length > 0 && (
              <div className="flex gap-2">
                <select
                  value={categoria}
                  onChange={e => setCategoria(e.target.value)}
                  className="flex-1 rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[13px]"
                >
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setUsaCategoriaCustom(true)}
                  className="rounded-md border border-sidebar-border px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent/40"
                >
                  Nueva categoría
                </button>
              </div>
            )}
            {(usaCategoriaCustom || categorias.length === 0) && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={categoriaCustom}
                  onChange={e => setCategoriaCustom(e.target.value)}
                  placeholder="Ej: Estandarización de procesos"
                  className="flex-1 rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-[13px]"
                />
                {categorias.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setUsaCategoriaCustom(false)}
                    className="rounded-md border border-sidebar-border px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent/40"
                  >
                    Usar existente
                  </button>
                )}
              </div>
            )}
          </div>

          <Field label="Nombre *" value={nombre} onChange={setNombre} />
          <BrechasMultiSelect
            metricas={metricasProposito}
            seleccionadas={brechas}
            onToggle={(m) => {
              setBrechas(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
              setShowBrechasError(false)
            }}
            error={showBrechasError}
          />
          <Field label="Descripción" value={descripcion} onChange={setDescripcion} multiline />
          <Field label="Qué resuelve *" value={queResuelve} onChange={setQueResuelve} multiline />
          <Field label="Dueño * ('[vacancia]' si no asignado)" value={dueno} onChange={setDueno} />
          <Field label="Criterio de éxito *" value={criterioExito} onChange={setCriterioExito} multiline />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ventana arranca (YYYY-MM)" value={arranca} onChange={setArranca} />
            <Field label="Ventana termina (YYYY-MM)" value={termina} onChange={setTermina} />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Esfuerzo (global)</label>
            <div className="flex gap-2">
              {(['baja', 'media', 'alta'] as const).map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBandaAncha(b)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize transition-colors ${
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
          <div className="space-y-1">
            <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Impacto</label>
            <div className="flex gap-2">
              {(['baja', 'media', 'alta'] as const).map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setImpacto(b)}
                  className={`rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize transition-colors ${
                    impacto === b
                      // Color inverso al esfuerzo: alto impacto = verde.
                      ? b === 'alta' ? 'bg-green-700 text-white' : b === 'media' ? 'bg-yellow-700 text-white' : 'bg-red-700 text-white'
                      : 'border border-sidebar-border text-muted-foreground hover:bg-accent/40'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Costo mín US$" value={costoMin} onChange={setCostoMin} />
            <Field label="Costo máx US$" value={costoMax} onChange={setCostoMax} />
          </div>
          <Field label="Nota costo (opcional)" value={costoNota} onChange={setCostoNota} />

          <MovimientosMultiSelect
            label="Depende de (precondiciones)"
            hint="Movimientos que tienen que estar listos antes de arrancar este."
            movimientos={allMovimientos}
            movActualId={null}
            seleccionados={precondiciones}
            excluirIds={desbloquea}
            onToggle={(id) => setPrecondiciones(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
          />
          <MovimientosMultiSelect
            label="Desbloquea"
            hint="Movimientos que pueden arrancar (o se facilitan) cuando este termine."
            movimientos={allMovimientos}
            movActualId={null}
            seleccionados={desbloquea}
            excluirIds={precondiciones}
            onToggle={(id) => setDesbloquea(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
          />
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={!camposCompletos || saving}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando…' : 'Agregar movimiento'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

// ── Modal: Editar movimiento durante 3.B/3.C/3.D ─────────────────────────────

interface EditarProps {
  movimiento: MovimientoPE
  // Métricas del propósito para el multi-select de brechas.
  metricasProposito: { metrica: string }[]
  saving: boolean
  onGuardar: (patch: Partial<MovimientoPE>) => void
  onCancelar: () => void
}

export function ModalEditarMovimiento({ movimiento, metricasProposito, saving, onGuardar, onCancelar }: EditarProps) {
  const [nombre, setNombre] = useState(movimiento.nombre)
  const [descripcion, setDescripcion] = useState(movimiento.descripcion ?? '')
  const [queResuelve, setQueResuelve] = useState(movimiento.que_resuelve)
  const [dueno, setDueno] = useState(movimiento.dueno)
  const [criterioExito, setCriterioExito] = useState(movimiento.criterio_exito)
  const [bandaAncha, setBandaAncha] = useState<'alta' | 'media' | 'baja'>(movimiento.costo_banda_ancha ?? 'media')
  const [impacto, setImpacto] = useState<'alta' | 'media' | 'baja'>(movimiento.impacto ?? 'media')
  const [brechas, setBrechas] = useState<string[]>(movimiento.brechas_atacadas ?? [])
  const [showBrechasError, setShowBrechasError] = useState(false)

  function handleGuardar() {
    if (saving) return
    // Brecha obligatoria solo si hay métricas (Plan Jr las hereda → no se exige).
    if (metricasProposito.length > 0 && brechas.length === 0) {
      setShowBrechasError(true)
      return
    }
    onGuardar({
      nombre: nombre.trim() || movimiento.nombre,
      descripcion: descripcion.trim(),
      que_resuelve: queResuelve.trim() || movimiento.que_resuelve,
      dueno: dueno.trim() || movimiento.dueno,
      criterio_exito: criterioExito.trim() || movimiento.criterio_exito,
      costo_banda_ancha: bandaAncha,
      impacto,
      brechas_atacadas: brechas,
    })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={onCancelar}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Gestión de inventario
          </p>
          <h2 className="mt-0.5 text-[16px] font-semibold text-foreground">
            Editar {movimiento.id} "{movimiento.nombre}"
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Field label="Nombre" value={nombre} onChange={setNombre} />
          <BrechasMultiSelect
            metricas={metricasProposito}
            seleccionadas={brechas}
            onToggle={(m) => {
              setBrechas(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
              setShowBrechasError(false)
            }}
            error={showBrechasError}
          />
          <Field label="Descripción" value={descripcion} onChange={setDescripcion} multiline />
          <Field label="Qué resuelve" value={queResuelve} onChange={setQueResuelve} multiline />
          <Field label="Dueño" value={dueno} onChange={setDueno} />
          <Field label="Criterio de éxito" value={criterioExito} onChange={setCriterioExito} multiline />
          {/* Esfuerzo global. */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Esfuerzo (global)</label>
            <div className="inline-flex rounded-md border border-sidebar-border bg-background">
              {(['alta', 'media', 'baja'] as const).map((opt, i) => {
                const selected = bandaAncha === opt
                const colorActivo =
                  opt === 'alta' ? 'bg-red-900/60 text-red-200' :
                  opt === 'media' ? 'bg-yellow-900/60 text-yellow-200' :
                  'bg-green-900/60 text-green-200'
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setBandaAncha(opt)}
                    className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      selected ? colorActivo : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                    } ${i > 0 ? 'border-l border-sidebar-border' : ''} first:rounded-l-md last:rounded-r-md`}
                  >
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Impacto esperado. */}
          <div className="space-y-1">
            <label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground/80">Impacto</label>
            <div className="inline-flex rounded-md border border-sidebar-border bg-background">
              {(['alta', 'media', 'baja'] as const).map((opt, i) => {
                const selected = impacto === opt
                // Color inverso al esfuerzo: alto impacto = verde (bueno).
                const colorActivo =
                  opt === 'alta' ? 'bg-green-900/60 text-green-200' :
                  opt === 'media' ? 'bg-yellow-900/60 text-yellow-200' :
                  'bg-red-900/60 text-red-200'
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setImpacto(opt)}
                    className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      selected ? colorActivo : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                    } ${i > 0 ? 'border-l border-sidebar-border' : ''} first:rounded-l-md last:rounded-r-md`}
                  >
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground italic mt-2">
            Ventana, costo y dependencias siguen igual. Si necesitás editarlos, abrí el inventario completo (3.A).
          </p>
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar edición'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

// ── Modal: Confirmar quitar movimiento ──────────────────────────────────────

interface ConfirmarQuitarProps {
  movimiento: MovimientoPE
  todosLosMovimientos: MovimientoPE[]
  saving: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

export function ConfirmacionQuitarMovimiento({ movimiento, todosLosMovimientos, saving, onConfirmar, onCancelar }: ConfirmarQuitarProps) {
  // Detectar orfanizaciones: otros movimientos que tengan a este en
  // precondiciones o desbloquea. Es solo un warning informativo — no bloquea.
  const dependientes = useMemo(() => {
    const huerfanizaPrecondiciones: MovimientoPE[] = []
    const huerfanizaDesbloqueos: MovimientoPE[] = []
    for (const m of todosLosMovimientos) {
      if (m.id === movimiento.id) continue
      if (m.estado_usuario === 'quitado') continue
      if (m.precondiciones?.includes(movimiento.id)) huerfanizaPrecondiciones.push(m)
      if (m.desbloquea?.includes(movimiento.id)) huerfanizaDesbloqueos.push(m)
    }
    return { huerfanizaPrecondiciones, huerfanizaDesbloqueos }
  }, [movimiento.id, todosLosMovimientos])

  const tieneOrfanizaciones = dependientes.huerfanizaPrecondiciones.length > 0 || dependientes.huerfanizaDesbloqueos.length > 0

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-md rounded-xl border border-sidebar-border bg-background p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-foreground">
          ¿Quitar {movimiento.id} "{movimiento.nombre}"?
        </h2>
        <p className="mt-2 text-[12px] text-muted-foreground">
          El movimiento queda marcado como quitado en el inventario y desaparece del panel.
        </p>

        {tieneOrfanizaciones && (
          <div className="mt-3 rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-[12px] text-amber-200 space-y-1.5">
            <p className="font-semibold">⚠ Cuidado — vas a romper relaciones existentes:</p>
            {dependientes.huerfanizaPrecondiciones.length > 0 && (
              <p>
                <strong>{dependientes.huerfanizaPrecondiciones.length}</strong> movimiento(s) tienen este como precondición:
                {' '}
                <span className="font-mono text-[12px]">
                  {dependientes.huerfanizaPrecondiciones.map(m => m.id).join(', ')}
                </span>
              </p>
            )}
            {dependientes.huerfanizaDesbloqueos.length > 0 && (
              <p>
                <strong>{dependientes.huerfanizaDesbloqueos.length}</strong> movimiento(s) tienen este en desbloquea:
                {' '}
                <span className="font-mono text-[12px]">
                  {dependientes.huerfanizaDesbloqueos.map(m => m.id).join(', ')}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={saving}
            className="rounded-md bg-red-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-red-500 disabled:opacity-40"
          >
            {saving ? 'Quitando…' : 'Sí, quitar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
