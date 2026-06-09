// Editor de plan cerrado — vista lado a lado (feature edición de planes cerrados).
//
// Izquierda: el plan editable (proposito / situacion / criterio) renderizado desde
// el BORRADOR, se actualiza en vivo cuando se aplican cambios.
// Derecha: chat. El usuario pide cambios en lenguaje natural; el modelo explica el
// impacto y propone cambios; con el OK del usuario se aplican al borrador. El plan
// REAL solo cambia al "Aplicar al plan" (crea versión nueva).

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditorDagCanvas } from './EditorDagCanvas'
import type { PlanDraft, ReconcileChange, DraftMovCambio, PlanDraftMensaje } from '@/lib/types'

interface Props {
  planId: string
  planNombre: string
  versionActiva: string
}

export function EditorPlanSplit({ planId, planNombre, versionActiva }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [cargando, setCargando] = useState(true)
  const [mensajes, setMensajes] = useState<PlanDraftMensaje[]>([])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [propuesta, setPropuesta] = useState<{ cambios: ReconcileChange[]; cambiosInv: DraftMovCambio[] } | null>(null)
  const [cierre, setCierre] = useState<string | null>(null)
  const [aplicandoCambios, setAplicandoCambios] = useState(false)
  const [accion, setAccion] = useState<'aplicar' | 'descartar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'plan' | 'mapa'>('plan')
  const chatEndRef = useRef<HTMLDivElement>(null)

  function onDraftActualizado(d: PlanDraft, c: string | null) {
    setDraft(d)
    if (c) setCierre(c)
  }

  async function editarCampoDirecto(cambio: DraftMovCambio) {
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/draft/inventario-directo`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mov_cambios: [cambio] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      onDraftActualizado(data.draft, data.cierre ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/planes-estrategicos/${planId}/draft/iniciar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
        setDraft(data.draft)
        setMensajes(data.draft.mensajes ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setCargando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, propuesta])

  async function enviar() {
    const m = input.trim()
    if (!m || enviando) return
    setEnviando(true); setError(null); setPropuesta(null)
    setMensajes(prev => [...prev, { rol: 'user', texto: m, ts: new Date().toISOString() }])
    setInput('')
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/draft/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensaje: m }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      const cambios: ReconcileChange[] = data.cambios ?? []
      const cambiosInv: DraftMovCambio[] = data.cambios_inventario ?? []
      setMensajes(prev => [...prev, { rol: 'model', texto: data.respuesta, ts: new Date().toISOString(), cambios_propuestos: cambios, cambios_inventario: cambiosInv }])
      if (cambios.length > 0 || cambiosInv.length > 0) setPropuesta({ cambios, cambiosInv })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  async function aplicarAlBorrador(p: { cambios: ReconcileChange[]; cambiosInv: DraftMovCambio[] }) {
    if (aplicandoCambios) return
    setAplicandoCambios(true); setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/draft/aplicar-cambios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cambios: p.cambios, cambios_inventario: p.cambiosInv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setDraft(data.draft)
      setPropuesta(null)
      if (data.cierre) setCierre(data.cierre)
      const extra = data.cierre ? ` Cronograma: cierra ${data.cierre}.` : ''
      setMensajes(prev => [...prev, { rol: 'model', texto: `✓ Apliqué ${data.aplicados} cambio(s) al borrador.${data.noEncontrados || data.noAplicadosInv ? ` (${(data.noEncontrados || 0) + (data.noAplicadosInv || 0)} no se aplicaron)` : ''}${extra}`, ts: new Date().toISOString() }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAplicandoCambios(false)
    }
  }

  async function aplicarAlPlan() {
    if (accion) return
    setAccion('aplicar'); setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/draft/aplicar-al-plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      router.push(`/planes-estrategicos/${planId}/vista?aplicado=${data.version ?? ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setAccion(null)
    }
  }

  async function descartar() {
    if (accion) return
    if (!confirm('¿Descartar el borrador? Se pierden los cambios no aplicados al plan.')) return
    setAccion('descartar'); setError(null)
    try {
      await fetch(`/api/planes-estrategicos/${planId}/draft/descartar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      router.push(`/planes-estrategicos/${planId}/vista`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setAccion(null)
    }
  }

  const cambiosAplicados = (draft?.cambios_aplicados?.length ?? 0) + (draft?.cambios_inventario_aplicados?.length ?? 0)

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-background text-foreground">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-sidebar-border flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold truncate">{planNombre}</p>
          <p className="text-[12px] text-muted-foreground">Editando sobre {versionActiva} · borrador {cambiosAplicados > 0 ? `· ${cambiosAplicados} cambio(s) listo(s)` : '(sin cambios aún)'}{cierre ? ` · cronograma cierra ${cierre}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={descartar} disabled={!!accion}
            className="rounded-lg border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-accent/60 text-[13px] px-3 py-1.5 transition-colors disabled:opacity-40">
            {accion === 'descartar' ? 'Descartando…' : 'Descartar'}
          </button>
          <button onClick={aplicarAlPlan} disabled={!!accion || cambiosAplicados === 0}
            title={cambiosAplicados === 0 ? 'Aplicá algún cambio al borrador primero' : 'Crea una versión nueva del plan'}
            className={`rounded-lg text-[13px] font-medium px-4 py-1.5 transition-colors ${cambiosAplicados > 0 && !accion ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
            {accion === 'aplicar' ? 'Aplicando…' : 'Aplicar al plan →'}
          </button>
        </div>
      </div>

      {error && <div className="px-5 py-2 bg-red-900/30 border-b border-red-800 text-[12px] text-red-200 flex-shrink-0">{error}</div>}

      <div className="flex flex-1 min-h-0">
        {/* Izquierda: el plan (borrador) — vista Plan o Mapa de dependencias */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-sidebar-border">
          <div className="flex items-center gap-1 px-4 py-2 border-b border-sidebar-border flex-shrink-0">
            <button onClick={() => setVista('plan')} className={`text-[12px] px-3 py-1 rounded transition-colors ${vista === 'plan' ? 'bg-blue-700 text-white' : 'text-muted-foreground hover:text-foreground'}`}>Plan</button>
            <button onClick={() => setVista('mapa')} className={`text-[12px] px-3 py-1 rounded transition-colors ${vista === 'mapa' ? 'bg-blue-700 text-white' : 'text-muted-foreground hover:text-foreground'}`}>Mapa de dependencias</button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {cargando ? (
              <p className="text-[13px] text-muted-foreground px-6 py-5">Cargando borrador…</p>
            ) : !draft ? (
              <p className="text-[13px] text-muted-foreground px-6 py-5">No se pudo cargar el borrador.</p>
            ) : vista === 'mapa' ? (
              <EditorDagCanvas planId={planId} draft={draft} onDraftActualizado={onDraftActualizado} />
            ) : (
              <div className="h-full overflow-y-auto px-6 py-5">
                <PlanEditable draft={draft} onEditarDuracion={(movId, dur) => editarCampoDirecto({ id: 'dir', mov_id: movId, campo: 'duracion_meses_ejecucion', valor_nuevo: dur })} />
              </div>
            )}
          </div>
        </div>

        {/* Derecha: chat */}
        <div className="w-[420px] flex-shrink-0 flex flex-col bg-sidebar/30">
          <div className="px-4 py-3 border-b border-sidebar-border flex-shrink-0">
            <p className="text-[13px] font-semibold">Editar con la IA</p>
            <p className="text-[11px] text-muted-foreground">Pedí un cambio; la IA te explica el impacto y propone. Vos confirmás.</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {mensajes.length === 0 && (
              <p className="text-[12px] text-muted-foreground italic">Ej: "la métrica de ventas son 250 por semana, no 1000 por mes".</p>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={m.rol === 'user' ? 'text-right' : ''}>
                <div className={`inline-block max-w-[92%] text-left rounded-lg px-3 py-2 text-[13px] leading-relaxed ${m.rol === 'user' ? 'bg-blue-700/40 border border-blue-700/50 text-blue-50' : 'bg-gray-800/70 border border-gray-700 text-gray-100'}`}>
                  {m.texto}
                  {m.rol === 'model' && ((m.cambios_propuestos?.length ?? 0) > 0 || (m.cambios_inventario?.length ?? 0) > 0) && (
                    <div className="mt-2 space-y-1.5">
                      {(m.cambios_propuestos ?? []).map(c => <CambioChip key={c.id} c={c} />)}
                      {(m.cambios_inventario ?? []).map(c => <MovChip key={c.id} c={c} />)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {enviando && <p className="text-[12px] text-muted-foreground">La IA está analizando el impacto…</p>}

            {/* Propuesta pendiente de confirmar */}
            {propuesta && (propuesta.cambios.some(c => !c.fuera_de_alcance) || propuesta.cambiosInv.length > 0) && (
              <div className="rounded-lg border border-purple-700/60 bg-purple-950/30 p-3 space-y-2">
                <p className="text-[12px] text-purple-200 font-semibold">¿Aplico estos cambios al borrador?</p>
                <div className="flex gap-2">
                  <button onClick={() => aplicarAlBorrador(propuesta)} disabled={aplicandoCambios}
                    className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-[12px] font-medium px-3 py-1.5 rounded">
                    {aplicandoCambios ? 'Aplicando…' : 'Aplicar al borrador'}
                  </button>
                  <button onClick={() => setPropuesta(null)} disabled={aplicandoCambios}
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-[12px] px-3 py-1.5 rounded">
                    Ahora no
                  </button>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-sidebar-border flex-shrink-0">
            <div className="flex gap-2">
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                disabled={cargando || enviando} rows={2}
                placeholder="Pedí un cambio…"
                className="flex-1 text-[13px] text-foreground bg-background border border-sidebar-border rounded px-3 py-2 focus:border-blue-500 focus:outline-none resize-none disabled:opacity-50" />
              <button onClick={enviar} disabled={cargando || enviando || !input.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-[13px] font-medium px-3 rounded transition-colors">
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MovChip({ c }: { c: DraftMovCambio }) {
  const desc = c.campo
    ? `${c.mov_id} · ${c.campo} → ${Array.isArray(c.valor_nuevo) ? c.valor_nuevo.join(', ') : c.valor_nuevo}`
    : `${c.mov_id} · dependencia ${c.dep?.accion} ${c.dep?.desde}${c.dep?.tipo ? ` (${c.dep.tipo})` : ''}${c.dep?.lag_meses ? ` +${c.dep.lag_meses}m` : ''}`
  return (
    <div className="rounded border border-cyan-800/50 bg-cyan-950/30 px-2 py-1.5 text-[11px]">
      <div className="text-cyan-300 uppercase font-semibold mb-0.5">inventario · {c.severidad ?? 'Media'}</div>
      <div className="text-cyan-100">{desc}</div>
      {c.motivo && <div className="text-gray-400 mt-0.5">{c.motivo}</div>}
    </div>
  )
}

function CambioChip({ c }: { c: ReconcileChange }) {
  if (c.fuera_de_alcance) {
    return (
      <div className="rounded border border-gray-700/60 bg-gray-800/40 px-2 py-1 text-[11px] text-gray-400">
        <span className="uppercase font-semibold">{c.surface}</span> · fuera de alcance (inventario/Gantt) — no se aplica aún
      </div>
    )
  }
  return (
    <div className="rounded border border-purple-800/50 bg-purple-950/30 px-2 py-1.5 text-[11px]">
      <div className="text-purple-300 uppercase font-semibold mb-0.5">{c.surface} · {c.severidad}</div>
      <div className="text-gray-400 line-through">{c.que_dice_estructura}</div>
      <div className="text-purple-100">→ {c.cambio_propuesto}</div>
    </div>
  )
}

// ─── Render del plan editable (borrador) ─────────────────────────────────────

function PlanEditable({ draft, onEditarDuracion }: { draft: PlanDraft; onEditarDuracion: (movId: string, dur: number) => void }) {
  const p = draft.proposito
  const s = draft.situacion
  const crit = (draft.preparativos as any)?.criterio_exito
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Lo editable en esta versión — el resto del plan (inventario, dependencias, Gantt) no se toca todavía.</p>
      {p && (
        <section>
          <h2 className="text-[16px] font-semibold mb-2">Propósito</h2>
          {p.escena && <Campo label="Lugar de llegada" v={p.escena} />}
          {p.metricas?.length > 0 && (
            <Campo label="Métricas" v={p.metricas.map((m: any) => typeof m === 'string' ? m : `${m.metrica}: ${m.valor_objetivo}${m.valor_actual ? ` (hoy: ${m.valor_actual})` : ''}`).join('\n')} />
          )}
          {p.horizonte && <Campo label="Horizonte" v={p.horizonte} />}
          {p.estabilidad && <Campo label="Estabilidad" v={p.estabilidad} />}
        </section>
      )}
      {s && (
        <section>
          <h2 className="text-[16px] font-semibold mb-2">Situación</h2>
          {s.desvio_principal && <Campo label="Desvío principal" v={s.desvio_principal} />}
          {s.desvio_cuantificado && <Campo label="Cuantificación" v={s.desvio_cuantificado} />}
          {s.causa_raiz && <Campo label="Causa raíz" v={s.causa_raiz} />}
          {s.recursos_faltantes && <Campo label="Recursos faltantes" v={s.recursos_faltantes} />}
          {s.consecuencia_6m && <Campo label="Consecuencia 6m" v={s.consecuencia_6m} />}
          {s.consecuencia_12m && <Campo label="Consecuencia 12m" v={s.consecuencia_12m} />}
        </section>
      )}
      {crit && (
        <section>
          <h2 className="text-[16px] font-semibold mb-2">Criterio de éxito</h2>
          {(crit.por_metrica ?? []).map((c: any, i: number) => (
            <Campo key={i} label={c.metrica} v={`Pleno: ${c.pleno}\nMínimo: ${c.minimo}`} />
          ))}
          {crit.zona_fracaso && <Campo label="Zona de fracaso" v={crit.zona_fracaso} />}
        </section>
      )}
      <InventarioEditable draft={draft} onEditarDuracion={onEditarDuracion} />
    </div>
  )
}

function InventarioEditable({ draft, onEditarDuracion }: { draft: PlanDraft; onEditarDuracion: (movId: string, dur: number) => void }) {
  const movs = (draft.inventario?.movimientos ?? []).filter((m: any) => m.estado_usuario !== 'quitado')
  if (movs.length === 0) return null
  return (
    <section>
      <h2 className="text-[16px] font-semibold mb-2">Inventario de movimientos ({movs.length})</h2>
      <p className="text-[11px] text-muted-foreground mb-2">Editá la duración directamente acá, o pedí cambios por chat (nombre, brechas, banda, dueño, dependencias). El cronograma se recalcula solo. Las dependencias se editan en el "Mapa".</p>
      <div className="space-y-2">
        {movs.map((m: any) => (
          <div key={m.id} className="rounded border border-sidebar-border bg-sidebar/40 px-3 py-2">
            <p className="text-[13px] font-medium">{m.id} · {m.nombre}</p>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
              <span>banda {m.costo_banda_ancha} ·</span>
              <DuracionInput movId={m.id} valor={m.duracion_meses_ejecucion} onCommit={onEditarDuracion} />
              <span>· dueño {m.dueno || '—'}</span>
              {(m.precondiciones?.length ?? 0) > 0 && <span>· depende de {m.precondiciones.join(', ')}</span>}
            </div>
            {m.brechas_atacadas?.length > 0 && (
              <p className="text-[11px] text-foreground/80 mt-0.5">brechas: {m.brechas_atacadas.join(' · ')}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function DuracionInput({ movId, valor, onCommit }: { movId: string; valor: number | undefined; onCommit: (movId: string, dur: number) => void }) {
  const [v, setV] = useState(valor != null ? String(valor) : '')
  const original = valor != null ? String(valor) : ''
  function commit() {
    const n = parseInt(v, 10)
    if (Number.isFinite(n) && n >= 0 && String(n) !== original) onCommit(movId, n)
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input value={v} onChange={e => setV(e.target.value.replace(/[^0-9]/g, ''))} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-10 text-center text-[11px] bg-background border border-sidebar-border rounded px-1 py-0.5 focus:border-blue-500 focus:outline-none" />
      <span>m</span>
    </span>
  )
}

function Campo({ label, v }: { label: string; v: string }) {
  return (
    <div className="mb-3">
      <p className="text-[12px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{v}</p>
    </div>
  )
}
