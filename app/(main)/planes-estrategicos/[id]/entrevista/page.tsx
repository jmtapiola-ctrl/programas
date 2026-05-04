'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChatInterface } from '@/components/planes-estrategicos/ChatInterface'
import { PanelLateral } from '@/components/planes-estrategicos/PanelLateral'
import { InventarioCategoria } from '@/components/planes-estrategicos/InventarioCategoria'
import { PalancasValidadorModal } from '@/components/planes-estrategicos/PalancasValidadorModal'
import type { PlanEstrategico, TurnoPE, PanelUpdatePE, InventarioPE } from '@/lib/types'

const PANEL_UPDATE_RE = /<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/g

export default function EntrevistaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [plan, setPlan] = useState<PlanEstrategico | null>(null)
  const [planSr, setPlanSr] = useState<PlanEstrategico | null>(null)
  const [historial, setHistorial] = useState<TurnoPE[]>([])
  const [panelData, setPanelData] = useState<PanelUpdatePE | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  // isPersisting: true desde 'content_done' hasta el cierre del stream. Indica
  // que el modelo terminó de emitir tokens y el backend está parseando + persistiendo
  // + transicionando estado. El textarea sigue disabled (porque el turno aún no
  // se confirmó) pero la UI muestra "Guardando..." en vez de tres puntitos.
  const [isPersisting, setIsPersisting] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [panelUnhealthy, setPanelUnhealthy] = useState<{ reason: string; detail: string } | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [pausing, setPausing] = useState(false)
  const [loading, setLoading] = useState(true)
  // Sub-bloque 3.A — Inventario
  const [subBloqueActual, setSubBloqueActual] = useState<string>('0')
  const [inventarioOverride, setInventarioOverride] = useState<InventarioPE | null>(null)
  const [generandoInventario, setGenerandoInventario] = useState(false)
  const [generarError, setGenerarError] = useState<string | null>(null)
  const [mostrarModalInventario, setMostrarModalInventario] = useState(false)
  // Sub-bloque 3.B — Palancas (validador cross-provider).
  // null = no se disparó. 'inferring' = llamando endpoint. 'ready' = modal visible.
  const [palancasValidador, setPalancasValidador] = useState<
    | null
    | { status: 'inferring' }
    | { status: 'ready'; propuesta: { preguntas: Array<{ id: string; pregunta: string; razon_complementariedad: string }>; razonamiento_global: string }; costoUsd?: number; latenciaMs?: number }
  >(null)
  // Flag para evitar doble disparo del validador (ej: si llegan 2 PANEL_UPDATEs
  // seguidos con plan.palancas.preguntas_principal completas).
  const [validadorDisparado, setValidadorDisparado] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Cargar plan y entrevista al montar
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/planes-estrategicos/${id}`)
        const { plan } = await res.json()
        setPlan(plan)

        // Cargar Plan Sr si es Jr
        if (plan.tipo === 'Jr' && plan.plan_sr_id) {
          const resSr = await fetch(`/api/planes-estrategicos/${plan.plan_sr_id}`)
          if (resSr.ok) {
            const { plan: sr } = await resSr.json()
            setPlanSr(sr)
          }
        }

        // Cargar historial + estado de la entrevista
        const resE = await fetch(`/api/planes-estrategicos/${id}/entrevista`)
        if (resE.ok) {
          const { entrevista } = await resE.json()
          const hist: TurnoPE[] = entrevista?.historial ?? []
          setHistorial(hist)
          setSubBloqueActual(entrevista?.sub_bloque_actual ?? '0')

          // Si historial vacío → disparar apertura del Paso 0
          if (hist.length === 0) {
            // pequeño delay para que el UI cargue primero
            setTimeout(() => sendMessage('', hist, plan), 800)
          }
        }
      } catch (err) {
        console.error('[Entrevista] Error cargando:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const sendMessage = useCallback(async (
    mensaje: string,
    historialActual?: TurnoPE[],
    planActual?: PlanEstrategico | null
  ) => {
    const histToUse = historialActual ?? historial
    const planToUse = planActual ?? plan

    setError(null)
    setIsStreaming(true)
    setStreamingContent('')
    setPendingMessage(mensaje)

    let accumulated = ''

    try {
      const res = await fetch('/api/planes-estrategicos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: id, mensaje }),
      })

      if (!res.ok) throw new Error('Error en la solicitud')
      if (!res.body) throw new Error('Sin respuesta')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'delta') {
              accumulated += evt.content
              setStreamingContent(accumulated)
            } else if (evt.type === 'content_done') {
              // Modelo terminó de emitir tokens. El backend ahora persiste
              // (parser + Airtable + transiciones). UI cambia a "Guardando...".
              setIsPersisting(true)
            } else if (evt.type === 'sub_bloque_cerrado') {
              // Cierre interno de un sub-bloque del Paso 3 (3.0 o 3.A). El
              // backend creó snapshot. El sub_bloque_actual de la entrevista ya
              // se actualizó al siguiente sub-bloque por el PANEL_UPDATE del
              // modelo. Refrescamos el state local desde el evento para que la
              // UI condicional (banner del 3.A) reaccione sin esperar refresh.
              if (evt.sub_bloque) {
                // El evento dice qué sub-bloque se cerró; el actual es el siguiente
                const siguiente = evt.sub_bloque === '3.0' ? '3.A' : evt.sub_bloque === '3.A' ? '3.B' : evt.sub_bloque
                setSubBloqueActual(siguiente)
              }
            } else if (evt.type === 'done') {
              if (evt.panelUpdate) {
                setPanelData(evt.panelUpdate)
                // Sincronizar subBloqueActual local con el último PANEL_UPDATE.
                // Sin esto, la UI condicional (banner 3.A) queda con el sub_bloque
                // del load inicial y no reacciona a cambios durante la conversación.
                if (evt.panelUpdate.sub_bloque_actual) {
                  setSubBloqueActual(evt.panelUpdate.sub_bloque_actual)
                }
                // Trigger automático del validador del Sub-bloque 3.B:
                // si el modelo emitió plan.palancas.preguntas_principal con 5 items
                // todos respondidos, y todavía no llamamos al validador, dispararlo.
                const palancas = evt.panelUpdate.plan?.palancas
                const principal = palancas?.preguntas_principal ?? []
                const todasResp = principal.length === 5 && principal.every((q: any) => q.respuesta?.trim())
                const yaTieneValidador = (palancas?.preguntas_validador ?? []).length > 0
                if (todasResp && !yaTieneValidador && !validadorDisparado && !palancasValidador) {
                  setValidadorDisparado(true)
                  void dispararValidadorPalancas()
                }
              }
            } else if (evt.type === 'save_failed') {
              // El modelo respondió pero la persistencia falló los 3 reintentos.
              // No se pueden mandar mensajes nuevos sin reproducir el bug original
              // (próxima llamada cargaría historial sin estos turnos). Bloqueamos.
              setSaveFailed(true)
              setError(`No se pudo guardar el último turno (${evt.detail ?? 'error desconocido'}). Recargá la página y reintentá tu último mensaje antes de continuar.`)
            } else if (evt.type === 'panel_unhealthy') {
              // El panel lateral no se está actualizando — la conversación sigue,
              // pero los datos estructurados del plan pueden estar desactualizados.
              // Banner amarillo (warning), no bloquea el input.
              setPanelUnhealthy({ reason: evt.reason ?? 'unknown', detail: evt.detail ?? '' })
            } else if (evt.type === 'error') {
              throw new Error(evt.message)
            }
          } catch (parseErr) {
            // línea malformada, continuar
          }
        }
      }

      // Agregar los turnos al historial local
      const textoLimpio = accumulated.replace(PANEL_UPDATE_RE, '').trim()
      const turnoUsuario: TurnoPE = {
        rol: 'user',
        contenido: mensaje || 'Comenzar entrevista',
        timestamp: new Date().toISOString(),
        paso: 0,
      }
      const turnoModelo: TurnoPE = {
        rol: 'model',
        contenido: textoLimpio,
        timestamp: new Date().toISOString(),
        paso: 0,
      }

      // Si fue el mensaje inicial (historial vacío), no agregamos el turno usuario vacío
      if (mensaje.trim() === '' && histToUse.length === 0) {
        setHistorial([turnoModelo])
      } else {
        setHistorial(prev => [...prev, turnoUsuario, turnoModelo])
      }

      setPendingMessage(null)
    } catch (err: any) {
      console.error('[Entrevista] Error en stream:', err)
      setError('Hubo un problema con la conexión.')
    } finally {
      setIsStreaming(false)
      setIsPersisting(false)
      setStreamingContent('')
    }
  }, [id, historial, plan])

  function handleRetry() {
    if (pendingMessage !== null) {
      sendMessage(pendingMessage)
    }
  }

  async function handleEnviar() {
    const msg = inputValue.trim()
    if (!msg || isStreaming) return
    setInputValue('')
    sendMessage(msg)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleEnviar()
    }
  }

  // ── Sub-bloque 3.A — generación + cierre del Inventario ───────────────────

  async function handleGenerarInventario() {
    if (generandoInventario) return
    setGenerandoInventario(true)
    setGenerarError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      // Persistir override local — el plan en Airtable ya se actualizó
      setInventarioOverride(data.inventario)
      setMostrarModalInventario(true)
    } catch (e) {
      setGenerarError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerandoInventario(false)
    }
  }

  // ── Sub-bloque 3.B — Validador cross-provider de Palancas ─────────────────

  async function dispararValidadorPalancas() {
    setPalancasValidador({ status: 'inferring' })
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/palancas/validar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setPalancasValidador({
        status: 'ready',
        propuesta: data.propuesta,
        costoUsd: data.costo_usd,
        latenciaMs: data.latencia_ms,
      })
    } catch (e) {
      console.warn('[entrevista] validador palancas falló:', e)
      setError(`Validador de palancas falló: ${e instanceof Error ? e.message : String(e)}. Podés continuar al borrador igual.`)
      setPalancasValidador(null)
    }
  }

  function handleCerrarValidador() {
    setPalancasValidador(null)
  }

  async function handleAvanzarPostValidador() {
    // Persist ya hecho por el modal mismo. Aquí solo refrescamos estado local
    // y disparamos mensaje vacío al chat para que el modelo arranque 3.C.
    setPalancasValidador(null)
    setSubBloqueActual('3.C')
    // Recargar plan del backend para tener plan.palancas.preguntas_validador
    // poblado en el state local (necesario para el panel lateral).
    try {
      const r = await fetch(`/api/planes-estrategicos/${id}`)
      if (r.ok) {
        const { plan: planFresh } = await r.json()
        if (planFresh) setPlan(planFresh)
      }
    } catch { /* fall-through, no bloqueante */ }
    setTimeout(() => sendMessage('', historial, plan), 500)
  }

  async function handleCerrarInventario() {
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setMostrarModalInventario(false)
      setSubBloqueActual('3.B')
      // El modelo arrancará 3.B en el próximo turno conversacional. Disparamos
      // mensaje vacío para que el chat pida al modelo que arranque.
      setTimeout(() => sendMessage('', historial, plan), 500)
    } catch (e) {
      setGenerarError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handlePausar() {
    setPausing(true)
    try {
      await fetch(`/api/planes-estrategicos/${id}/entrevista`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'Pausada' }),
      })
      router.push('/planes-estrategicos')
    } catch {
      setPausing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-[13px] text-muted-foreground">Cargando entrevista...</p>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-[13px] text-muted-foreground">Plan no encontrado.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-sidebar-border px-6 py-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">{plan.nombre}</p>
          <p className="text-[11px] text-muted-foreground">
            Plan {plan.tipo}{plan.plan_sr_nombre ? ` · alineado a: ${plan.plan_sr_nombre}` : ''}
          </p>
        </div>
        <button
          onClick={handlePausar}
          disabled={pausing || isStreaming}
          className="rounded-lg border border-sidebar-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40"
        >
          {pausing ? 'Pausando...' : 'Pausar'}
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Chat */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-sidebar-border">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ChatInterface
              historial={historial}
              streamingContent={streamingContent}
              isStreaming={isStreaming}
              isPersisting={isPersisting}
              error={error}
              pendingMessage={pendingMessage}
              onRetry={handleRetry}
              onPanelUpdate={setPanelData}
            />
          </div>

          {/* Banner del Sub-bloque 3.A — Inventario.
              Aparece cuando estamos en 3.A y todavía no se generó el inventario.
              Click "Generar" → POST /paso3/inventario/generar (30-60s) → abre modal.
              Si plan.inventario ya existe (recovery o reentry), el botón cambia a
              "Continuar revisión" y abre el modal directo. */}
          {subBloqueActual === '3.A' && (
            <div className="flex-shrink-0 border-t border-sidebar-border bg-sidebar/30 px-4 py-3">
              {!inventarioOverride && !plan.plan?.inventario && (
                <div className="space-y-2">
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">Sub-bloque 3.A — Inventario de movimientos</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Voy a generar 15-25 movimientos candidatos basados en Propósito + Situación + Preparativos.
                      Tarda 30-60s. Después los revisás categoría por categoría.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerarInventario}
                    disabled={generandoInventario}
                    className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {generandoInventario ? 'Generando inventario… (30-60s)' : 'Generar inventario'}
                  </button>
                  {generarError && (
                    <p className="text-[11px] text-red-400">Error: {generarError}</p>
                  )}
                </div>
              )}
              {(inventarioOverride || plan.plan?.inventario) && !mostrarModalInventario && (
                <button
                  onClick={() => setMostrarModalInventario(true)}
                  className="rounded-lg border border-sidebar-border px-4 py-2 text-[13px] font-medium text-foreground hover:bg-accent/50 transition-colors"
                >
                  Continuar revisión del inventario →
                </button>
              )}
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 border-t border-sidebar-border p-4">
            {panelUnhealthy && (
              <div className="mb-3 rounded-lg border-2 border-yellow-700 bg-yellow-950/70 px-4 py-3 text-[13px] text-yellow-100">
                <p className="font-semibold mb-1">⚠ Panel desactualizado</p>
                <p className="text-[12px] text-yellow-200">
                  {panelUnhealthy.detail || 'El panel lateral no se está actualizando correctamente. Los datos estructurados del plan pueden no estar guardándose.'}
                  {' '}La conversación sigue funcionando — podés seguir mandando mensajes — pero pausá y avisá a soporte si esto persiste.
                </p>
              </div>
            )}
            {saveFailed && (
              <div className="mb-3 rounded-lg border-2 border-red-700 bg-red-950/70 px-4 py-3 text-[13px] text-red-100">
                <p className="font-semibold mb-1">⚠ Guardado falló</p>
                <p className="text-[12px] text-red-200">
                  Tu último mensaje fue procesado pero NO se persistió en Airtable después de 3 reintentos.
                  Recargá la página antes de mandar otro mensaje, sino la conversación va a desincronizarse.
                </p>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming || saveFailed}
                placeholder={saveFailed ? 'Recargá la página antes de continuar' : 'Escribí tu respuesta… (Cmd+Enter para enviar)'}
                rows={9}
                className="flex-1 resize-y rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 min-h-[60px] max-h-[600px]"
              />
              <button
                onClick={handleEnviar}
                disabled={!inputValue.trim() || isStreaming || saveFailed}
                className="flex-shrink-0 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground/50">Cmd+Enter para enviar</p>
          </div>
        </div>

        {/* Panel lateral */}
        <div className="w-[380px] flex-shrink-0 overflow-y-auto p-4">
          <PanelLateral plan={plan} panel={panelData} planSr={planSr} />
        </div>
      </div>

      {/* Modal del Inventario (3.A) — overlay sobre todo */}
      {mostrarModalInventario && (inventarioOverride || plan.plan?.inventario) && (
        <InventarioCategoria
          planId={id}
          plan={plan}
          inventario={inventarioOverride ?? plan.plan!.inventario!}
          onInventarioUpdate={(inv) => setInventarioOverride(inv)}
          onCerrarInventario={handleCerrarInventario}
        />
      )}

      {/* Modal del Validador de Palancas (3.B) — overlay automático cuando
          el modelo principal completó las 5 preguntas con respuestas. */}
      {palancasValidador && (
        <PalancasValidadorModal
          planId={id}
          status={palancasValidador.status}
          propuesta={palancasValidador.status === 'ready' ? palancasValidador.propuesta : undefined}
          costoUsd={palancasValidador.status === 'ready' ? palancasValidador.costoUsd : undefined}
          latenciaMs={palancasValidador.status === 'ready' ? palancasValidador.latenciaMs : undefined}
          onCerrar={handleCerrarValidador}
          onAvanzar={handleAvanzarPostValidador}
        />
      )}
    </div>
  )
}
