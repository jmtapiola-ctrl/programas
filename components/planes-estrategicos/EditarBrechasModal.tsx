'use client'

// Editor COMPLETO de las brechas (proposito.metricas) del plan, accesible
// desde 3.A. Superset del viejo RenombrarBrechasModal: permite renombrar,
// editar valores (Hoy/Target), AGREGAR y BORRAR brechas.
//
// Al confirmar dispara un único PUT a
// /api/planes-estrategicos/[id]/proposito/metrica/editar con la lista FINAL
// de brechas (cada fila lleva `original` para que el server mapee renames y
// cascada, o null si es nueva). El server cascada a criterio_exito.por_metrica
// y a inventario.movimientos[].brechas_atacadas, y devuelve qué movimientos
// quedaron huérfanos (sin ninguna brecha) tras un borrado.

import { BTN_CTA } from '@/components/ui/button-styles'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MetricaPE, PropositorPE, InventarioPE } from '@/lib/types'

interface MovMinimo {
  id: string
  nombre: string
  brechas_atacadas?: string[]
  estado_usuario?: string
}

interface Props {
  brechas: MetricaPE[]
  movimientos: MovMinimo[]
  planId: string
  onSuccess: (resultado: {
    proposito_actualizado: PropositorPE
    inventario_actualizado?: InventarioPE
    cambios: {
      renombradas: number; agregadas: number; borradas: number
      valores_editados: number; criterios_actualizados: number; movimientos_actualizados: number
    }
    movimientos_huerfanos: string[]
  }) => void
  onCerrar: () => void
}

interface Fila {
  key: string
  original: string | null   // nombre previo (cascada) o null si es nueva
  metrica: string
  valor_objetivo: string
  valor_actual: string
}

export function EditarBrechasModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ brechas, movimientos, planId, onSuccess, onCerrar }: Props) {
  const keySeq = useRef(0)
  const nextKey = () => `f${keySeq.current++}`

  const [filas, setFilas] = useState<Fila[]>(() =>
    brechas.map(b => ({
      key: nextKey(),
      original: b.metrica,
      metrica: b.metrica,
      valor_objetivo: b.valor_objetivo,
      valor_actual: b.valor_actual,
    })),
  )
  const [saving, setSaving] = useState(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)

  // Escape NO cierra el modal (evita perder lo escrito). Se cierra solo con ✕.

  // ─── Movs activos que atacan cada brecha (para avisar al borrar) ──────────
  const movsPorBrecha = useMemo(() => {
    const m = new Map<string, MovMinimo[]>()
    for (const mov of movimientos) {
      if (mov.estado_usuario === 'quitado') continue
      for (const b of mov.brechas_atacadas ?? []) {
        if (!m.has(b)) m.set(b, [])
        m.get(b)!.push(mov)
      }
    }
    return m
  }, [movimientos])

  // ─── Validación inline ───────────────────────────────────────────────────
  const errores: Record<string, 'vacio' | 'duplicado' | null> = useMemo(() => {
    const out: Record<string, 'vacio' | 'duplicado' | null> = {}
    const conteo = new Map<string, number>()
    for (const f of filas) {
      const v = f.metrica.trim()
      conteo.set(v, (conteo.get(v) ?? 0) + 1)
    }
    for (const f of filas) {
      const v = f.metrica.trim()
      if (!v) { out[f.key] = 'vacio'; continue }
      if ((conteo.get(v) ?? 0) > 1) { out[f.key] = 'duplicado'; continue }
      out[f.key] = null
    }
    return out
  }, [filas])

  // ─── Resumen de cambios ──────────────────────────────────────────────────
  const resumen = useMemo(() => {
    const prevPorNombre = new Map(brechas.map(b => [b.metrica, b]))
    const origVivos = new Set(filas.filter(f => f.original !== null).map(f => f.original as string))
    let renombradas = 0, agregadas = 0, valores = 0
    for (const f of filas) {
      if (f.original === null) { agregadas++; continue }
      if (f.original !== f.metrica.trim()) renombradas++
      const prev = prevPorNombre.get(f.original)
      if (prev && (prev.valor_objetivo !== f.valor_objetivo.trim() || prev.valor_actual !== f.valor_actual.trim())) valores++
    }
    const borradas = brechas.filter(b => !origVivos.has(b.metrica)).length
    return { renombradas, agregadas, borradas, valores, total: renombradas + agregadas + borradas + valores }
  }, [filas, brechas])

  const tieneErrores = Object.values(errores).some(e => e !== null)
  const puedeConfirmar = !tieneErrores && filas.length > 0 && resumen.total > 0 && !saving

  function setFila(key: string, patch: Partial<Fila>) {
    setFilas(prev => prev.map(f => (f.key === key ? { ...f, ...patch } : f)))
  }

  function agregar() {
    setFilas(prev => [...prev, { key: nextKey(), original: null, metrica: '', valor_objetivo: '', valor_actual: '' }])
  }

  function borrar(f: Fila) {
    // Si es una brecha existente atacada por movs activos, confirmar.
    if (f.original) {
      const movs = movsPorBrecha.get(f.original) ?? []
      if (movs.length > 0) {
        const nombres = movs.slice(0, 5).map(m => `· ${m.nombre}`).join('\n')
        const extra = movs.length > 5 ? `\n… y ${movs.length - 5} más` : ''
        const ok = window.confirm(
          `Esta brecha la atacan ${movs.length} movimiento(s):\n${nombres}${extra}\n\n` +
          `Si la borrás, esos movimientos dejan de atacarla. Los que queden sin ninguna ` +
          `brecha van a aparecer como descubiertos en la validación.\n\n¿Borrar la brecha?`,
        )
        if (!ok) return
      }
    }
    setFilas(prev => prev.filter(x => x.key !== f.key))
  }

  async function handleConfirmar() {
    if (!puedeConfirmar) return
    setSaving(true)
    setErrorServer(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/proposito/metrica/editar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brechas: filas.map(f => ({
            original: f.original,
            metrica: f.metrica.trim(),
            valor_objetivo: f.valor_objetivo.trim(),
            valor_actual: f.valor_actual.trim(),
          })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorServer(data?.error || `Error ${res.status}`)
        setSaving(false)
        return
      }
      onSuccess({
        proposito_actualizado: data.proposito_actualizado,
        inventario_actualizado: data.inventario_actualizado,
        cambios: data.cambios,
        movimientos_huerfanos: data.movimientos_huerfanos ?? [],
      })
    } catch (e: any) {
      setErrorServer(e?.message || 'Error de red')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl">
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90">
              Brechas del propósito
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-foreground">
              Editar brechas
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
              Cada brecha es algo que tus movimientos tienen que cerrar. Editá el
              nombre, el valor de hoy y el target; agregá las que falten o borrá las
              que sobren. Los cambios se propagan al inventario
              (<code className="text-[12px]">brechas_atacadas</code> de cada
              movimiento) y a los criterios de éxito.
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {filas.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">
              No quedan brechas. Agregá al menos una para poder confirmar.
            </p>
          ) : (
            filas.map((f, idx) => (
              <FilaBrechaEditor
                key={f.key}
                idx={idx}
                fila={f}
                error={errores[f.key]}
                movsAtacan={f.original ? (movsPorBrecha.get(f.original)?.length ?? 0) : 0}
                disabled={saving}
                onChange={(patch) => setFila(f.key, patch)}
                onBorrar={() => borrar(f)}
              />
            ))
          )}

          <button
            onClick={agregar}
            disabled={saving}
            className="w-full rounded-lg border border-dashed border-sidebar-border py-3 text-[13px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
          >
            + Agregar brecha
          </button>
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-[13px] text-muted-foreground">
            {errorServer ? (
              <span className="text-red-300">⚠ {errorServer}</span>
            ) : tieneErrores ? (
              <span className="text-red-300">Revisá las brechas con error antes de confirmar</span>
            ) : resumen.total === 0 ? (
              <span>Sin cambios pendientes</span>
            ) : (
              <span className="text-foreground">
                {[
                  resumen.agregadas && `${resumen.agregadas} nueva(s)`,
                  resumen.borradas && `${resumen.borradas} borrada(s)`,
                  resumen.renombradas && `${resumen.renombradas} renombrada(s)`,
                  resumen.valores && `${resumen.valores} con valores editados`,
                ].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCerrar}
              disabled={saving}
              className="rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={!puedeConfirmar}
              className={BTN_CTA}
            >
              {saving ? 'Guardando…' : resumen.total > 0 ? `Confirmar cambios (${resumen.total})` : 'Confirmar cambios'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function FilaBrechaEditor({
  idx, fila, error, movsAtacan, disabled, onChange, onBorrar,
}: {
  idx: number
  fila: Fila
  error: 'vacio' | 'duplicado' | null
  movsAtacan: number
  disabled: boolean
  onChange: (patch: Partial<Fila>) => void
  onBorrar: () => void
}) {
  const esNueva = fila.original === null
  const renombrada = !esNueva && fila.metrica.trim() !== fila.original
  const borde = error ? 'border-red-700/60 bg-red-950/20'
    : esNueva ? 'border-emerald-700/60 bg-emerald-950/10'
    : renombrada ? 'border-amber-700/60 bg-amber-950/10'
    : 'border-sidebar-border bg-sidebar/30'

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-2 ${borde}`}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          Brecha {idx + 1}
          {esNueva && <span className="ml-2 text-emerald-400/90">nueva</span>}
          {movsAtacan > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/70">
              · {movsAtacan} mov la atacan
            </span>
          )}
        </p>
        <button
          onClick={onBorrar}
          disabled={disabled}
          aria-label="Borrar brecha"
          title="Borrar brecha"
          className="rounded-md text-muted-foreground hover:text-red-300 hover:bg-red-950/30 p-1 text-[14px] leading-none disabled:opacity-40"
        >
          🗑
        </button>
      </div>

      <div>
        <label className="text-[12px] font-medium text-foreground/90 block mb-1">Nombre</label>
        <input
          type="text"
          value={fila.metrica}
          onChange={(e) => onChange({ metrica: e.target.value })}
          disabled={disabled}
          placeholder="Ej: Organigramas completos"
          className={`w-full rounded-md border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none ${error ? 'border-red-600 focus:border-red-500' : 'border-sidebar-border focus:border-primary'}`}
        />
        {error === 'vacio' && <p className="mt-1 text-[12px] text-red-300">⚠ El nombre no puede estar vacío</p>}
        {error === 'duplicado' && <p className="mt-1 text-[12px] text-red-300">⚠ Ya hay otra brecha con este nombre</p>}
        {renombrada && !error && (
          <p className="mt-1 text-[12px] text-amber-300/80">Antes: <span className="italic">{fila.original}</span></p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">Hoy (valor actual)</label>
          <input
            type="text"
            value={fila.valor_actual}
            onChange={(e) => onChange({ valor_actual: e.target.value })}
            disabled={disabled}
            placeholder="Ej: 2 de 6 definidas"
            className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">Target (valor objetivo)</label>
          <input
            type="text"
            value={fila.valor_objetivo}
            onChange={(e) => onChange({ valor_objetivo: e.target.value })}
            disabled={disabled}
            placeholder="Ej: 6 de 6 definidas"
            className="w-full rounded-md border border-sidebar-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
