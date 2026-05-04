'use client'

// Modal del Sub-bloque 3.B — preguntas del validador cross-provider.
//
// Aparece automáticamente cuando el usuario termina las 5 preguntas del modelo
// principal en el chat (cliente detecta plan.palancas.preguntas_principal con
// 5 items, todas con respuesta).
//
// Flow:
//   1. Loading overlay mientras callReviewer corre (60-120s)
//   2. Si validador devuelve 0 preguntas: modal con mensaje "todo cubierto"
//      + razonamiento_global + botón "Avanzar a 3.C"
//   3. Si devuelve N>0 preguntas: modal con N textareas + razon_complementariedad
//      por pregunta + botón "Guardar respuestas y avanzar a 3.C" (deshabilitado
//      hasta que las N tengan respuesta)

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { PalancaQAPE } from '@/lib/types'

type PropuestaValidador = {
  preguntas: Array<{ id: string; pregunta: string; razon_complementariedad: string }>
  razonamiento_global: string
}

interface Props {
  planId: string
  status: 'inferring' | 'ready'
  propuesta?: PropuestaValidador
  costoUsd?: number
  latenciaMs?: number
  onCerrar: () => void
  onAvanzar: () => void  // dispara recarga del estado en el padre tras persistir
}

export function PalancasValidadorModal({ planId, status, propuesta, costoUsd, latenciaMs, onCerrar, onAvanzar }: Props) {
  if (typeof document === 'undefined') return null
  if (status === 'inferring') {
    return createPortal(<LoadingOverlay />, document.body)
  }
  if (!propuesta) return null
  return createPortal(
    <ContenidoValidador
      planId={planId}
      propuesta={propuesta}
      costoUsd={costoUsd}
      latenciaMs={latenciaMs}
      onCerrar={onCerrar}
      onAvanzar={onAvanzar}
    />,
    document.body,
  )
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm font-sans">
      <div className="rounded-xl border border-sidebar-border bg-background px-8 py-6 shadow-2xl text-center space-y-3 max-w-sm">
        <div className="flex justify-center">
          <span className="inline-flex gap-1 items-center">
            <span className="animate-bounce delay-0 h-2 w-2 rounded-full bg-primary" />
            <span className="animate-bounce delay-150 h-2 w-2 rounded-full bg-primary" />
            <span className="animate-bounce delay-300 h-2 w-2 rounded-full bg-primary" />
          </span>
        </div>
        <p className="text-[15px] font-semibold text-foreground">Revisión de control en progreso…</p>
        <p className="text-[12px] text-muted-foreground">
          Estoy revisando si quedaron ángulos importantes sin tocar en las preguntas de palanca.
          Tarda 60-120s.
        </p>
      </div>
    </div>
  )
}

function ContenidoValidador({ planId, propuesta, costoUsd, latenciaMs, onCerrar, onAvanzar }: {
  planId: string
  propuesta: PropuestaValidador
  costoUsd?: number
  latenciaMs?: number
  onCerrar: () => void
  onAvanzar: () => void
}) {
  const [respuestas, setRespuestas] = useState<Record<string, string>>(
    Object.fromEntries(propuesta.preguntas.map(q => [q.id, '']))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tienePreguntas = propuesta.preguntas.length > 0
  const todasRespondidas = tienePreguntas
    ? propuesta.preguntas.every(q => respuestas[q.id]?.trim().length > 0)
    : true

  async function handleAvanzar() {
    setSaving(true)
    setError(null)
    try {
      const preguntas_validador: PalancaQAPE[] = propuesta.preguntas.map(q => ({
        id: q.id,
        origen: 'validador',
        pregunta: q.pregunta,
        respuesta: respuestas[q.id]?.trim() ?? '',
        observacion_modelo: q.razon_complementariedad,  // reusamos campo para tracking
      }))
      const res = await fetch(`/api/planes-estrategicos/${planId}/paso3/palancas/respuestas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preguntas_validador,
          costo_validador_usd: costoUsd,
          latencia_validador_ms: latenciaMs,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onAvanzar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl">
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Sub-bloque 3.B · Revisión de control
          </p>
          <h2 className="mt-1 text-[18px] font-semibold text-foreground">
            {tienePreguntas
              ? `${propuesta.preguntas.length} pregunta${propuesta.preguntas.length === 1 ? '' : 's'} complementaria${propuesta.preguntas.length === 1 ? '' : 's'}`
              : 'Espacio de palancas cubierto'}
          </h2>
          {propuesta.razonamiento_global && (
            <p className="mt-2 text-[13px] text-muted-foreground italic leading-relaxed">
              {propuesta.razonamiento_global}
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!tienePreguntas ? (
            <div className="rounded-lg border border-green-700/40 bg-green-950/20 px-4 py-4 text-[14px] text-green-200 leading-relaxed">
              <p className="font-semibold">Las 5 preguntas previas cubrieron bien el espacio de palancas.</p>
              <p className="mt-2 text-green-300/80">
                Avanzá a 3.C — Borrador del plan. El sistema va a tomar las 5 respuestas como
                restricciones para construir el borrador.
              </p>
            </div>
          ) : (
            propuesta.preguntas.map((q, i) => (
              <section key={q.id} className="space-y-2">
                <div className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground/70">{q.id}</span>
                    <span className="rounded-full bg-blue-950/50 border border-blue-800/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-300">
                      complementaria #{i + 1}
                    </span>
                  </div>
                  <p className="text-[15px] text-foreground leading-relaxed">{q.pregunta}</p>
                  <p className="text-[11px] italic text-muted-foreground/80 leading-relaxed">
                    Por qué esta pregunta: {q.razon_complementariedad}
                  </p>
                </div>
                <textarea
                  value={respuestas[q.id] ?? ''}
                  onChange={e => setRespuestas(prev => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Tu respuesta..."
                  rows={4}
                  className="w-full resize-y rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] max-h-[300px]"
                />
              </section>
            ))
          )}

          {error && (
            <div className="rounded-lg border border-red-700 bg-red-950/50 px-4 py-3 text-[13px] text-red-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {tienePreguntas
              ? todasRespondidas
                ? '✓ Todas respondidas'
                : `Faltan ${propuesta.preguntas.filter(q => !respuestas[q.id]?.trim()).length} respuesta(s)`
              : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCerrar}
              disabled={saving}
              className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50 disabled:opacity-40"
            >
              Saltar (no responder)
            </button>
            <button
              onClick={handleAvanzar}
              disabled={saving || (tienePreguntas && !todasRespondidas)}
              className="rounded-md bg-primary px-4 py-1.5 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : tienePreguntas ? 'Guardar y avanzar a 3.C →' : 'Avanzar a 3.C →'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
