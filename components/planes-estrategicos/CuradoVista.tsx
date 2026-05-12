'use client'

// Vista del Plan Curado (Sub-bloque 3.E).
//
// Modal con las 6 secciones del PlanCuradoPE en modo READ-ONLY (sin drag-drop,
// sin marcas por elemento — el curado es FINAL). Footer permite:
//   - "Pedir ajuste narrativo": abre textarea para que el user describa qué
//     querría cambiar narrativamente. Re-llama el endpoint /generar con el
//     ajuste como input para regenerar el curado.
//   - "Aprobar y cerrar Paso 3": envía mensaje al chat indicando aprobación.
//     El modelo, viendo plan.curado poblado + mensaje de aprobación, emite
//     cierre_sugerido=true en su PANEL_UPDATE. El chat/route ya tiene la
//     lógica que transiciona sub_estado_paso='cierre_sugerido' y dispara
//     el flow del audit-reviewer existente.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlanCuradoPE } from '@/lib/types'

interface Props {
  curado: PlanCuradoPE
  onCerrar: () => void
  // Callback al pedir ajuste narrativo. El padre llama al endpoint /generar
  // con { ajuste_narrativo } y refresca el plan local.
  onPedirAjuste?: (textoAjuste: string) => void
  // Callback al aprobar. El padre envía mensaje al chat para que el modelo
  // emita cierre_sugerido y dispare audit.
  onAprobar?: () => void
  saving?: boolean
  // Versionado del curado (Feature 2 — 3.E no-destructivo):
  // - totalVersiones: cuántas versiones existen en plan.curado.versiones[].
  // - versionActiva: índice 0-based de la versión actualmente seleccionada.
  // - onCambiarVersion: callback para navegar entre versiones (PATCH al endpoint /version).
  // Si totalVersiones <= 1, no se muestran controles de navegación.
  totalVersiones?: number
  versionActiva?: number
  onCambiarVersion?: (nuevaVersion: number) => void
}

export function CuradoVista(props: Props) {
  if (typeof document === 'undefined') return null
  return createPortal(<Contenido {...props} />, document.body)
}

function Contenido({ curado, onCerrar, onPedirAjuste, onAprobar, saving, totalVersiones, versionActiva, onCambiarVersion }: Props) {
  const [modoAjuste, setModoAjuste] = useState(false)
  const [textoAjuste, setTextoAjuste] = useState('')

  const tieneVersiones = (totalVersiones ?? 0) > 1
  const puedeIrAnterior = tieneVersiones && (versionActiva ?? 0) > 0
  const puedeIrSiguiente = tieneVersiones && (versionActiva ?? 0) < (totalVersiones ?? 1) - 1

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !saving) onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar, saving])

  function handlePedirAjuste() {
    const texto = textoAjuste.trim()
    if (!texto) return
    onPedirAjuste?.(texto)
    // Mantenemos modoAjuste abierto hasta que la regeneración termine y el
    // padre cierre/refresque. El padre puede resetear via prop cambio si quiere.
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-sans"
      onClick={() => !saving && onCerrar()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 border-b border-sidebar-border px-6 py-5 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-primary/80">
                Sub-bloque 3.E · Plan curado
              </p>
              <h2 className="mt-1.5 text-[20px] font-bold text-foreground">
                Versión final del Paso 3
              </h2>
              <p className="mt-1.5 text-[12px] text-muted-foreground italic leading-relaxed">
                Integra el borrador aceptado de 3.C + los ajustes registrados en 3.D. Leelo entero antes de aprobar — una vez cerrado se dispara la auditoría obligatoria por revisor independiente.
              </p>
            </div>
            {tieneVersiones && (
              <div className="flex-shrink-0 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5">
                <p className="text-[12px] font-semibold text-foreground whitespace-nowrap">
                  Versión {(versionActiva ?? 0) + 1} de {totalVersiones}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground italic">
                  {(versionActiva ?? 0) === (totalVersiones ?? 1) - 1 ? 'más reciente' : 'versión previa'}
                </p>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <Seccion titulo="Contexto">
            <p className="text-[14px] text-foreground/95 leading-relaxed whitespace-pre-wrap">{curado.contexto}</p>
          </Seccion>

          <Seccion titulo={`Decisiones de priorización (${curado.decisiones_priorizacion.length})`}>
            <ol className="space-y-3 list-decimal pl-5">
              {curado.decisiones_priorizacion.map((d, i) => (
                <li key={i} className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3 marker:text-muted-foreground/60">
                  <p className="text-[13px] font-semibold text-foreground leading-snug">{d.decision}</p>
                  <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed">{d.razon}</p>
                </li>
              ))}
            </ol>
          </Seccion>

          <Seccion titulo={`Secuencia de movimientos (${curado.secuencia_movimientos.length} fases)`}>
            <div className="space-y-3">
              {curado.secuencia_movimientos.map((f, i) => (
                <div key={i} className="rounded-lg border border-sidebar-border bg-sidebar/30 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <p className="text-[13px] font-semibold text-foreground">
                      <span className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground/70 mr-2">F{i + 1}</span>
                      {f.fase}
                    </p>
                    <p className="text-[12px] text-muted-foreground italic">{f.movimientos.length} mov.</p>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-snug mb-2.5">{f.razon_secuencia}</p>
                  <div className="space-y-1.5">
                    {f.movimientos.map(m => (
                      <div key={m.id} className="rounded-md border border-sidebar-border/60 bg-background/40 px-3 py-1.5">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-[12px] font-semibold text-muted-foreground/80">{m.id}</span>
                          <span className="text-[12px] font-semibold text-foreground leading-snug">{m.nombre}</span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-muted-foreground/90 leading-snug">{m.que_resuelve}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground/70 italic">Dueño: {m.dueno}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Seccion>

          <Seccion titulo={`Supuestos críticos (${curado.supuestos_criticos.length})`}>
            <ul className="space-y-2">
              {curado.supuestos_criticos.map((s, i) => (
                <li key={i} className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-2.5">
                  <p className="text-[13px] text-amber-100 leading-snug">
                    <span className="font-semibold text-amber-200">⚠</span> {s.descripcion}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-amber-200/70">
                    <span>tipo: <span className="font-mono">{s.tipo}</span></span>
                    <span>probabilidad: <span className="font-mono">{s.probabilidad}</span></span>
                    <span>impacto: <span className="font-mono">{s.impacto_signo}/{s.impacto_magnitud}</span></span>
                    <span>estrategia: <span className="font-mono">{s.estrategia}</span></span>
                  </div>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="Criterio de éxito">
            <div className="space-y-2.5">
              <CriterioRow label="Pleno" valor={curado.criterio_exito.pleno} color="green" />
              <CriterioRow label="Mínimo aceptable" valor={curado.criterio_exito.minimo} color="yellow" />
              <CriterioRow label="Path mínimo" valor={curado.criterio_exito.path_minimo} color="blue" />
            </div>
          </Seccion>

          <Seccion titulo={`Alternativas descartadas (${curado.alternativas_descartadas.length})`}>
            <ul className="space-y-2">
              {curado.alternativas_descartadas.map((a, i) => (
                <li key={i} className="rounded-lg border border-sidebar-border bg-sidebar/20 px-4 py-2.5">
                  <p className="text-[13px] font-semibold text-foreground/90 leading-snug">✗ {a.decision}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">{a.razon}</p>
                </li>
              ))}
            </ul>
          </Seccion>
        </div>

        {/* Footer con dos modos: lectura normal / modo ajuste narrativo */}
        <footer className="flex-shrink-0 border-t border-sidebar-border px-6 py-3 bg-sidebar/30">
          {!modoAjuste ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <p className="text-[12px] text-muted-foreground">
                  Generado {new Date(curado.cerrado_en).toLocaleString('es-AR')}
                </p>
                {/* Navegación entre versiones cuando hay más de 1 */}
                {tieneVersiones && onCambiarVersion && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onCambiarVersion((versionActiva ?? 0) - 1)}
                      disabled={!puedeIrAnterior || saving}
                      title="Volver a la versión anterior"
                      className="rounded-md border border-sidebar-border px-2 py-1 text-[12px] font-medium hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ← Anterior
                    </button>
                    <button
                      onClick={() => onCambiarVersion((versionActiva ?? 0) + 1)}
                      disabled={!puedeIrSiguiente || saving}
                      title="Ir a la versión siguiente"
                      className="rounded-md border border-sidebar-border px-2 py-1 text-[12px] font-medium hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onCerrar}
                  disabled={saving}
                  className="rounded-md border border-sidebar-border px-3 py-1.5 text-[13px] hover:bg-accent/50 disabled:opacity-40"
                >
                  Cerrar
                </button>
                {onPedirAjuste && (
                  <button
                    onClick={() => setModoAjuste(true)}
                    disabled={saving}
                    className="rounded-md border border-amber-700/50 bg-amber-950/30 hover:bg-amber-900/40 text-amber-100 px-3 py-1.5 text-[13px] font-medium disabled:opacity-40"
                  >
                    Pedir ajuste narrativo
                  </button>
                )}
                {onAprobar && (
                  <button
                    onClick={onAprobar}
                    disabled={saving}
                    title="Aprobar el curado y cerrar formalmente el Paso 3 — dispara auditoría obligatoria"
                    className="rounded-md bg-primary hover:bg-primary/90 px-4 py-1.5 text-[13px] font-bold text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Procesando…' : 'Aprobar y cerrar Paso 3 →'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[12px] font-semibold text-amber-200">Pedir ajuste narrativo al curado</p>
              <textarea
                value={textoAjuste}
                onChange={e => setTextoAjuste(e.target.value)}
                placeholder="Describí qué te gustaría cambiar narrativamente. Ej: 'el contexto está muy técnico, querría una versión más alta-nivel para presentar a Dirección'. El curado se re-genera con tu pedido."
                rows={3}
                disabled={saving}
                className="w-full resize-y rounded-md border border-amber-700/40 bg-amber-950/30 px-2.5 py-1.5 text-[12px] text-amber-50 placeholder:text-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-500 min-h-[60px]"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setModoAjuste(false); setTextoAjuste('') }}
                  disabled={saving}
                  className="rounded-md border border-sidebar-border px-3 py-1.5 text-[12px] hover:bg-accent/50 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handlePedirAjuste}
                  disabled={saving || !textoAjuste.trim()}
                  className="rounded-md bg-amber-700 hover:bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Regenerando…' : 'Regenerar curado con este ajuste'}
                </button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[15px] font-semibold text-foreground mb-2.5">{titulo}</h3>
      {children}
    </section>
  )
}

function CriterioRow({ label, valor, color }: { label: string; valor: string; color: 'green' | 'yellow' | 'blue' }) {
  const c =
    color === 'green' ? 'border-green-700/50 bg-green-950/30 text-green-100' :
    color === 'yellow' ? 'border-yellow-700/50 bg-yellow-950/30 text-yellow-100' :
    'border-blue-700/50 bg-blue-950/30 text-blue-100'
  return (
    <div className={`rounded-lg border ${c} px-4 py-2.5`}>
      <p className="text-[12px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-[13px] leading-snug">{valor}</p>
    </div>
  )
}
