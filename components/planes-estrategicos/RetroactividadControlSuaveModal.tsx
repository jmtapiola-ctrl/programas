'use client'

// Modal de control suave (Fase F — H7 retroactividad fluida).
//
// Disparado por el SSE event 'retroactividad_control_suave' que emite el chat
// route cuando el modelo detecta un cambio retroactivo estructural sobre
// material validado. El user lee qué se va a cambiar + impactos + confirma o
// cancela.
//
// Confirmar:
//   1. POST /paso3/retroactividad/confirmar — registra WarningRetroactivo en
//      plan.warnings_retroactivos (audit trail permanente).
//   2. Frontend envía mensaje "[Sistema] Usuario confirma cambio retroactivo: X"
//      al chat. El modelo aplica la mutación en su próximo turno.
//
// Cancelar:
//   - No-op silencioso. El modal se cierra. El cambio no se aplica.
//     (El modelo en su próximo turno no va a re-detectar la misma cosa
//     porque el último mensaje del user habrá cambiado de tópico.)

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface CambioRetroactivoPayload {
  bloque_afectado: string
  texto_previo: string
  descripcion_cambio: string
  impactos_detectados: string[]
}

interface Props {
  cambio: CambioRetroactivoPayload
  onConfirmar: () => void  // padre maneja: POST endpoint + envío de mensaje al chat
  onCancelar: () => void
  saving?: boolean
  error?: string | null
}

export function RetroactividadControlSuaveModal(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ cambio, onConfirmar, onCancelar, saving, error }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onCancelar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancelar, saving])

  if (!mounted) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans"
      onClick={() => !saving && onCancelar()}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border-2 border-amber-700/70 bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-amber-700/40 bg-gradient-to-r from-amber-900/40 to-transparent px-6 py-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-300/90">
            Control de cambio retroactivo
          </p>
          <h2 className="mt-1 text-[17px] font-semibold text-foreground leading-snug">
            El cambio toca material validado: <span className="text-amber-200">{cambio.bloque_afectado}</span>
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {cambio.texto_previo && (
            <section>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1.5">Antes decía</p>
              <div className="rounded-lg border border-sidebar-border bg-sidebar/40 px-4 py-3 text-[13px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
                {cambio.texto_previo}
              </div>
            </section>
          )}

          <section>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1.5">Cambio propuesto</p>
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-[13px] text-amber-100 leading-relaxed">
              {cambio.descripcion_cambio}
            </div>
          </section>

          {cambio.impactos_detectados.length > 0 && (
            <section>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1.5">
                Impactos detectados ({cambio.impactos_detectados.length})
              </p>
              <ul className="space-y-1.5">
                {cambio.impactos_detectados.map((imp, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-foreground/85 leading-snug">
                    <span className="text-amber-400/80 mt-0.5 flex-shrink-0">⚠</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-blue-800/40 bg-blue-950/20 px-4 py-3 text-[12px] text-blue-200 leading-relaxed">
            <p>
              Si confirmás, el cambio se aplica + queda registrado un warning permanente en el plan con tu autoría y timestamp.
              No vas a poder revertirlo silenciosamente — la trazabilidad es load-bearing para futuras auditorías.
            </p>
          </section>

          {error && (
            <div className="rounded-lg border border-red-700 bg-red-950/50 px-4 py-3 text-[13px] text-red-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={saving}
            className="rounded-md border border-sidebar-border px-4 py-2 text-[13px] hover:bg-accent/50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={saving}
            className="rounded-md bg-amber-700 hover:bg-amber-600 px-4 py-2 text-[13px] font-bold text-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Aplicando…' : 'Confirmar cambio →'}
          </button>
        </footer>
      </div>
    </div>
  )
}
