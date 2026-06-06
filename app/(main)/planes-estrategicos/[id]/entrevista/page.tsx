'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChatInterface } from '@/components/planes-estrategicos/ChatInterface'
import { NombreEditable } from '@/components/planes-estrategicos/NombreEditable'
import { InventarioCategoria } from '@/components/planes-estrategicos/InventarioCategoria'
import { PalancasValidadorModal } from '@/components/planes-estrategicos/PalancasValidadorModal'
import { PanelInventarioInteractivo } from '@/components/planes-estrategicos/PanelInventarioInteractivo'
import { P4InlineFlow } from '@/components/planes-estrategicos/P4InlineFlow'
import { P5InlineFlow } from '@/components/planes-estrategicos/P5InlineFlow'
import { BorradorVista } from '@/components/planes-estrategicos/BorradorVista'
import { CuradoVista } from '@/components/planes-estrategicos/CuradoVista'
import { RetroactividadControlSuaveModal, type CambioRetroactivoPayload } from '@/components/planes-estrategicos/RetroactividadControlSuaveModal'
import { SupuestosFormModal } from '@/components/planes-estrategicos/SupuestosFormModal'
import { CriterioExitoFormModal } from '@/components/planes-estrategicos/CriterioExitoFormModal'
import {
  ConfirmacionQuitarMovimiento,
} from '@/components/planes-estrategicos/GestionInventarioModales'
import { MovimientoFormModal } from '@/components/planes-estrategicos/MovimientoFormModal'
import { BTN_CTA, BTN_SECONDARY_SM } from '@/components/ui/button-styles'
import type { GestionInventario } from '@/components/planes-estrategicos/fichas/FichaMovimiento'
import type { PlanEstrategico, TurnoPE, PanelUpdatePE, InventarioPE, MovimientoPE, PalancaQAPE, EstresQAPE, RespuestaEstructurada, BorradorIteracionPE, FaseSecuenciaPE, PlanCuradoPE, PlanCuradoVersionado } from '@/lib/types'
import { getCuradoActivo } from '@/lib/types'

const PANEL_UPDATE_RE = /<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/g

// Label legible del model id de Anthropic (PE_MODEL) para el header.
function modeloLabel(id: string | null): string | null {
  if (!id) return null
  if (id.includes('haiku')) return 'Haiku 4.5'
  if (id.includes('sonnet')) return 'Sonnet 4.6'
  if (id.includes('opus-4-8')) return 'Opus 4.8'
  if (id.includes('opus')) return 'Opus 4.7'
  return id // id completo si no es un alias conocido
}

export default function EntrevistaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [plan, setPlan] = useState<PlanEstrategico | null>(null)
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
  // Modelo Anthropic activo en el server (PE_MODEL). Se muestra en el header para
  // confirmar a simple vista qué modelo quedó activo tras reiniciar/deployar.
  const [peModel, setPeModel] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/pe-model')
      .then(r => r.json())
      .then(d => { if (typeof d?.model === 'string') setPeModel(d.model) })
      .catch(() => {/* si falla, no mostramos la nota */})
  }, [])
  const [panelUnhealthy, setPanelUnhealthy] = useState<{ reason: string; detail: string } | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Sub-bloque 3.A — Inventario
  const [subBloqueActual, setSubBloqueActual] = useState<string>('0')
  // Paso actual del wizard, hidratado desde la entrevista al cargar. Se usa
  // para mostrar el banner de "Plan completo" cuando paso_actual >= 4 (el
  // wizard llegó al final del scope implementado). Se actualiza al refresh —
  // dentro de un mismo run, los cambios de paso ocurren via cerrar-paso/avance
  // y el user navega a otra ruta.
  const [pasoActualEntrevista, setPasoActualEntrevista] = useState<number>(0)
  const [inventarioOverride, setInventarioOverride] = useState<InventarioPE | null>(null)
  const [generandoInventario, setGenerandoInventario] = useState(false)
  const [generarError, setGenerarError] = useState<string | null>(null)
  const [mostrarModalInventario, setMostrarModalInventario] = useState(false)
  // Vista inicial al abrir el modal de inventario. Default undefined → 'preview'.
  // Si el usuario clickea "🔁 Secuenciar movimientos" en el header (acceso
  // retroactivo desde 3.B/3.C/3.D), se setea a 'secuenciacion' antes de abrir.
  const [vistaInicialInventario, setVistaInicialInventario] = useState<
    'preview' | 'review' | 'validacion' | 'secuenciacion' | undefined
  >(undefined)
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
  // Sub-bloque 3.B/3.D — Panel Interactivo de Fichas (Fase D Chunk A).
  // savingRespuestaEstructurada: indica si estamos haciendo PATCH al endpoint.
  const [savingRespuestaEstructurada, setSavingRespuestaEstructurada] = useState(false)
  // Mejora 2 — gestión de inventario durante 3.B/3.C/3.D (H7 retroactividad).
  // Tracking de cambios efectuados durante el sub-bloque actual para:
  //   (a) badges NUEVO/MODIFICADO en fichas
  //   (b) banner resumen al transicionar al siguiente sub-bloque
  // Reset cuando subBloqueActual cambia. NO persistido — se pierde en refresh,
  // trade-off aceptable (los cambios al inventario sí persisten en plan).
  const [cambiosInventario, setCambiosInventario] = useState<{
    subBloque: string
    agregados: Set<string>
    editados: Set<string>
    quitados: Set<string>
    quitadosNombres: Map<string, string>  // para mostrar en el banner aún post-filtrado
  }>({
    subBloque: '0',
    agregados: new Set(),
    editados: new Set(),
    quitados: new Set(),
    quitadosNombres: new Map(),
  })
  // Banner notificación post-cierre de sub-bloque con cambios. Se muestra
  // ~10s con un texto resumen "Durante 3.B agregaste 2, editaste 1...".
  const [bannerCambiosPrev, setBannerCambiosPrev] = useState<{
    subBloque: string
    agregados: number
    editados: number
    quitados: number
    quitadosNombres: string[]
  } | null>(null)
  // Modales de gestión de inventario.
  const [modalAgregarFicha, setModalAgregarFicha] = useState(false)
  const [modalEditarFicha, setModalEditarFicha] = useState<{ id: string } | null>(null)
  const [modalQuitarFicha, setModalQuitarFicha] = useState<{ id: string } | null>(null)
  const [savingFicha, setSavingFicha] = useState(false)

  // Sub-bloque 3.C — Borrador del plan (B.2).
  // borradorAbierto: visibilidad del modal de vista.
  // generandoBorrador: loading mientras Opus genera (60-120s).
  // borradorError: mensaje de error si la generación falla.
  // secuenciaPropuestaB2: reorden local del user vía drag-and-drop sobre la
  //   última iteración. Lo guardamos en memoria sin persistir — B.3 lo usará
  //   como input para re-iteración.
  const [borradorAbierto, setBorradorAbierto] = useState(false)
  const [generandoBorrador, setGenerandoBorrador] = useState(false)
  const [borradorError, setBorradorError] = useState<string | null>(null)
  const [secuenciaPropuestaB2, setSecuenciaPropuestaB2] = useState<FaseSecuenciaPE[] | null>(null)

  // Sub-bloque 3.E — Plan curado (Chunk D).
  const [curadoAbierto, setCuradoAbierto] = useState(false)
  const [generandoCurado, setGenerandoCurado] = useState(false)
  const [curadoError, setCuradoError] = useState<string | null>(null)
  // Feature 2: cambiar version_activa del curado (navegación entre versiones).
  const [cambiandoVersionCurado, setCambiandoVersionCurado] = useState(false)

  // Sub-bloque 3.0.B — Supuestos exógenos.
  // Cuando el modelo emite plan.preparativos.supuestos_exogenos con items
  // que tienen campos vacíos (probabilidad/estrategia/impacto), aparece banner
  // en el chat con botón "Completar supuestos". Click → abre modal con form.
  const [supuestosAbierto, setSupuestosAbierto] = useState(false)

  // Sub-bloque 3.0.D — Criterio de éxito.
  // Aparece banner cuando hay métricas en propósito pero alguna no tiene
  // minimo aceptable definido en criterio_exito. Click → abre modal con form
  // (textareas por métrica + zona de fracaso global).
  const [criterioAbierto, setCriterioAbierto] = useState(false)

  // Cierre formal de Paso (cualquier paso). Cuando el modelo emite
  // cierre_sugerido=true en su PANEL_UPDATE, chat/route transiciona
  // sub_estado_paso → 'cierre_sugerido' y emite SSE 'cierre_sugerido'. El
  // frontend muestra entonces un botón "Cerrar Paso N y revisar" que llama
  // a /cerrar-paso (transición cierre_sugerido → esperando_auditoria) y
  // navega a /cierre/N donde corre el audit-reviewer existente (Pantallas 1-4).
  const [cierreSugeridoPaso, setCierreSugeridoPaso] = useState<number | null>(null)
  const [cerrandoPaso, setCerrandoPaso] = useState(false)
  const [cierrePasoError, setCierrePasoError] = useState<string | null>(null)

  // Retroactividad con control suave (Fase F — H7). Cuando el modelo detecta
  // un cambio estructural sobre material validado, chat/route emite SSE
  // 'retroactividad_control_suave' con los datos del cambio. Mostramos modal.
  const [retroactividadCambio, setRetroactividadCambio] = useState<CambioRetroactivoPayload | null>(null)
  // Separamos "modal visible" de "cambio pendiente". Cuando el SSE llega, ambos
  // se activan. Si el user cierra el modal sin decidir (Escape/click-fuera/✕),
  // SOLO bajamos retroactividadModalAbierto — el cambio queda pendiente y
  // aparece un banner reabrible en la columna del chat. Decidir explícitamente
  // (Confirmar o Cancelar) limpia ambos.
  const [retroactividadModalAbierto, setRetroactividadModalAbierto] = useState(false)
  const [confirmandoRetroactividad, setConfirmandoRetroactividad] = useState(false)
  const [retroactividadError, setRetroactividadError] = useState<string | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Cargar plan y entrevista al montar
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/planes-estrategicos/${id}`)
        const { plan } = await res.json()
        setPlan(plan)

        // Cargar historial + estado de la entrevista
        const resE = await fetch(`/api/planes-estrategicos/${id}/entrevista`)
        if (resE.ok) {
          const { entrevista } = await resE.json()
          const hist: TurnoPE[] = entrevista?.historial ?? []
          setHistorial(hist)
          setSubBloqueActual(entrevista?.sub_bloque_actual ?? '0')
          setPasoActualEntrevista(entrevista?.paso_actual ?? 0)

          // Hidratar cierreSugeridoPaso desde el estado persistido. Si Juan
          // recarga la página después de que el modelo emitió cierre_sugerido
          // pero antes de clickear "Cerrar Paso", el botón debe seguir visible.
          if (entrevista?.sub_estado_paso === 'cierre_sugerido') {
            setCierreSugeridoPaso(entrevista.paso_actual ?? null)
          }

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
    planActual?: PlanEstrategico | null,
    // Hint para sobreescribir la lectura stale de entrevista.sub_bloque_actual
    // en el servidor (eventual consistency de Airtable list endpoint — patrón
    // documentado en CLAUDE.md). Lo pasan los callers que acaban de hacer un
    // PATCH a la entrevista y saben qué sub_bloque debería leerse.
    opts?: { expected_sub_bloque?: string }
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
        body: JSON.stringify({
          planId: id,
          mensaje,
          expected_sub_bloque: opts?.expected_sub_bloque,
        }),
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
          // Separar JSON.parse (que sí puede fallar legítimamente con líneas SSE
          // malformadas) del manejo del evento. Si parseamos OK pero el handler
          // hace `throw` (caso 'error'), ese throw debe propagarse al outer catch
          // para que el usuario vea un banner — no quedar tragado como si fuera
          // una línea malformada.
          let evt: any
          try {
            evt = JSON.parse(line.slice(6))
          } catch {
            continue
          }
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
              // Sincronizar plan.plan (Paso 3) con ground truth post-merge.
              // Preferencia: evt.plan (plan re-leído del backend después del
              // merge protector — incluye los sub-trees congelados aunque el
              // modelo NO los reemita). Fallback: shallow merge con
              // evt.panelUpdate.plan para compatibilidad.
              if (evt.plan) {
                setPlan(evt.plan)
              } else if (evt.panelUpdate.plan) {
                setPlan(prev => prev
                  ? { ...prev, plan: { ...prev.plan, ...evt.panelUpdate.plan } }
                  : prev)
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
          } else if (evt.type === 'retroactividad_control_suave') {
            // Modelo detectó cambio retroactivo estructural sobre material
            // validado. Abrimos modal con los datos. User confirma o cancela.
            if (evt.cambio) {
              console.log('[entrevista] retroactividad_control_suave — bloque:', evt.cambio.bloque_afectado)
              setRetroactividadCambio({
                bloque_afectado: evt.cambio.bloque_afectado ?? '(no especificado)',
                texto_previo: evt.cambio.texto_previo ?? '',
                descripcion_cambio: evt.cambio.descripcion_cambio ?? '',
                impactos_detectados: Array.isArray(evt.cambio.impactos_detectados) ? evt.cambio.impactos_detectados : [],
              })
              setRetroactividadModalAbierto(true)
              setRetroactividadError(null)
            }
          } else if (evt.type === 'cierre_sugerido') {
            // El modelo emitió cierre_sugerido=true en su PANEL_UPDATE
            // (típico al final del Paso N, después de aprobación del user).
            // chat/route ya hizo updateSubEstadoPaso('en_curso' → 'cierre_sugerido').
            // Solo seteamos el state local para que se muestre el botón
            // "Cerrar Paso N y revisar" en el UI del wizard.
            const paso = typeof evt.paso === 'number' ? evt.paso : null
            if (paso !== null) {
              console.log(`[entrevista] cierre_sugerido recibido para Paso ${paso} — mostrando botón de cierre.`)
              setCierreSugeridoPaso(paso)
            }
          } else if (evt.type === 'panel_unhealthy') {
            // El panel lateral no se está actualizando — la conversación sigue,
            // pero los datos estructurados del plan pueden estar desactualizados.
            // Banner amarillo (warning), no bloquea el input.
            setPanelUnhealthy({ reason: evt.reason ?? 'unknown', detail: evt.detail ?? '' })
          } else if (evt.type === 'error') {
            throw new Error(evt.message ?? 'Error en el stream')
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
      // Si el server emitió un evt.type==='error' con mensaje útil (ej. rate
      // limit de Anthropic, max_tokens excedido, content policy), surface el
      // texto real al user. Sino, fallback genérico de conexión.
      const msg = err instanceof Error && err.message
        ? err.message
        : 'Hubo un problema con la conexión.'
      setError(msg)
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

  // Mínimo dinámico de respuestas — Issue B
  const meta = panelData?.proxima_respuesta_metadata
  // EXCEPCIONES P-4 y P-5: ambas capturan el razonamiento DENTRO del panel
  // (por edge en P-4, por mov en P-5). No requieren razonamiento textual
  // masivo post-Confirmar. Si el modelo (en un turno previo al cambio de
  // regla) emitió proxima_respuesta_metadata con mínimos, lo ignoramos
  // client-side para que el usuario pueda avanzar con respuesta corta.
  //
  // IMPORTANTE: restringimos por id de pregunta. En 3.B SOLO P-4 (secuenciacion)
  // y P-5 (marcado_simple) tienen flow inline. En 3.D las preguntas E-N pueden
  // usar los mismos modos pero el panel lateral derecho clásico — no inline.
  const preguntaActiva = preguntaActualParaPanel()
  const esModoConRazonInline = subBloqueActual === '3.B' && (
    preguntaActiva?.modo_interaccion === 'secuenciacion'
    || preguntaActiva?.modo_interaccion === 'marcado_simple'
  )
  const minChars = esModoConRazonInline ? undefined : meta?.caracteres_minimos
  const minWords = esModoConRazonInline ? undefined : meta?.palabras_minimas
  const placeholderModel = esModoConRazonInline ? undefined : meta?.placeholder_textarea
  const charsActuales = inputValue.trim().length
  const wordsActuales = inputValue.trim().length === 0 ? 0 : inputValue.trim().split(/\s+/).length
  const cumpleMinChars = minChars === undefined || charsActuales >= minChars
  const cumpleMinWords = minWords === undefined || wordsActuales >= minWords
  const cumpleMinimos = cumpleMinChars && cumpleMinWords

  function mensajeFaltanteMinimo(): string | null {
    if (!minChars && !minWords) return null
    if (cumpleMinimos) return null
    if (charsActuales === 0) return 'Escribí tu razonamiento — necesitamos un par de oraciones explicando tu elección.'
    const faltanChars = minChars ? Math.max(0, minChars - charsActuales) : 0
    const faltanWords = minWords ? Math.max(0, minWords - wordsActuales) : 0
    if (faltanWords > 0 && faltanWords <= 5) return 'Casi — un par de palabras más sobre tu razonamiento.'
    if (faltanWords > 5) return 'Necesitamos un par de oraciones más explicando tu razonamiento.'
    if (faltanChars > 0 && faltanChars <= 30) return 'Casi — un par de palabras más sobre tu razonamiento.'
    return 'Necesitamos un par de oraciones más explicando tu razonamiento.'
  }

  // Resumen de la respuesta estructurada actual (si hay panel interactivo y
  // pregunta con respuesta_estructurada ya confirmada). Aparece arriba del
  // textarea como "Elegiste: M-1 'Contratar QA Lead' — explicá tu razonamiento".
  function resumenRespuestaEstructurada(): string | null {
    const preg = preguntaActualParaPanel()
    if (!preg?.respuesta_estructurada) return null
    const re = preg.respuesta_estructurada
    const movs = plan?.plan?.inventario?.movimientos ?? []
    const findMov = (id: string) => movs.find(m => m.id === id)
    if (re.modo === 'seleccion_unica') {
      const m = findMov(re.movimiento_id)
      return m ? `Elegiste: ${m.id} "${m.nombre}" — explicá tu razonamiento abajo` : `Elegiste: ${re.movimiento_id}`
    }
    if (re.modo === 'seleccion_multiple_ranked') {
      const ids = re.ranking.sort((a, b) => a.posicion - b.posicion).map(r => r.movimiento_id)
      return `Elegiste ${ids.length} movimiento${ids.length === 1 ? '' : 's'}: ${ids.join(', ')} — explicá tu razonamiento abajo`
    }
    if (re.modo === 'agrupacion_pares') {
      return `Definiste ${re.pares.length} ${re.pares.length === 1 ? 'dependencia' : 'dependencias'} — explicá tu razonamiento abajo`
    }
    if (re.modo === 'secuenciacion') {
      const totalFases = re.fases.filter(f => f.movimientos.length > 0).length
      return `Ordenaste los movimientos en ${totalFases} fase${totalFases === 1 ? '' : 's'} — explicá tu razonamiento abajo`
    }
    if (re.modo === 'marcado_simple') {
      return `Marcaste ${re.marcados.length} movimiento${re.marcados.length === 1 ? '' : 's'} — explicá tu razonamiento abajo`
    }
    return null
  }

  async function handleEnviar(opts?: { forzar?: boolean }) {
    const msg = inputValue.trim()
    if (!msg || isStreaming) return
    if (!opts?.forzar && !cumpleMinimos) return
    setInputValue('')
    sendMessage(msg)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleEnviar()
    }
  }

  // ── Mejora 2 — Gestión de inventario durante 3.B/3.C/3.D ─────────────────

  // Reset tracking al cambiar de sub-bloque + emitir banner si el saliente
  // tenía cambios. Se ejecuta solo cuando cambia subBloqueActual.
  useEffect(() => {
    if (cambiosInventario.subBloque === subBloqueActual) return
    const tieneCambios = cambiosInventario.agregados.size + cambiosInventario.editados.size + cambiosInventario.quitados.size > 0
    const veniaDe3 = ['3.B', '3.C', '3.D'].includes(cambiosInventario.subBloque)
    if (tieneCambios && veniaDe3) {
      setBannerCambiosPrev({
        subBloque: cambiosInventario.subBloque,
        agregados: cambiosInventario.agregados.size,
        editados: cambiosInventario.editados.size,
        quitados: cambiosInventario.quitados.size,
        quitadosNombres: Array.from(cambiosInventario.quitadosNombres.values()),
      })
    }
    setCambiosInventario({
      subBloque: subBloqueActual,
      agregados: new Set(),
      editados: new Set(),
      quitados: new Set(),
      quitadosNombres: new Map(),
    })
  }, [subBloqueActual, cambiosInventario])

  // Auto-dismiss del banner tras 12s para no bloquear permanentemente.
  useEffect(() => {
    if (!bannerCambiosPrev) return
    const t = setTimeout(() => setBannerCambiosPrev(null), 12000)
    return () => clearTimeout(t)
  }, [bannerCambiosPrev])

  // Categorías existentes en el inventario actual (para el dropdown de Agregar).
  const categoriasInventario = useMemo(() => {
    const movs = plan?.plan?.inventario?.movimientos ?? []
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const m of movs) {
      if (!seen.has(m.categoria)) { seen.add(m.categoria); ordered.push(m.categoria) }
    }
    return ordered
  }, [plan?.plan?.inventario?.movimientos])

  // Handler: agregar movimiento. Llama al endpoint /paso3/inventario/decision
  // (modo agregar). El endpoint ya existe y soporta esto. NO disparamos
  // inferencia de dependencias durante 3.B/3.C/3.D — el flow tiene que ser
  // rápido para no romper el ritmo conversacional. El user puede ajustar
  // dependencias luego si quiere.
  async function handleAgregarFichaInventario(nuevo: Omit<MovimientoPE, 'id' | 'estado_usuario'>) {
    setSavingFicha(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agregar: { categoria: nuevo.categoria, movimiento: nuevo } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      const invActualizado: InventarioPE = data.inventario_actualizado
      // Actualizar plan local
      setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
      // Detectar el ID del movimiento recién creado (el que NO estaba antes)
      const previo = plan?.plan?.inventario?.movimientos ?? []
      const previoIds = new Set(previo.map(m => m.id))
      const nuevoMov = invActualizado.movimientos.find(m => !previoIds.has(m.id))
      if (nuevoMov) {
        setCambiosInventario(prev => ({
          ...prev,
          agregados: new Set([...prev.agregados, nuevoMov.id]),
        }))
      }
      setModalAgregarFicha(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingFicha(false)
    }
  }

  async function handleEditarFichaInventario(movId: string, patch: Partial<MovimientoPE>) {
    setSavingFicha(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id: movId, estado: 'editado', patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      const invActualizado: InventarioPE = data.inventario_actualizado
      setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
      setCambiosInventario(prev => ({
        ...prev,
        editados: new Set([...prev.editados, movId]),
      }))
      setModalEditarFicha(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingFicha(false)
    }
  }

  async function handleQuitarFichaInventario(movId: string) {
    setSavingFicha(true)
    setError(null)
    try {
      const movRef = plan?.plan?.inventario?.movimientos.find(m => m.id === movId)
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento_id: movId, estado: 'quitado' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      const invActualizado: InventarioPE = data.inventario_actualizado
      setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
      setCambiosInventario(prev => {
        const quitadosNombres = new Map(prev.quitadosNombres)
        if (movRef) quitadosNombres.set(movId, `${movId} "${movRef.nombre}"`)
        return {
          ...prev,
          quitados: new Set([...prev.quitados, movId]),
          quitadosNombres,
        }
      })
      setModalQuitarFicha(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingFicha(false)
    }
  }

  // Bundle GestionInventario que se pasa al PanelInventarioInteractivo.
  // Se construye solo si estamos en 3.B/3.C/3.D — sino undefined (back-compat
  // y para que el panel de fichas en otras situaciones no muestre controles).
  const gestionInventarioActiva: GestionInventario | undefined = useMemo(() => {
    if (!['3.B', '3.C', '3.D'].includes(subBloqueActual)) return undefined
    return {
      agregados: cambiosInventario.agregados,
      editados: cambiosInventario.editados,
      onEditar: (movId: string) => setModalEditarFicha({ id: movId }),
      onQuitar: (movId: string) => setModalQuitarFicha({ id: movId }),
    }
  }, [subBloqueActual, cambiosInventario.agregados, cambiosInventario.editados])

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

  // ── Sub-bloque 3.C — Generación del Borrador del plan (B.2) ───────────────
  //
  // Disparo explícito por botón (decisión de Juan: control sobre el costo de
  // ~$0.50-2 USD por iteración). max 3 iteraciones. En B.2 solo se genera
  // la 1ra iteración + se renderiza la vista. Re-iterar + aceptar = B.3.
  async function handleGenerarBorrador() {
    if (generandoBorrador) return
    const iteracionesPrevias = plan?.plan?.borrador?.iteraciones ?? []
    if (iteracionesPrevias.length >= 3) {
      setBorradorError('Ya hay 3 iteraciones — alcanzaste el máximo. Volvé a 3.A o 3.B si necesitás refinar.')
      return
    }
    setGenerandoBorrador(true)
    setBorradorError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/borrador/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_iteracion: iteracionesPrevias.length + 1,
        }),
      })
      // Parseo robusto: leer como texto primero, intentar JSON.parse aparte.
      // Si el body está vacío (timeout / connection cut / server crash sin
      // body), damos un mensaje útil en vez del críptico "JSON.parse: unexpected
      // end of data" que tira res.json() ante body vacío.
      const raw = await res.text()
      let data: any = null
      if (raw) {
        try { data = JSON.parse(raw) } catch { /* fall-through: data queda null */ }
      }
      if (!res.ok) {
        const msg = data?.error
          ?? (raw ? `HTTP ${res.status}: ${raw.slice(0, 200)}` : `HTTP ${res.status} sin body — posible timeout del servidor (la llamada a la IA puede demorar 60-180s; si esto se repite, hay un timeout en el deploy).`)
        throw new Error(msg)
      }
      if (!data) {
        throw new Error('El servidor devolvió respuesta vacía. Probablemente timeout durante la llamada a la IA (60-180s). Probá de nuevo — si persiste, hay un timeout configurado abajo de esa duración en el deploy.')
      }
      // Refrescar plan local con el plan_actualizado del endpoint.
      if (data.plan_actualizado) {
        setPlan(prev => prev ? { ...prev, plan: data.plan_actualizado } : prev)
      }
      // Reset reorden local — nueva iteración arranca con la secuencia que emitió Opus.
      setSecuenciaPropuestaB2(null)
      setBorradorAbierto(true)
    } catch (e) {
      setBorradorError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerandoBorrador(false)
    }
  }

  // Última iteración persistida — la que se muestra en el modal cuando se abre.
  const ultimaIteracionBorrador: BorradorIteracionPE | null = (() => {
    const its = plan?.plan?.borrador?.iteraciones ?? []
    return its.length > 0 ? its[its.length - 1] : null
  })()

  // ── Sub-bloque 3.0.B — Supuestos pendientes ────────────────────────────────
  // El banner aparece cuando el modelo ya emitió la lista de supuestos
  // (plan.preparativos.supuestos_exogenos) pero al menos uno tiene algún campo
  // de calificación vacío. Click → abre modal con form.
  const supuestosPendientes = useMemo(() => {
    if (subBloqueActual !== '3.0') return null
    const sup = plan?.plan?.preparativos?.supuestos_exogenos
    if (!sup || sup.length === 0) return null
    const incompletos = sup.filter(s => !s.probabilidad || !s.impacto_signo || !s.impacto_magnitud || !s.estrategia)
    if (incompletos.length === 0) return null
    return { total: sup.length, incompletos: incompletos.length, supuestos: sup }
  }, [subBloqueActual, plan?.plan?.preparativos?.supuestos_exogenos])

  // Submit del modal de supuestos → envía como mensaje normal al /chat.
  function handleEnviarSupuestos(textoMensaje: string) {
    setSupuestosAbierto(false)
    setTimeout(() => sendMessage(textoMensaje), 0)
  }

  // ── Sub-bloque 3.0.D — Criterio de éxito pendiente ───────────────────────
  // Banner aparece cuando el modelo emite plan.preparativos.criterio_exito.por_metrica
  // con al menos un item que tiene minimo vacío. El modal pre-llena pleno desde
  // proposito.metricas si el modelo no lo cargó.
  const criterioPendiente = useMemo(() => {
    if (subBloqueActual !== '3.0') return null
    const criterio = plan?.plan?.preparativos?.criterio_exito
    const metricas = plan?.proposito?.metricas
    if (!criterio?.por_metrica || criterio.por_metrica.length === 0) return null
    if (!metricas || metricas.length === 0) return null
    const incompletos = criterio.por_metrica.filter(c => !c.minimo?.trim()).length
    if (incompletos === 0) return null
    return { total: criterio.por_metrica.length, incompletos, metricas, criterio }
  }, [subBloqueActual, plan?.proposito?.metricas, plan?.plan?.preparativos?.criterio_exito])

  function handleEnviarCriterio(textoMensaje: string) {
    setCriterioAbierto(false)
    setTimeout(() => sendMessage(textoMensaje), 0)
  }

  // ── Sub-bloque 3.C — Re-iteración + Aceptación (B.3) ──────────────────────
  //
  // Re-iterar: llamar a /paso3/borrador/generar con numero+1 + disconformidades.
  // Aceptar: llamar a /paso3/borrador/iteracion (PATCH action='aceptar') que
  // setea iteracion_aceptada + transiciona sub_bloque a 3.D + dispara mensaje
  // explícito al chat para arrancar 3.D (con sentinel anti-stale-read).
  async function handleReIterarBorrador(disconformidades: Array<{ elemento: string; elementoLabel: string; razon: string }>) {
    if (generandoBorrador) return
    if (!ultimaIteracionBorrador) return
    if (ultimaIteracionBorrador.numero >= 3) {
      setBorradorError('Ya alcanzaste el máximo de 3 iteraciones.')
      return
    }
    if (disconformidades.length === 0) {
      setBorradorError('No hay disconformidades marcadas — no hay nada que re-iterar.')
      return
    }
    setGenerandoBorrador(true)
    setBorradorError(null)
    try {
      // Convertir disconformidades del componente al shape del endpoint.
      // elementoLabel se concatena con elemento como hint para Opus.
      const payload = disconformidades.map(d => ({
        elemento: d.elementoLabel || d.elemento,
        razon: d.razon,
      }))
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/borrador/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_iteracion: ultimaIteracionBorrador.numero + 1,
          disconformidades: payload,
        }),
      })
      // Parseo robusto: idéntico al de handleGenerarBorrador. Sin esto, si el
      // endpoint devuelve body vacío (timeout/crash), JSON.parse tira un error
      // críptico que queda en borradorError sin que el user lo vea claro.
      const raw = await res.text()
      let data: any = null
      if (raw) {
        try { data = JSON.parse(raw) } catch { /* fall-through: data queda null */ }
      }
      if (!res.ok) {
        const msg = data?.error
          ?? (raw ? `HTTP ${res.status}: ${raw.slice(0, 200)}` : `HTTP ${res.status} sin body — posible timeout del servidor.`)
        throw new Error(msg)
      }
      if (!data) {
        throw new Error('El servidor devolvió respuesta vacía. Probablemente timeout durante la llamada a la IA (60-180s). Probá de nuevo.')
      }
      if (data.plan_actualizado) {
        setPlan(prev => prev ? { ...prev, plan: data.plan_actualizado } : prev)
      }
      setSecuenciaPropuestaB2(null)  // reset reorden — nueva iteración arranca limpia
      // Modal queda abierto, va a re-renderizar con la nueva iteración
    } catch (e) {
      setBorradorError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerandoBorrador(false)
    }
  }

  async function handleAceptarBorrador() {
    if (generandoBorrador) return
    if (!ultimaIteracionBorrador) return
    setGenerandoBorrador(true)
    setBorradorError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/borrador/iteracion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'aceptar',
          numero_iteracion: ultimaIteracionBorrador.numero,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      if (data.plan_actualizado) {
        setPlan(prev => prev ? { ...prev, plan: data.plan_actualizado } : prev)
      }
      // Transición local a 3.D + cerrar modal + disparar mensaje explícito al chat
      // con sentinel anti-stale-read (mismo patrón que handleAvanzarPostValidador).
      setSubBloqueActual('3.D')
      setBorradorAbierto(false)
      setTimeout(
        () => sendMessage(
          '[Sistema] Acepté la iteración del borrador. Por favor proseguí con 3.D — Estrés de realidad.',
          historial,
          plan,
          { expected_sub_bloque: '3.D' },
        ),
        500,
      )
    } catch (e) {
      setBorradorError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerandoBorrador(false)
    }
  }

  // ── Escape hatch 3.D → 3.E ────────────────────────────────────────────────
  // El modelo a veces dice "avanzamos a 3.E (curado)" pero omite emitir
  // sub_bloque_actual='3.E' en su PANEL_UPDATE. Resultado: subBloqueActual
  // queda en '3.D' y el banner de "Generar plan curado" no aparece. Este
  // handler permite forzar la transición manualmente desde la UI.
  const [forzandoAvance3E, setForzandoAvance3E] = useState(false)
  async function handleForzarAvance3E() {
    if (forzandoAvance3E) return
    setForzandoAvance3E(true)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/entrevista`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_bloque_actual: '3.E' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      setSubBloqueActual('3.E')
      // Aviso al modelo via mensaje al chat con sentinel anti-stale-read,
      // mismo patrón que handleAceptarBorrador (3.C → 3.D).
      setTimeout(
        () => sendMessage(
          '[Sistema] El usuario forzó la transición a 3.E (curado del plan). Por favor avanzá con el sub-bloque 3.E.',
          historial,
          plan,
          { expected_sub_bloque: '3.E' },
        ),
        300,
      )
    } catch (e) {
      setError(`No se pudo forzar el avance a 3.E: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setForzandoAvance3E(false)
    }
  }

  // ── Sub-bloque 3.E — Plan Curado (Chunk D) ────────────────────────────────
  //
  // Generar: POST /paso3/curado/generar (Opus, integra borrador + ajustes 3.D
  //   + opcional ajuste_narrativo del user). Persiste plan.curado y refresca
  //   estado local. Idempotente — cada call sobreescribe plan.curado.
  // Pedir ajuste: re-llama generar con ajuste_narrativo en el body.
  // Aprobar: envía mensaje al chat indicando aprobación. El modelo, viendo
  //   plan.curado poblado + mensaje de aprobación, emite cierre_sugerido=true.
  //   El chat/route ya tiene la lógica que transiciona sub_estado_paso a
  //   'cierre_sugerido' (para Paso 3 ≠ 3.0/3.A esto dispara el audit-reviewer).
  async function handleGenerarCurado(ajusteNarrativo?: string) {
    if (generandoCurado) return
    setGenerandoCurado(true)
    setCuradoError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/curado/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ajuste_narrativo: ajusteNarrativo ?? null }),
      })
      // Parseo robusto (body vacío → timeout sin response).
      const raw = await res.text()
      let data: any = null
      if (raw) {
        try { data = JSON.parse(raw) } catch { /* fall-through */ }
      }
      if (!res.ok) {
        // Si el endpoint devolvió preview del output de Opus (parse failure),
        // mostramoslo al user para que vea qué Opus emitió.
        const previewInicio = data?.output_preview_inicio ? `\n\n[Inicio del output de la IA]: ${data.output_preview_inicio.slice(0, 300)}...` : ''
        const previewFinal = data?.output_preview_final ? `\n\n${data.output_preview_final.slice(0, 200)}` : ''
        const msg = data?.error
          ?? (raw ? `HTTP ${res.status}: ${raw.slice(0, 200)}` : `HTTP ${res.status} sin body — posible timeout.`)
        throw new Error(`${msg}${previewInicio}${previewFinal}`)
      }
      if (!data) {
        throw new Error('El servidor devolvió respuesta vacía. Probablemente timeout durante la llamada a la IA (60-180s). Probá de nuevo.')
      }
      if (data.plan_actualizado) {
        setPlan(prev => prev ? { ...prev, plan: data.plan_actualizado } : prev)
      }
      setCuradoAbierto(true)
    } catch (e) {
      setCuradoError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerandoCurado(false)
    }
  }

  async function handleAprobarCurado() {
    if (generandoCurado) return
    setGenerandoCurado(true)
    setCuradoError(null)
    try {
      // Cerramos el modal localmente. El mensaje al chat va a hacer que el
      // modelo emita cierre_sugerido=true → updateSubEstadoPaso transiciona
      // a 'cierre_sugerido' → audit-reviewer toma control.
      setCuradoAbierto(false)
      setTimeout(
        () => sendMessage(
          '[Sistema] Aprobé el plan curado. Por favor cerrá formalmente el Paso 3 emitiendo cierre_sugerido=true en tu PANEL_UPDATE. El sistema va a disparar la auditoría obligatoria.',
          historial,
          plan,
        ),
        300,
      )
    } catch (e) {
      setCuradoError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerandoCurado(false)
    }
  }

  // Versionado del curado (Feature 2): plan.curado es PlanCuradoVersionado
  // ({ versiones[], version_activa }). Usamos getCuradoActivo() para acceder
  // a la versión actualmente seleccionada. Si no hay curado, retorna null.
  const curadoVersionado: PlanCuradoVersionado | null = plan?.plan?.curado ?? null
  const curadoActual: PlanCuradoPE | null = plan ? getCuradoActivo(plan) : null

  // Handler para cambiar version_activa del curado (PATCH al endpoint /version).
  async function handleCambiarVersionCurado(nuevaVersion: number) {
    if (cambiandoVersionCurado || !plan) return
    const total = plan.plan?.curado?.versiones?.length ?? 0
    if (nuevaVersion < 0 || nuevaVersion >= total) return
    setCambiandoVersionCurado(true)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/curado/version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: nuevaVersion }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error cambiando versión del curado.')
      // Refrescar plan local con el plan_actualizado de la respuesta.
      setPlan(prev => prev ? { ...prev, plan: data.plan_actualizado } : prev)
    } catch (e) {
      setCuradoError(e instanceof Error ? e.message : String(e))
    } finally {
      setCambiandoVersionCurado(false)
    }
  }

  // ── Retroactividad con control suave (Fase F — H7) ───────────────────────
  //
  // Confirmar: 1) POST /paso3/retroactividad/confirmar (registra warning),
  // 2) sendMessage al chat con "[Sistema] Usuario confirma cambio retroactivo: X"
  // (el modelo aplica la mutación en su próximo turno).
  // Cancelar: cerrar modal silenciosamente, no-op.
  async function handleConfirmarRetroactividad() {
    if (confirmandoRetroactividad || !retroactividadCambio) return
    setConfirmandoRetroactividad(true)
    setRetroactividadError(null)
    try {
      // 1. Registrar warning en plan.warnings_retroactivos (audit trail).
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/retroactividad/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bloque_afectado: retroactividadCambio.bloque_afectado,
          texto_previo: retroactividadCambio.texto_previo,
          descripcion_cambio: retroactividadCambio.descripcion_cambio,
          impactos_detectados: retroactividadCambio.impactos_detectados,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      if (data.plan_actualizado) {
        setPlan(prev => prev ? { ...prev, plan: data.plan_actualizado } : prev)
      }
      // 2. Cerrar modal + enviar mensaje al chat para que el modelo aplique.
      const descripcion = retroactividadCambio.descripcion_cambio
      setRetroactividadCambio(null)
      setRetroactividadModalAbierto(false)
      setTimeout(
        () => sendMessage(
          `[Sistema] Usuario confirma cambio retroactivo. Bloque afectado: ${retroactividadCambio.bloque_afectado}. Cambio a aplicar: ${descripcion}. El warning ya quedó registrado en plan.warnings_retroactivos — aplicá ahora la mutación correspondiente en tu PANEL_UPDATE.`,
          historial,
          plan,
        ),
        200,
      )
    } catch (e) {
      setRetroactividadError(e instanceof Error ? e.message : String(e))
    } finally {
      setConfirmandoRetroactividad(false)
    }
  }

  function handleCancelarRetroactividad() {
    setRetroactividadCambio(null)
    setRetroactividadModalAbierto(false)
    setRetroactividadError(null)
  }

  // ── Cierre formal de Paso N (cierre_sugerido → esperando_auditoria) ───────
  //
  // Disparado por el botón "Cerrar Paso N y revisar". Llama a /cerrar-paso
  // que transiciona sub_estado_paso de 'cierre_sugerido' a 'esperando_auditoria'
  // y devuelve la URL para navegar a la Pantalla 1 del audit-reviewer.
  async function handleCerrarPaso() {
    if (cerrandoPaso || !cierreSugeridoPaso) return
    setCerrandoPaso(true)
    setCierrePasoError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${id}/cerrar-paso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: cierreSugeridoPaso }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      // Navegar a Pantalla 1 del audit-reviewer.
      const url = data.redirect ?? `/planes-estrategicos/${id}/cierre/${cierreSugeridoPaso}`
      router.push(url)
    } catch (e) {
      setCierrePasoError(e instanceof Error ? e.message : String(e))
      setCerrandoPaso(false)
    }
  }

  // ── Sub-bloque 3.B — Validador cross-provider de Palancas ─────────────────

  // ── Sub-bloque 3.B/3.D — Confirmar respuesta_estructurada del Panel ───────

  async function handleConfirmarRespuestaEstructurada(idPregunta: string, respuesta: RespuestaEstructurada) {
    setSavingRespuestaEstructurada(true)
    setError(null)
    try {
      // 1. Persistir respuesta_estructurada de la pregunta (behavior original).
      const res = await fetch(`/api/planes-estrategicos/${id}/paso3/palancas/respuesta-estructurada`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_pregunta: idPregunta, respuesta_estructurada: respuesta }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      if (data.plan_actualizado) setPlan(prev => prev ? { ...prev, plan: data.plan_actualizado } : prev)

      // 2. Si la respuesta es de pares: sincronizar bidireccionalmente con
      //    mov.precondiciones del inventario. Los pares del panel se vuelven
      //    fuente de verdad — actualiza precondiciones por target, el
      //    auto-mirror server-side propaga al desbloquea del source.
      //    Esto cierra el split-brain 3.B vs inventario.
      if (respuesta.modo === 'agrupacion_pares') {
        const planActual = data.plan_actualizado ?? plan?.plan
        const inv: InventarioPE | undefined = planActual?.inventario
        if (inv) {
          // Mapa hacia → desde[] que represente el estado deseado del panel.
          const deseadoPorHacia = new Map<string, string[]>()
          for (const par of respuesta.pares) {
            const arr = deseadoPorHacia.get(par.hacia) ?? []
            if (!arr.includes(par.desde)) arr.push(par.desde)
            deseadoPorHacia.set(par.hacia, arr)
          }
          // Por cada mov, comparar precondiciones actuales vs deseadas.
          // PATCH solo los que difieren (orden agnóstico). Aplicar secuencial
          // para que el auto-mirror del server no entre en race conditions.
          let ultimoInv: InventarioPE | null = null
          for (const mov of inv.movimientos) {
            const objetivo = deseadoPorHacia.get(mov.id) ?? []
            const actuales = mov.precondiciones ?? []
            const sameSet = actuales.length === objetivo.length &&
              actuales.every(idP => objetivo.includes(idP))
            if (sameSet) continue
            try {
              const pr = await fetch(`/api/planes-estrategicos/${id}/paso3/inventario/decision`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  movimiento_id: mov.id,
                  estado: 'editado',
                  patch: { precondiciones: objetivo },
                }),
              })
              const prData = await pr.json().catch(() => null)
              if (pr.ok && prData?.inventario_actualizado) {
                ultimoInv = prData.inventario_actualizado
              }
            } catch (syncErr) {
              console.warn(`[handleConfirmarRespuestaEstructurada] sync ${mov.id} falló:`, syncErr)
            }
          }
          // Refrescar plan local con el último inventario sincronizado.
          if (ultimoInv) {
            setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: ultimoInv! } } : prev)
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingRespuestaEstructurada(false)
    }
  }

  // Helper: encontrar la pregunta actual del Panel Interactivo. Es la última
  // pregunta de plan.palancas.preguntas_principal (o estres) que tiene
  // modo_interaccion definido (con o sin respuesta_estructurada).
  //
  // Mejora 1: el panel persiste DESPUÉS de "Confirmar selección" para que el
  // user pueda cambiar de idea mientras escribe el "por qué" en el chat. Solo
  // se reemplaza cuando el modelo emite una nueva pregunta (P-N+1) en su turno
  // siguiente — el componente PanelInventarioInteractivo resetea su state al
  // cambiar pregunta.id (useEffect ya implementado). Si la respuesta_estructurada
  // ya existe, el panel hidrata su state desde ahí (también ya implementado).
  function preguntaActualParaPanel(): PalancaQAPE | EstresQAPE | null {
    if (!plan?.plan) return null
    const enSubBloqueB = subBloqueActual === '3.B'
    const enSubBloqueD = subBloqueActual === '3.D'
    if (!enSubBloqueB && !enSubBloqueD) return null

    const candidatos: Array<PalancaQAPE | EstresQAPE> = enSubBloqueB
      ? plan.plan.palancas?.preguntas_principal ?? []
      : plan.plan.estres?.preguntas ?? []

    if (candidatos.length === 0) return null

    // El panel acompaña a la PREGUNTA ACTUAL del modelo, no a la última que
    // tuvo panel. Si la pregunta más reciente NO tiene modo_interaccion
    // (texto puro), el panel se pliega — el user no está respondiendo una
    // pregunta panel-eable. Si SÍ tiene modo (pendiente o ya respondida), el
    // panel se muestra hasta que llegue la próxima pregunta del modelo.
    //
    // Lógica de prioridad anterior (priorizar pendiente con modo sobre
    // respondida más reciente sin modo) generaba un bug: en E-2 texto-puro,
    // el panel seguía mostrando E-1 marcado_simple confirmada con su selección
    // visible — visualmente sugería que E-1 todavía requería acción.
    const ultima = candidatos[candidatos.length - 1]
    if (ultima.modo_interaccion) return ultima
    return null
  }

  // Auto-recovery del validador al cargar la página.
  // Dos casos de stuck que detecta:
  //  (1) Validador NUNCA corrió: 5 preguntas_principal respondidas pero
  //      preguntas_validador vacío y costo_validador_usd undefined → re-disparar
  //      el validador para regenerar la propuesta.
  //  (2) Validador SÍ corrió y respuestas SÍ persistidas, pero sub_bloque_actual
  //      retrocedió a 3.B (bug histórico de backslide del chat route — ya
  //      arreglado pero los planes existentes pueden estar en este estado):
  //      forzar la transición a 3.C directamente vía handleAvanzarPostValidador.
  // Sentinel anti-loop: validadorRecoveryDisparado solo se setea una vez por mount.
  const [recoveryDisparado, setRecoveryDisparado] = useState(false)
  useEffect(() => {
    if (!plan?.plan || loading || recoveryDisparado) return
    if (subBloqueActual !== '3.B') return
    const palancas = plan.plan.palancas
    const principal = palancas?.preguntas_principal ?? []
    // Detección de respuesta completa por pregunta:
    //   - Modos "inline" (secuenciacion P-4, marcado_simple P-5): el flow
    //     captura el razonamiento POR MOV dentro del editor, no en chat. El
    //     usuario puede responder corto ("ok"/"listo") y el modelo no siempre
    //     persiste q.respuesta texto. Para esos modos, basta con que
    //     respuesta_estructurada esté confirmada.
    //   - Modos clásicos (seleccion_unica, ranked, pares, sin modo): siguen
    //     requiriendo q.respuesta texto no-vacío.
    const todasResp = principal.length === 5 && principal.every(q => {
      const modoInline = q.modo_interaccion === 'secuenciacion' || q.modo_interaccion === 'marcado_simple'
      if (modoInline && q.respuesta_estructurada) return true
      return !!q.respuesta?.trim()
    })
    const yaTieneValidador = (palancas?.preguntas_validador ?? []).length > 0
    const yaCorrio = palancas?.costo_validador_usd !== undefined

    if (todasResp && !yaTieneValidador && !yaCorrio && !validadorDisparado && !palancasValidador) {
      setRecoveryDisparado(true)
      setValidadorDisparado(true)
      void dispararValidadorPalancas()
    } else if (todasResp && yaTieneValidador && yaCorrio) {
      setRecoveryDisparado(true)
      void handleAvanzarPostValidador()
    }
  }, [plan, subBloqueActual, loading, validadorDisparado, palancasValidador, recoveryDisparado])

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
    // y disparamos mensaje al chat para que el modelo arranque 3.C.
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
    // Mensaje explícito (no vacío) para evitar ambigüedad: si la lectura de
    // entrevista.sub_bloque está stale (eventual consistency de Airtable list
    // endpoint), el modelo podría pensar que seguimos en 3.B y "esperando
    // validador". El mensaje explícito + el hint expected_sub_bloque resuelven
    // ambos lados del problema (model + server).
    setTimeout(
      () => sendMessage(
        '[Sistema] Completé las preguntas del validador en la UI dedicada. Las respuestas están persistidas en plan.palancas.preguntas_validador. Por favor proseguí con 3.C — Borrador del plan.',
        historial,
        plan,
        { expected_sub_bloque: '3.C' },
      ),
      500,
    )
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
      setVistaInicialInventario(undefined)
      setSubBloqueActual('3.B')
      // El modelo arrancará 3.B en el próximo turno conversacional. Disparamos
      // mensaje vacío para que el chat pida al modelo que arranque.
      setTimeout(() => sendMessage('', historial, plan), 500)
    } catch (e) {
      setGenerarError(e instanceof Error ? e.message : String(e))
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
      <div className="flex-shrink-0 flex items-center justify-between border-b border-sidebar-border px-6 py-3 gap-3">
        <div>
          <NombreEditable
            planId={id}
            nombreActual={plan.nombre}
            onNombreActualizado={(nuevoNombre) => setPlan(prev => prev ? { ...prev, nombre: nuevoNombre } : prev)}
          />
          <p className="text-[12px] text-muted-foreground">
            Plan {plan.tipo}{plan.plan_sr_nombre ? ` · alineado a: ${plan.plan_sr_nombre}` : ''}
            {peModel && (
              <span className="ml-2 text-muted-foreground/70">
                · Modelo: <span className="font-medium text-foreground/80">{modeloLabel(peModel)}</span>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Acceso retroactivo a 3.A.6 — visible desde 3.B/3.C/3.D si hay
              inventario. Permite editar dependencias después de cerrado 3.A.
              El subBloqueActual implícitamente garantiza paso_actual===3. */}
          {['3.B', '3.C', '3.D'].includes(subBloqueActual)
            && plan.plan?.inventario && (
            <button
              onClick={() => {
                setVistaInicialInventario('secuenciacion')
                setMostrarModalInventario(true)
              }}
              className={BTN_SECONDARY_SM}
              title="Abrir el inventario en modo secuenciación para revisar/editar dependencias entre movimientos"
            >
              🔁 Secuenciar movimientos
            </button>
          )}
          <a
            href={`/planes-estrategicos/${id}/vista`}
            target="_blank"
            rel="noopener noreferrer"
            className={BTN_SECONDARY_SM}
          >
            Ver plan →
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Chat — full width cuando no hay panel interactivo, con max-width
            interno centrado para que en pantallas grandes el chat no se
            vuelva un texto-de-ancho-monitor. */}
        <div className="flex flex-col flex-1 min-w-0 mx-auto w-full max-w-[1100px]">
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
            {/* P-4 (secuenciacion) — el card del flow vive AL FINAL del scroll
                del chat (no como frame fijo sobre el input), así aparece como
                "respuesta esperada" después de la pregunta del modelo y se ve
                cuando el user termina de scrollear el texto.

                CONDICIÓN DE VISIBILIDAD: solo cuando P-4 está PENDIENTE
                (sin respuesta_estructurada). Una vez confirmada, el card
                desaparece para no bloquear el feedback del modelo + la próxima
                pregunta. Si el user quiere re-confirmar el cronograma puede
                usar el botón global "Secuenciar movimientos" del header. */}
            {(() => {
              const preguntaP4 = preguntaActiva
              if (preguntaP4?.modo_interaccion !== 'secuenciacion') return null
              if (subBloqueActual !== '3.B') return null  // inline solo en 3.B (3.D usa panel clásico); por MODO, no por id, porque el modelo numera las preguntas libremente
              if (preguntaP4.respuesta_estructurada) return null
              if (!plan.plan?.inventario?.movimientos) return null
              return (
                <div className="px-4 py-3 max-w-[860px] mx-auto">
                  <P4InlineFlow
                    pregunta={preguntaP4}
                    movimientos={plan.plan.inventario.movimientos}
                    planId={id}
                    duenosRevisadosSignature={plan.plan.inventario.duenos_revisados_signature}
                    saving={savingRespuestaEstructurada}
                    onConfirmar={(resp) => handleConfirmarRespuestaEstructurada(preguntaP4.id, resp)}
                    onInventarioUpdate={(invActualizado) =>
                      setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
                    }
                    onVerDetalleMov={(movId) => setModalEditarFicha({ id: movId })}
                  />
                </div>
              )
            })()}
            {/* P-5 (marcado_simple riesgo) — mismo patrón que P-4: card embebido
                al final del scroll del chat, modal fullscreen al click. */}
            {(() => {
              const preguntaP5 = preguntaActiva
              if (preguntaP5?.modo_interaccion !== 'marcado_simple') return null
              if (subBloqueActual !== '3.B') return null  // inline solo en 3.B (3.D usa panel clásico); por MODO, no por id
              if (preguntaP5.respuesta_estructurada) return null
              if (!plan.plan?.inventario?.movimientos) return null
              return (
                <div className="px-4 py-3 max-w-[860px] mx-auto">
                  <P5InlineFlow
                    pregunta={preguntaP5}
                    movimientos={plan.plan.inventario.movimientos}
                    planId={id}
                    saving={savingRespuestaEstructurada}
                    onConfirmar={(resp) => handleConfirmarRespuestaEstructurada(preguntaP5.id, resp)}
                    onInventarioUpdate={(invActualizado) =>
                      setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
                    }
                  />
                </div>
              )
            })()}
            {/* Banner reabrible del modal de cambio retroactivo. Aparece al
                final del scroll del chat cuando el user cerró el modal sin
                decidir (Escape, click fuera, ✕). El cambio queda pendiente
                hasta que confirme o cancele explícitamente. */}
            {retroactividadCambio && !retroactividadModalAbierto && (
              <div className="px-4 py-3 max-w-[860px] mx-auto">
                <div className="rounded-lg border-2 border-amber-700/70 bg-amber-950/30 px-4 py-3 space-y-2">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-300/90">
                      ⚠ Cambio retroactivo pendiente de decisión
                    </p>
                    <p className="mt-1 text-[13px] text-amber-100">
                      <span className="font-semibold">Bloque afectado:</span> {retroactividadCambio.bloque_afectado}
                    </p>
                    <p className="mt-1 text-[12px] text-amber-200/80 line-clamp-2">
                      {retroactividadCambio.descripcion_cambio}
                    </p>
                  </div>
                  <button
                    onClick={() => setRetroactividadModalAbierto(true)}
                    className="w-full rounded-md bg-amber-700 hover:bg-amber-600 px-4 py-2 text-[13px] font-bold text-amber-50 transition-colors"
                  >
                    Abrir cambio retroactivo →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Banner del Sub-bloque 3.0.D — Criterio de éxito.
              Aparece cuando el modelo emitió criterio_exito.por_metrica con
              items pero alguno no tiene minimo definido. Click → abre modal
              con form (textareas por métrica + zona de fracaso). */}
          {criterioPendiente && !criterioAbierto && (
            <div className="flex-shrink-0 border-t border-sidebar-border bg-gradient-to-r from-primary/5 to-transparent px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-foreground">
                    Sub-bloque 3.0.D — Criterio de éxito
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Faltan definir {criterioPendiente.incompletos} de {criterioPendiente.total} mínimos aceptables (más zona de fracaso opcional). El form pre-carga los plenos del Paso 1.
                  </p>
                </div>
                <button
                  onClick={() => setCriterioAbierto(true)}
                  className={`${BTN_CTA} flex-shrink-0`}
                >
                  Completar criterios →
                </button>
              </div>
            </div>
          )}

          {/* Banner del Sub-bloque 3.0.B — Supuestos exógenos.
              Aparece cuando estamos en 3.0 y el modelo ya emitió la lista de
              supuestos pero hay al menos uno con campos de calificación vacíos.
              Click → abre modal con form (segmented controls por supuesto).
              On submit → manda mensaje normal al /chat con el formato que el modelo parsea. */}
          {supuestosPendientes && !supuestosAbierto && (
            <div className="flex-shrink-0 border-t border-sidebar-border bg-gradient-to-r from-primary/5 to-transparent px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-foreground">
                    Sub-bloque 3.0.B — Supuestos exógenos
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    El modelo detectó {supuestosPendientes.total} supuestos. Faltan calificar {supuestosPendientes.incompletos} (probabilidad / impacto / estrategia). Completá en el form y enviá todas las respuestas juntas.
                  </p>
                </div>
                <button
                  onClick={() => setSupuestosAbierto(true)}
                  className={`${BTN_CTA} flex-shrink-0`}
                >
                  Completar supuestos →
                </button>
              </div>
            </div>
          )}

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
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Voy a generar 15-25 movimientos candidatos basados en Propósito + Situación + Preparativos.
                      Tarda 30-60s. Después los revisás categoría por categoría.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerarInventario}
                    disabled={generandoInventario}
                    className={BTN_CTA}
                  >
                    {generandoInventario ? 'Generando inventario… (30-60s)' : 'Generar inventario'}
                  </button>
                  {generarError && (
                    <p className="text-[12px] text-red-400">Error: {generarError}</p>
                  )}
                </div>
              )}
              {(inventarioOverride || plan.plan?.inventario) && !mostrarModalInventario && (
                <button
                  onClick={() => setMostrarModalInventario(true)}
                  className={BTN_CTA}
                >
                  Continuar revisión del inventario →
                </button>
              )}
            </div>
          )}

          {/* Banner del Sub-bloque 3.C — Borrador del plan (B.2).
              Aparece cuando estamos en 3.C. Si no hay iteración aún, botón
              "Generar borrador". Si ya hay, botón "Ver borrador (iteración N/3)". */}
          {subBloqueActual === '3.C' && (
            <div className="flex-shrink-0 border-t border-sidebar-border bg-sidebar/30 px-4 py-3">
              {ultimaIteracionBorrador === null && (
                <div className="space-y-2">
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">Sub-bloque 3.C — Borrador del plan</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Voy a armar el borrador integrando inventario + palancas + validador. Tarda 60-120s. Después lo revisás sección por sección.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerarBorrador}
                    disabled={generandoBorrador}
                    className={BTN_CTA}
                  >
                    {generandoBorrador ? 'Generando borrador… (60-120s)' : 'Generar borrador'}
                  </button>
                  {borradorError && (
                    <p className="text-[12px] text-red-400">Error: {borradorError}</p>
                  )}
                </div>
              )}
              {ultimaIteracionBorrador !== null && !borradorAbierto && (
                <button
                  onClick={() => setBorradorAbierto(true)}
                  className={BTN_CTA}
                >
                  Ver borrador (iteración {ultimaIteracionBorrador.numero}/3) →
                </button>
              )}
            </div>
          )}

          {/* Escape hatch para transición 3.D → 3.E. El modelo TIENE la regla
              de emitir sub_bloque_actual='3.E' cuando dice "vamos a curar" en
              3.D, pero a veces se olvida y queda el usuario stuck. Este botón
              da control manual cuando el user lee "avanzamos a 3.E" en el chat
              pero el banner de 3.E nunca aparece (el modelo se comió el campo). */}
          {subBloqueActual === '3.D' && (
            <div className="flex-shrink-0 border-t border-sidebar-border bg-yellow-950/10 px-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-yellow-200/70 italic">
                  Si el modelo dijo "vamos a 3.E (curado)" pero el banner no apareció, forzá la transición:
                </p>
                <button
                  onClick={handleForzarAvance3E}
                  disabled={forzandoAvance3E}
                  className="rounded-md border border-yellow-700/40 bg-yellow-950/30 px-3 py-1 text-[12px] font-medium text-yellow-100/90 hover:bg-yellow-900/40 disabled:opacity-40 transition-colors"
                  title="Marca la entrevista como 3.E (curado) y avisa al modelo. Usalo solo si el modelo ya confirmó cierre de 3.D."
                >
                  {forzandoAvance3E ? 'Avanzando…' : 'Forzar avance a 3.E (curado) →'}
                </button>
              </div>
            </div>
          )}

          {/* Banner del Sub-bloque 3.E — Plan curado (Chunk D).
              Si no hay curado aún: botón "Generar plan curado" (Opus 60-90s).
              Si ya hay: botón "Ver plan curado" para abrir el modal. */}
          {subBloqueActual === '3.E' && (
            <div className="flex-shrink-0 border-t border-sidebar-border bg-gradient-to-r from-primary/5 to-transparent px-4 py-3 space-y-2">
              {curadoActual === null && (
                <div className="space-y-2">
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">Sub-bloque 3.E — Plan curado</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      Versión final integrando borrador aceptado + ajustes de 3.D. Tarda 60-90s. Después la leés entera y aprobás para disparar la auditoría obligatoria.
                    </p>
                  </div>
                  <button
                    onClick={() => handleGenerarCurado()}
                    disabled={generandoCurado}
                    className={BTN_CTA}
                  >
                    {generandoCurado ? 'Generando plan curado… (60-90s)' : 'Generar plan curado'}
                  </button>
                </div>
              )}
              {curadoActual !== null && !curadoAbierto && (
                <button
                  onClick={() => setCuradoAbierto(true)}
                  className={BTN_CTA}
                >
                  Ver plan curado →
                </button>
              )}
              {/* Error visible siempre que haya curadoError, en ambos casos
                  (sin curado o con curado pero modal cerrado). El modal
                  abierto muestra el error en su propio footer interno. */}
              {curadoError && !curadoAbierto && (
                <p className="text-[12px] text-red-400 leading-snug">
                  <span className="font-semibold">Error:</span> {curadoError}
                </p>
              )}
            </div>
          )}

          {/* Banner CIERRE FORMAL — visible cuando el modelo emitió cierre_sugerido.
              Disparado por: modelo emite cierre_sugerido=true en PANEL_UPDATE
              (típico al final del Paso N tras aprobación del user). El backend
              ya transicionó sub_estado_paso → 'cierre_sugerido'. Acá ofrecemos
              el botón explícito que el user clickea para navegar al audit-reviewer.
              Prominente porque es decisión load-bearing (a partir de acá no
              se puede seguir conversando del Paso). */}
          {cierreSugeridoPaso !== null && (
            <div className="flex-shrink-0 border-t-2 border-primary/50 bg-gradient-to-r from-primary/20 to-primary/5 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-foreground">
                    El modelo sugirió cerrar el Paso {cierreSugeridoPaso}.
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Al cerrar, dispara la auditoría obligatoria por el Revisor independiente. Vas a ver el Paso entero + recibir las observaciones del Revisor para procesar antes de avanzar a Paso {cierreSugeridoPaso + 1}.
                  </p>
                  {cierrePasoError && (
                    <p className="mt-1 text-[12px] text-red-400">Error: {cierrePasoError}</p>
                  )}
                </div>
                <button
                  onClick={handleCerrarPaso}
                  disabled={cerrandoPaso}
                  className={`${BTN_CTA} flex-shrink-0`}
                >
                  {cerrandoPaso ? 'Cerrando…' : `Cerrar Paso ${cierreSugeridoPaso} y revisar →`}
                </button>
              </div>
            </div>
          )}

          {/* Banner "Plan completo" — visible cuando paso_actual >= 4. Indica
              que el wizard llegó al final del scope implementado (post-cierre
              definitivo del Paso 3 con auditoría aprobada). El input sigue
              habilitado para charla libre pero el flow principal terminó. */}
          {pasoActualEntrevista >= 4 && (
            <div className="flex-shrink-0 border-t border-sidebar-border bg-gradient-to-r from-emerald-950/40 to-emerald-900/20 px-4 py-4">
              <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-emerald-200">
                    ✓ Plan completo — Paso 3 cerrado con auditoría aprobada
                  </p>
                  <p className="text-[12px] text-emerald-200/80 mt-0.5 leading-relaxed">
                    El plan está auditado e inmutable. El próximo paso (Paso 4 — cierre + outputs + derivación a planes Jr de Randy/Charly/Nico) estará disponible cuando se construya esa fase del wizard.
                  </p>
                </div>
                <a
                  href={`/planes-estrategicos/${id}/vista`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-[13px] font-bold text-white transition-colors shadow-md"
                >
                  Ver plan final →
                </a>
              </div>
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
            {/* Indicador de la respuesta estructurada confirmada (Issue B parte 3).
                Aparece arriba del textarea cuando hay panel interactivo activo
                y el user ya confirmó su selección — visible solo en 3.B/3.D.
                Skip para P-4/P-5: ya hay un indicador propio dentro del inline flow. */}
            {!esModoConRazonInline && (() => {
              const resumen = resumenRespuestaEstructurada()
              if (!resumen) return null
              return (
                <div className="mb-2 rounded-lg border border-blue-700/40 bg-blue-950/30 px-3 py-2 text-[13px] text-blue-200 leading-relaxed">
                  <span className="font-semibold">✓ </span>{resumen}
                </div>
              )
            })()}

            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                /* Habilitado durante isPersisting (post 'content_done') para que
                   el user pueda ir adelantando su próxima respuesta mientras
                   el backend persiste el turno actual. El botón Enviar y
                   Cmd+Enter siguen bloqueados hasta que el guardado termine. */
                disabled={(isStreaming && !isPersisting) || saveFailed}
                placeholder={
                  saveFailed
                    ? 'Recargá la página antes de continuar'
                    : isPersisting
                      ? 'Podés ir escribiendo tu próxima respuesta… (se enviará cuando termine el guardado)'
                      : (placeholderModel ?? 'Explicá tu razonamiento — qué viste, por qué elegiste esto, qué descartaste.')
                }
                rows={5}
                className="flex-1 resize-y rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[17px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 min-h-[60px] max-h-[600px]"
              />
              <button
                onClick={() => handleEnviar()}
                disabled={!inputValue.trim() || isStreaming || saveFailed || !cumpleMinimos}
                title={!cumpleMinimos ? mensajeFaltanteMinimo() ?? undefined : undefined}
                className={`${BTN_CTA} flex-shrink-0`}
              >
                Enviar
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <p className="text-[12px] text-muted-foreground/50">Cmd+Enter para enviar</p>
              {!cumpleMinimos && inputValue.trim().length > 0 && (
                <div className="flex items-center gap-2">
                  <p className="text-[12px] text-yellow-400/80 italic">{mensajeFaltanteMinimo()}</p>
                  {/* Escape hatch: si el modelo se equivocó al pedir mínimo en una
                      pregunta de seguimiento/confirmación, el user puede mandar igual.
                      Robusto ante regresiones del prompt o decisiones probabilísticas
                      del modelo en preguntas que no requieren razonamiento desarrollado. */}
                  <button
                    onClick={() => handleEnviar({ forzar: true })}
                    disabled={!inputValue.trim() || isStreaming || saveFailed}
                    className="rounded-md border border-yellow-700/40 bg-yellow-950/20 px-2 py-0.5 text-[12px] font-medium text-yellow-200/90 hover:bg-yellow-900/30 hover:text-yellow-100 transition-colors disabled:opacity-40"
                    title="Si la pregunta admite respuesta corta, mandá igual."
                  >
                    Enviar igual →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panel derecho — solo aparece el PanelInventarioInteractivo cuando
            hay pregunta activa con respuesta estructurada sobre el inventario
            (3.B palancas). Sin panel informacional — el reporte (/vista) cumple
            esa función. EXCEPCIONES: P-4 (secuenciacion) y P-5 (marcado_simple)
            NO usan panel derecho — su flow vive embebido en la columna de chat
            (P4InlineFlow / P5InlineFlow) por UX: el trabajo real ocurre en un
            modal fullscreen, no en un sidebar paralelo. */}
        {(() => {
          const preguntaPanel = preguntaActualParaPanel()
          // SOLO P-4 y P-5 de 3.B tienen inline flow. En 3.D las preguntas E-N
          // que usen los mismos modos van al panel derecho clásico.
          const esInline = subBloqueActual === '3.B' && (
            preguntaPanel?.modo_interaccion === 'secuenciacion'
            || preguntaPanel?.modo_interaccion === 'marcado_simple'
          )
          if (esInline) return null
          if (preguntaPanel && plan.plan?.inventario?.movimientos) {
            return (
              <div className="w-[40vw] min-w-[480px] max-w-[640px] flex-shrink-0 overflow-hidden border-l border-sidebar-border">
                <PanelInventarioInteractivo
                  pregunta={preguntaPanel}
                  movimientos={plan.plan.inventario.movimientos}
                  onConfirmar={(resp) => handleConfirmarRespuestaEstructurada(preguntaPanel.id, resp)}
                  saving={savingRespuestaEstructurada}
                  gestion={gestionInventarioActiva}
                  onAgregarMovimiento={gestionInventarioActiva ? () => setModalAgregarFicha(true) : undefined}
                  planId={id}
                  duenosRevisadosSignature={plan.plan.inventario.duenos_revisados_signature}
                  onInventarioUpdate={(invActualizado) =>
                    setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
                  }
                  onVerDetalleMov={(movId) => setModalEditarFicha({ id: movId })}
                />
              </div>
            )
          }
          return null
        })()}
      </div>

      {/* Modal del Inventario (3.A) — overlay sobre todo */}
      {mostrarModalInventario && (inventarioOverride || plan.plan?.inventario) && (
        <InventarioCategoria
          planId={id}
          plan={plan}
          inventario={inventarioOverride ?? plan.plan!.inventario!}
          onInventarioUpdate={(inv) => setInventarioOverride(inv)}
          onPropositoUpdate={(proposito) => setPlan(prev => prev ? { ...prev, proposito } : prev)}
          onPreparativosUpdate={(preparativos) => setPlan(prev =>
            prev?.plan ? { ...prev, plan: { ...prev.plan, preparativos } } : prev
          )}
          vistaInicial={vistaInicialInventario}
          modoRetroactivo={subBloqueActual !== '3.A'}
          onSalir={() => {
            // Cerrar el modal y volver a la entrevista SIN cierre formal de 3.A.
            // Lo hecho ya está persistido por acción (API) — no se pierde nada.
            setMostrarModalInventario(false)
            setVistaInicialInventario(undefined)
          }}
          onCerrarInventario={subBloqueActual === '3.A'
            ? handleCerrarInventario
            : () => {
                // Modo retroactivo: solo cerrar el modal. NO disparar el endpoint
                // de cierre formal (el inventario ya está cerrado en su momento).
                setMostrarModalInventario(false)
                setVistaInicialInventario(undefined)
              }
          }
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
          movimientos={plan.plan?.inventario?.movimientos ?? []}
          onCerrar={handleCerrarValidador}
          onAvanzar={handleAvanzarPostValidador}
        />
      )}

      {/* Modal del Borrador del plan (3.C) — vista con drag-and-drop, marcas
          por elemento, footer de re-iteración + aceptación. */}
      {borradorAbierto && ultimaIteracionBorrador && (
        <BorradorVista
          iteracion={ultimaIteracionBorrador}
          movimientos={plan.plan?.inventario?.movimientos ?? []}
          onReorderSecuencia={(nueva) => setSecuenciaPropuestaB2(nueva)}
          onReIterar={handleReIterarBorrador}
          onAceptar={handleAceptarBorrador}
          saving={generandoBorrador}
          error={borradorError}
          onCerrar={() => { setBorradorAbierto(false); setBorradorError(null) }}
        />
      )}

      {/* Modal del Plan curado (3.E) — vista read-only + footer con pedir-ajuste + aprobar.
          Feature 2: navegación entre versiones cuando hay >1 versión persistida. */}
      {curadoAbierto && curadoActual && (
        <CuradoVista
          curado={curadoActual}
          onPedirAjuste={(texto) => handleGenerarCurado(texto)}
          onAprobar={handleAprobarCurado}
          saving={generandoCurado || cambiandoVersionCurado}
          onCerrar={() => setCuradoAbierto(false)}
          totalVersiones={curadoVersionado?.versiones?.length}
          versionActiva={curadoVersionado?.version_activa}
          onCambiarVersion={handleCambiarVersionCurado}
          error={curadoError}
        />
      )}

      {/* Modal de control suave (Fase F — H7 retroactividad).
          Aparece automáticamente cuando el chat route emite SSE
          'retroactividad_control_suave' (modelo detectó cambio estructural
          sobre material validado). Confirmar registra warning + envía mensaje
          al chat para que el modelo aplique. Cancelar cierra sin más. */}
      {retroactividadCambio && retroactividadModalAbierto && (
        <RetroactividadControlSuaveModal
          cambio={retroactividadCambio}
          onConfirmar={handleConfirmarRetroactividad}
          onCancelar={handleCancelarRetroactividad}
          onCerrarSinDecidir={() => setRetroactividadModalAbierto(false)}
          saving={confirmandoRetroactividad}
          error={retroactividadError}
        />
      )}

      {/* Modal de Supuestos exógenos (3.0.B) — form con segmented controls. */}
      {supuestosAbierto && supuestosPendientes && (
        <SupuestosFormModal
          supuestos={supuestosPendientes.supuestos}
          onEnviar={handleEnviarSupuestos}
          onCerrar={() => setSupuestosAbierto(false)}
          saving={isStreaming || isPersisting}
        />
      )}

      {/* Modal de Criterio de éxito (3.0.D) — form con textareas + zona de fracaso. */}
      {criterioAbierto && criterioPendiente && (
        <CriterioExitoFormModal
          metricasProposito={criterioPendiente.metricas}
          criterioActual={criterioPendiente.criterio}
          onEnviar={handleEnviarCriterio}
          onCerrar={() => setCriterioAbierto(false)}
          saving={isStreaming || isPersisting}
        />
      )}

      {/* Mejora 2 — Modal unificado de gestión de inventario durante 3.B/3.C/3.D.
          Usa el MISMO MovimientoFormModal de 3.A para consistencia total a lo
          largo de todo el Paso 3 (mismos campos, mismas validaciones, mismo
          manejo de dependencias). */}
      {modalAgregarFicha && plan.plan?.inventario && (
        <MovimientoFormModal
          mode='agregar'
          planId={id}
          categorias={categoriasInventario}
          metricasProposito={plan.proposito?.metricas ?? []}
          duenosExistentes={plan.plan.inventario.movimientos
            .filter(m => m.estado_usuario !== 'quitado')
            .map(m => m.dueno)}
          onSuccess={(invActualizado, idNuevo) => {
            setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
            if (idNuevo) {
              setCambiosInventario(prev => ({
                ...prev,
                agregados: new Set([...prev.agregados, idNuevo]),
              }))
            }
            setModalAgregarFicha(false)
          }}
          onCerrar={() => setModalAgregarFicha(false)}
        />
      )}
      {modalEditarFicha && plan.plan?.inventario && (() => {
        const mov = plan.plan.inventario.movimientos.find(m => m.id === modalEditarFicha.id)
        if (!mov) return null
        return (
          <MovimientoFormModal
            mode='editar'
            movimiento={mov}
            planId={id}
            categorias={categoriasInventario}
            metricasProposito={plan.proposito?.metricas ?? []}
            mostrarDeps={true}
            allMovimientos={plan.plan?.inventario?.movimientos ?? []}
            duenosExistentes={plan.plan?.inventario?.movimientos
              .filter(m => m.estado_usuario !== 'quitado')
              .map(m => m.dueno) ?? []}
            onSuccess={(invActualizado) => {
              setPlan(prev => prev?.plan ? { ...prev, plan: { ...prev.plan, inventario: invActualizado } } : prev)
              setCambiosInventario(prev => ({
                ...prev,
                editados: new Set([...prev.editados, modalEditarFicha.id]),
              }))
              setModalEditarFicha(null)
            }}
            onCerrar={() => setModalEditarFicha(null)}
          />
        )
      })()}
      {modalQuitarFicha && (() => {
        const mov = plan.plan?.inventario?.movimientos.find(m => m.id === modalQuitarFicha.id)
        if (!mov) return null
        return (
          <ConfirmacionQuitarMovimiento
            movimiento={mov}
            todosLosMovimientos={plan.plan?.inventario?.movimientos ?? []}
            saving={savingFicha}
            onConfirmar={() => handleQuitarFichaInventario(modalQuitarFicha.id)}
            onCancelar={() => setModalQuitarFicha(null)}
          />
        )
      })()}

      {/* Banner notificación post-cierre de sub-bloque con cambios de inventario.
          Auto-dismiss tras 12s. Click X para cerrar antes. */}
      {bannerCambiosPrev && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-md rounded-lg border border-blue-700/60 bg-blue-950/90 backdrop-blur px-4 py-3 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex-1 text-[12px] text-blue-100">
              <p className="font-semibold mb-1">
                Cambios al inventario durante {bannerCambiosPrev.subBloque}
              </p>
              <ul className="space-y-0.5 text-blue-200">
                {bannerCambiosPrev.agregados > 0 && (
                  <li>✓ Agregaste {bannerCambiosPrev.agregados} movimiento{bannerCambiosPrev.agregados === 1 ? '' : 's'}</li>
                )}
                {bannerCambiosPrev.editados > 0 && (
                  <li>✎ Editaste {bannerCambiosPrev.editados} movimiento{bannerCambiosPrev.editados === 1 ? '' : 's'}</li>
                )}
                {bannerCambiosPrev.quitados > 0 && (
                  <li>✕ Quitaste {bannerCambiosPrev.quitados} movimiento{bannerCambiosPrev.quitados === 1 ? '' : 's'}</li>
                )}
              </ul>
              <p className="mt-1 text-[12px] italic text-blue-300/80">
                El modelo verá el inventario actualizado al continuar.
              </p>
            </div>
            <button
              onClick={() => setBannerCambiosPrev(null)}
              aria-label="Cerrar"
              className="rounded text-blue-300/80 hover:text-blue-100 hover:bg-blue-900/50 px-1 text-[14px] leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

