'use client'

// Modal para renombrar brechas (proposito.metricas[].metrica) en batch.
//
// Edita SOLO el nombre. Valor objetivo y valor actual son read-only (solo
// para dar contexto al usuario).
//
// Al confirmar dispara un único PATCH al endpoint
// /api/planes-estrategicos/[id]/proposito/metrica/renombrar con todos los
// renames que cambiaron. El server hace la cascada a criterio_exito.por_metrica
// y a inventario.movimientos[].brechas_atacadas[].

import { BTN_CTA } from '@/components/ui/button-styles'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MetricaPE, PropositorPE, InventarioPE } from '@/lib/types'

interface Props {
  brechas: MetricaPE[]
  planId: string
  onSuccess: (resultado: {
    proposito_actualizado: PropositorPE
    inventario_actualizado?: InventarioPE
    cambios: { metricas_renombradas: number; criterios_actualizados: number; movimientos_actualizados: number }
  }) => void
  onCerrar: () => void
}

export function RenombrarBrechasModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ brechas, planId, onSuccess, onCerrar }: Props) {
  // drafts: key = nombre original (vieja), value = nombre actual editado
  const draftsIniciales = useMemo(() => {
    const m: Record<string, string> = {}
    for (const b of brechas) m[b.metrica] = b.metrica
    return m
  }, [brechas])

  const [drafts, setDrafts] = useState<Record<string, string>>(draftsIniciales)
  const [saving, setSaving] = useState(false)
  const [errorServer, setErrorServer] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, saving])

  // Validación inline por fila. Una fila puede tener:
  //   - error 'vacío' si draft.trim() === ''
  //   - error 'duplicado' si draft.trim() colisiona con OTRA fila (otro draft o
  //     nombre original que NO se está renombrando).
  const errores: Record<string, 'vacio' | 'duplicado' | null> = useMemo(() => {
    const out: Record<string, 'vacio' | 'duplicado' | null> = {}
    // Nombres "ocupados" en el estado final si confirmara ahora
    const ocupados = new Set<string>()
    const conteo = new Map<string, number>()
    for (const b of brechas) {
      const valor = (drafts[b.metrica] ?? b.metrica).trim()
      conteo.set(valor, (conteo.get(valor) ?? 0) + 1)
      ocupados.add(valor)
    }
    for (const b of brechas) {
      const valor = (drafts[b.metrica] ?? b.metrica).trim()
      if (!valor) { out[b.metrica] = 'vacio'; continue }
      if ((conteo.get(valor) ?? 0) > 1) { out[b.metrica] = 'duplicado'; continue }
      out[b.metrica] = null
    }
    return out
  }, [drafts, brechas])

  const renamesPendientes = brechas
    .map(b => ({ vieja: b.metrica, nueva: (drafts[b.metrica] ?? b.metrica).trim() }))
    .filter(r => r.nueva !== r.vieja)

  const tieneErrores = Object.values(errores).some(e => e !== null)
  const puedeConfirmar = !tieneErrores && renamesPendientes.length > 0 && !saving

  function setDraft(vieja: string, nueva: string) {
    setDrafts(prev => ({ ...prev, [vieja]: nueva }))
  }

  async function handleConfirmar() {
    if (!puedeConfirmar) return
    setSaving(true)
    setErrorServer(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/proposito/metrica/renombrar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames: renamesPendientes }),
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
      })
    } catch (e: any) {
      setErrorServer(e?.message || 'Error de red')
      setSaving(false)
    }
  }

  const N = renamesPendientes.length

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !saving && onCerrar()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-400/90">
              Brechas del propósito
            </p>
            <h2 className="mt-1 text-[18px] font-semibold text-foreground">
              Renombrar brechas
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
              Editá el nombre de cada brecha. El cambio se propaga automáticamente
              al inventario (<code className="text-[12px]">brechas_atacadas</code> de
              cada movimiento) y a los criterios de éxito. Los valores actual y
              objetivo siguen igual.
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
          {brechas.length === 0 ? (
            <p className="text-[13px] italic text-muted-foreground">
              Este plan no tiene brechas definidas todavía. Volvé al Paso 1 para declararlas.
            </p>
          ) : (
            brechas.map((b, idx) => (
              <FilaBrecha
                key={b.metrica}
                idx={idx}
                brecha={b}
                draft={drafts[b.metrica] ?? b.metrica}
                error={errores[b.metrica]}
                onChange={(v) => setDraft(b.metrica, v)}
                disabled={saving}
              />
            ))
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-4 flex items-center justify-between gap-4">
          <div className="text-[13px] text-muted-foreground">
            {errorServer ? (
              <span className="text-red-300">⚠ {errorServer}</span>
            ) : N === 0 ? (
              <span>Sin cambios pendientes</span>
            ) : tieneErrores ? (
              <span className="text-red-300">Revisá los nombres con error antes de confirmar</span>
            ) : (
              <span><strong className="text-foreground">{N}</strong> {N === 1 ? 'cambio listo' : 'cambios listos'} para aplicar</span>
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
              {saving ? 'Guardando…' : N > 0 ? `Confirmar cambios (${N})` : 'Confirmar cambios'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function FilaBrecha({
  idx,
  brecha,
  draft,
  error,
  onChange,
  disabled,
}: {
  idx: number
  brecha: MetricaPE
  draft: string
  error: 'vacio' | 'duplicado' | null
  onChange: (v: string) => void
  disabled: boolean
}) {
  const cambiada = draft.trim() !== brecha.metrica
  return (
    <div className={`rounded-lg border px-4 py-3 space-y-2 ${error ? 'border-red-700/60 bg-red-950/20' : cambiada ? 'border-amber-700/60 bg-amber-950/10' : 'border-sidebar-border bg-sidebar/30'}`}>
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        Brecha {idx + 1}
      </p>
      <div>
        <label className="text-[12px] font-medium text-foreground/90 block mb-1">Nombre</label>
        <input
          type="text"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full rounded-md border bg-background px-3 py-2 text-[14px] text-foreground focus:outline-none ${error ? 'border-red-600 focus:border-red-500' : 'border-sidebar-border focus:border-primary'}`}
        />
        {error === 'vacio' && (
          <p className="mt-1 text-[12px] text-red-300">⚠ El nombre no puede estar vacío</p>
        )}
        {error === 'duplicado' && (
          <p className="mt-1 text-[12px] text-red-300">⚠ Ya hay otra brecha con este nombre</p>
        )}
        {cambiada && !error && (
          <p className="mt-1 text-[12px] text-amber-300/80">
            Antes: <span className="italic">{brecha.metrica}</span>
          </p>
        )}
      </div>
      <div className="flex gap-4 pt-1 text-[12px] text-muted-foreground">
        <p><span className="font-mono uppercase tracking-wider">Hoy:</span> {brecha.valor_actual || '(sin baseline)'}</p>
        <p><span className="font-mono uppercase tracking-wider">Target:</span> {brecha.valor_objetivo || '(sin target)'}</p>
      </div>
    </div>
  )
}
