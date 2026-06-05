'use client'

// Página admin para aplicar el Bloque C de cambios al propósito directamente,
// bypaseando al modelo cuando este verbaliza pero no emite la mutación.
// Carga las métricas actuales del plan, pre-rellena los nuevos valores
// propuestos por el modelo en la conversación, y permite editar antes de
// aplicar. Registra automáticamente un WarningRetroactivo en el plan.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Metrica {
  metrica: string
  valor_objetivo: string
  valor_actual: string
}

// Pre-poblar con los textos propuestos por el modelo en el chat del Bloque C.
// El user puede editar si quiere ajustar antes de aplicar.
const PROPUESTAS_VALOR_OBJETIVO: Record<number, string> = {
  // Métrica 1 (Volumen): saco el acumulado, paso a sostenido semanal.
  // Index 0 (Métrica 1 del array).
  0: '250 ventas/semana consistente durante 8 semanas seguidas hacia fin de 2026 (sostenido, sin meta de acumulado anual)',
  // Métrica 2 (Productividad fijos): definición operativa nueva.
  // Index 1 (Métrica 2). Ajustá el index si tu plan tiene otro orden.
  1: 'Productividad fijos 2x medida como (Nuevos Dueños/mes) / (Total Empleados fijos) + Productividad asesores +25% (mínimo aceptable +12.5%)',
  // Métrica 7 (PAI piloto/sucursales): conversión a semanal.
  // Index 6 (Métrica 7).
  6: '50 ventas/semana en sucursal piloto hacia junio-julio 2026 (consistente por 4 semanas); 3-5 sucursales con 125-250 ventas PAI/semana hacia fin de 2026 (consistente por 8 semanas seguidas); churn proxy validado por el PM antes de Q3 como gate del escalamiento',
}

interface Patch {
  index: number
  valor_objetivo: string
}

export default function FixPropositoBloqueCPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const [metricas, setMetricas] = useState<Metrica[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [patches, setPatches] = useState<Map<number, string>>(new Map())
  const [running, setRunning] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

  // Cargar métricas actuales del plan al mount, vía endpoint dedicado.
  useEffect(() => {
    if (!id) return
    let abortado = false
    fetch(`/api/planes-estrategicos/${id}/admin/patch-proposito-metricas`)
      .then(r => r.json())
      .then(data => {
        if (abortado) return
        if (!data?.ok) {
          setLoadError(data?.error ?? 'Error desconocido al cargar las métricas.')
          return
        }
        const m = data.metricas
        if (Array.isArray(m) && m.length > 0) {
          setMetricas(m)
          const initial = new Map<number, string>()
          for (const [idx, txt] of Object.entries(PROPUESTAS_VALOR_OBJETIVO)) {
            const i = parseInt(idx, 10)
            if (i < m.length) initial.set(i, txt)
          }
          setPatches(initial)
        } else {
          setLoadError('El plan no tiene métricas declaradas en el propósito.')
        }
      })
      .catch(e => {
        if (!abortado) setLoadError(`Error cargando el plan: ${e?.message ?? String(e)}`)
      })
    return () => { abortado = true }
  }, [id])

  function actualizarPatch(index: number, nuevoValor: string) {
    setPatches(prev => {
      const next = new Map(prev)
      next.set(index, nuevoValor)
      return next
    })
  }

  function descartarPatch(index: number) {
    setPatches(prev => {
      const next = new Map(prev)
      next.delete(index)
      return next
    })
  }

  async function aplicar() {
    if (!id || running || !metricas) return
    setRunning(true)
    setResultado(null)
    try {
      const lista: Patch[] = Array.from(patches.entries())
        .filter(([_, v]) => v.trim().length > 0)
        .map(([index, valor_objetivo]) => ({ index, valor_objetivo }))
      if (lista.length === 0) {
        setResultado({ ok: false, mensaje: 'No hay patches a aplicar (todas las métricas vacías o sin cambio).' })
        setRunning(false)
        return
      }

      // Construir descripción para warning.
      const descripcionPartes = lista.map(p => `Métrica ${p.index + 1}: "${metricas[p.index].valor_objetivo}" → "${p.valor_objetivo}"`)
      const warning = {
        bloque_afectado: 'Paso 1 — Propósito · Métricas',
        descripcion_cambio: `Bloque C aplicado vía admin: ${lista.length} métrica${lista.length === 1 ? '' : 's'} modificada${lista.length === 1 ? '' : 's'}. ${descripcionPartes.join(' · ')}`,
        texto_previo: lista.map(p => `[Métrica ${p.index + 1}] ${metricas[p.index].valor_objetivo}`).join('\n---\n'),
        impactos_detectados: [
          'Plan de ventas pasa de mensual a semanal',
          'Cronograma de blitz debe llegar antes de octubre para sostener 8 semanas',
          'Acumulado anual deja de ser métrica del plan',
        ],
      }

      const res = await fetch(`/api/planes-estrategicos/${id}/admin/patch-proposito-metricas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patches: lista, warning }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResultado({ ok: false, mensaje: data?.error ?? `HTTP ${res.status}` })
      } else {
        setResultado({ ok: true, mensaje: `OK — ${data.patches_aplicados} métrica(s) actualizadas. Warning registrado: ${data.warning_registrado ? 'sí' : 'no'}.` })
      }
    } catch (e) {
      setResultado({ ok: false, mensaje: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-[14px] text-red-300">{loadError}</p>
        </div>
      </div>
    )
  }

  if (!metricas) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-[13px] text-muted-foreground">Cargando métricas del plan…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="space-y-2">
          <h1 className="text-[20px] font-bold text-foreground">Fix métricas del propósito — Bloque C</h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Página temporal: aplica cambios al array <code>proposito.metricas</code> directamente, registrando un warning_retroactivo en <code>plan.warnings_retroactivos</code> como audit trail. Usar si el chat verbalizó los cambios pero no los persistió.
          </p>
        </header>

        <section className="space-y-3">
          {metricas.map((m, i) => {
            const tienePropuesta = patches.has(i) && patches.get(i)!.trim().length > 0
            return (
              <div key={i} className={`rounded-lg border ${tienePropuesta ? 'border-amber-700/40 bg-amber-950/15' : 'border-sidebar-border bg-sidebar/30'} px-4 py-3 space-y-2`}>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] text-muted-foreground/80">Métrica {i + 1}</span>
                  <span className="text-[13px] font-semibold text-foreground">{m.metrica}</span>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">Valor objetivo actual</p>
                  <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap rounded border border-sidebar-border bg-background/40 px-3 py-2">
                    {m.valor_objetivo || '(vacío)'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90 mb-1 flex items-center justify-between">
                    Nuevo valor objetivo {tienePropuesta && <span className="text-[10px] font-normal text-amber-200/70 italic">(será aplicado)</span>}
                  </p>
                  <textarea
                    value={patches.get(i) ?? ''}
                    onChange={e => actualizarPatch(i, e.target.value)}
                    rows={4}
                    placeholder="Dejá vacío si esta métrica no cambia."
                    className="w-full resize-y rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-50 placeholder:text-amber-200/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  {tienePropuesta && (
                    <button
                      onClick={() => descartarPatch(i)}
                      className="mt-1 text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Descartar este cambio (no modificar Métrica {i + 1})
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>

        <div className="flex items-center gap-3">
          <button
            onClick={aplicar}
            disabled={running}
            className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {running ? 'Aplicando…' : 'Aplicar cambios al propósito'}
          </button>
          <p className="text-[12px] text-muted-foreground">
            {Array.from(patches.values()).filter(v => v.trim().length > 0).length} métrica(s) marcadas para cambiar
          </p>
        </div>

        {resultado && (
          <section className={`rounded-lg border px-4 py-3 ${resultado.ok ? 'border-green-700/40 bg-green-950/20' : 'border-red-700/40 bg-red-950/20'}`}>
            <p className={`text-[13px] ${resultado.ok ? 'text-green-200' : 'text-red-200'}`}>
              <span className="font-semibold">{resultado.ok ? '✓' : '✗'}</span> {resultado.mensaje}
            </p>
            {resultado.ok && (
              <p className="mt-2 text-[12px] text-green-200/80 leading-relaxed">
                Volvé a la entrevista, regenerá el curado (botón "Generar plan curado" o "Pedir ajuste narrativo" desde el modal del curado) y las nuevas métricas se van a reflejar en el criterio de éxito final.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
