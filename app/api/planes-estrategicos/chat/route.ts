import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  updateEntrevistaPE,
  updatePlanEstrategico,
  appendTurnosPE,
  updateSubEstadoPaso,
} from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'
import {
  parsePanelUpdate,
  mergeProposito,
  mergeSituacion,
  mergeDatosFaltantes,
  mergePasoActual,
  type ParseResult,
} from '@/lib/pe-panel-update'
import type { TurnoPE, PanelUpdatePE } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PANEL_UPDATE_RE = /<!--PANEL_UPDATE-->([\s\S]*?)<!--\/PANEL_UPDATE-->/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { planId, mensaje } = body as { planId: string; mensaje: string }

  if (!planId) return NextResponse.json({ error: 'planId requerido' }, { status: 400 })

  // Cargar plan y entrevista
  const plan = await getPlanEstrategico(planId)
  const entrevista = await getEntrevistaPE(planId)
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  // Cargar Plan Sr si es Jr
  let planSr: any = null
  if (plan.tipo === 'Jr' && plan.plan_sr_id) {
    planSr = await getPlanEstrategico(plan.plan_sr_id).catch(() => null)
  }

  // Construir messages para Anthropic.
  //
  // Anthropic solo acepta roles 'user' | 'assistant'. Mapeo:
  //   - 'model'    → 'assistant' (turnos del wizard)
  //   - 'user'     → 'user'      (turnos del ejecutivo)
  //   - 'reviewer' → 'user'      (envuelto con prefijo de contexto — feat/audit-reviewer)
  //   - 'snapshot' → 'user'      (envuelto con prefijo de cierre — feat/audit-reviewer)
  //
  // Los turnos reviewer/snapshot se mantienen visibles para el LLM en su contexto
  // histórico (importante para continuidad cross-bloque: en Paso N+1 el modelo
  // debe saber qué se auditó y qué se cerró en el Paso N). El frontend sí los
  // oculta del rendering visual (ChatInterface.tsx).
  const historial = entrevista.historial
  const messages: Anthropic.MessageParam[] = historial.map(t => {
    if (t.rol === 'model') return { role: 'assistant', content: t.contenido }
    if (t.rol === 'reviewer') {
      return {
        role: 'user',
        content: `[CONTEXTO DE AUDITORÍA EXTERNA DEL PASO ${t.paso} — REPORTE Y DECISIONES DEL USUARIO]\n\n${t.contenido}`,
      }
    }
    if (t.rol === 'snapshot') {
      return {
        role: 'user',
        content: `[CIERRE FORMAL DEL PASO ${t.paso} — RESUMEN CONGELADO]\n\n${t.contenido}`,
      }
    }
    return { role: 'user', content: t.contenido }
  })

  // Caso especial: historial vacío o mensaje vacío → apertura del Paso 0
  const userContent = mensaje.trim() || 'Comenzar entrevista'
  messages.push({ role: 'user', content: userContent })

  const systemPrompt = buildSystemPrompt(plan, planSr)

  // Stream SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let fullResponse = ''

      try {
        const anthropicStream = await anthropic.messages.stream({
          model: 'claude-opus-4-7',
          // 16000 da margen para respuesta conversacional + PANEL_UPDATE consolidado
          // de un plan rico (Pasos 0-2 ricos + Pasos 3-5 futuros). El costo solo
          // crece si el modelo efectivamente emite más output — el techo es protección
          // contra truncación, no inflador automático de costo.
          max_tokens: 16000,
          system: systemPrompt,
          messages,
        })

        for await (const event of anthropicStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const chunk = event.delta.text
            fullResponse += chunk
            send({ type: 'delta', content: chunk })
          }
        }

        // Parsear + validar el bloque PANEL_UPDATE.
        // Si falla (no_block / malformed_json / invalid_shape), reintentamos UNA vez
        // pidiéndole al modelo que lo re-emita correctamente. Si el reintento
        // de no_block también falla, alertamos al frontend inmediatamente con
        // panel_unhealthy. Para los otros casos, el contador "3 turnos seguidos"
        // dispara la alerta más abajo.
        let panelUpdate: PanelUpdatePE | null = null
        let panelUnhealthy: { reason: string; detail: string } | null = null
        let retryDisparado = false

        const parseResult = parsePanelUpdate(fullResponse)
        if (parseResult.ok) {
          panelUpdate = parseResult.data
        } else {
          retryDisparado = true
          console.error(
            `[PE chat] PANEL_UPDATE inválido (${parseResult.reason}):`,
            parseResult.errors,
          )
          const retryResult = await retryPanelUpdate(systemPrompt, messages, fullResponse, parseResult)
          if (retryResult.ok) {
            panelUpdate = retryResult.data
            console.log(`[PE chat] PANEL_UPDATE recuperado vía retry (${parseResult.reason})`)
          } else {
            console.error(
              `[PE chat] Retry de PANEL_UPDATE también falló (original=${parseResult.reason}):`,
              retryResult.errors,
            )
            // Solo no_block dispara alerta inmediata (ver instrucción de usuario).
            // Otros casos esperan al contador de turnos seguidos abajo.
            if (parseResult.reason === 'no_block') {
              panelUnhealthy = {
                reason: 'no_block_persistente',
                detail: 'El modelo no emitió el bloque PANEL_UPDATE ni en el reintento focalizado. Algo grave está pasando con el modelo.',
              }
            }
          }
        }

        // ─── Contador de salud del panel ─────────────────────────────────────
        // Si panelUpdate es null aquí (todo falló), incrementar el contador.
        // Si es no-null, resetear a 0 (recuperamos salud).
        const panelOK = panelUpdate !== null
        const counterPrev = entrevista.turnos_sin_panel_consecutivos ?? 0
        const counterNew = panelOK ? 0 : counterPrev + 1
        const retriesPrev = entrevista.retries_panel_update_acumulados ?? 0
        const retriesNew = retriesPrev + (retryDisparado ? 1 : 0)
        const ultimoOKNew = panelOK ? new Date().toISOString() : entrevista.ultimo_panel_update_ok

        // Trigger general del panel_unhealthy si llegamos a 3 turnos seguidos sin éxito.
        // Si ya se disparó por no_block_persistente arriba, no lo sobrescribo.
        if (!panelUnhealthy && counterNew >= 3) {
          panelUnhealthy = {
            reason: 'consecutive_failures',
            detail: `${counterNew} turnos seguidos sin PANEL_UPDATE válido. El panel lateral no refleja la conversación más reciente.`,
          }
        }

        // Logging estructurado para grep/agregación posterior.
        // Incluye tracking de cierre_sugerido + first-attempt no_block (definición
        // operacional en CLAUDE.md / wrap-up Fase 0) — base de la métrica
        // `first_attempt_no_block_rate` agregada en lib/audit-metrics.ts (Fase 5.3).
        const cierreSugeridoEmitido = panelUpdate?.cierre_sugerido === true
        console.log('[PE chat panel]', JSON.stringify({
          event: 'panel_update_processed',
          plan_id: planId,
          entrevista_id: entrevista.id,
          turn_index: historial.length,
          paso_actual: entrevista.paso_actual,
          panel_ok: panelOK,
          parse_first_attempt: parseResult.ok ? 'ok' : parseResult.reason,
          retry_disparado: retryDisparado,
          retry_ok: retryDisparado && panelOK,
          consecutive_failures: counterNew,
          retries_total: retriesNew,
          panel_unhealthy_emitted: !!panelUnhealthy,
          cierre_sugerido: cierreSugeridoEmitido,
          // Para first_attempt_no_block_rate: marcar turnos donde el modelo
          // sugirió cierre Y el primer intento no_block (señal de regresión).
          first_attempt_no_block_in_cierre: cierreSugeridoEmitido && parseResult.ok === false && parseResult.reason === 'no_block',
        }))

        // Texto limpio (sin el bloque PANEL_UPDATE)
        const textoLimpio = fullResponse.replace(PANEL_UPDATE_RE, '').trim()

        // Persistir turno en Airtable.
        // Cambio de diseño (2026-05): los turnos se guardan en la tabla Turnos_PE
        // (1 record por turno), no como JSON-blob en el campo Historial. Esto
        // levanta el límite efectivo de 100k chars del multilineText.
        const turnoUsuario: TurnoPE = {
          rol: 'user',
          contenido: userContent,
          timestamp: new Date().toISOString(),
          paso: entrevista.paso_actual,
        }
        const turnoModelo: TurnoPE = {
          rol: 'model',
          contenido: textoLimpio,
          timestamp: new Date().toISOString(),
          paso: panelUpdate?.paso_actual ?? entrevista.paso_actual,
        }
        const indiceInicial = historial.length

        // Bloqueamos el cierre del stream hasta confirmar persistencia.
        // Si los 3 reintentos fallan, mandamos al cliente save_failed para que
        // pueda mostrar banner y reintentar manualmente.
        const saveResult = await saveWithRetry(
          entrevista.id,
          planId,
          plan,
          entrevista.paso_actual,
          indiceInicial,
          [turnoUsuario, turnoModelo],
          panelUpdate,
          { counterSinPanel: counterNew, retriesAcumulados: retriesNew, ultimoPanelOK: ultimoOKNew },
        )

        if (panelUnhealthy) {
          send({ type: 'panel_unhealthy', ...panelUnhealthy })
        }

        if (!saveResult.ok) {
          send({ type: 'save_failed', detail: saveResult.error })
        }

        // ─── Detección de cierre_sugerido (feat/audit-reviewer Fase 2.3) ──
        // Si el modelo emitió cierre_sugerido=true Y el estado actual es 'en_curso',
        // transicionamos a 'cierre_sugerido' y avisamos al frontend para que muestre
        // el botón "Cerrar Paso N y revisar". Si el save falló, NO transicionamos
        // (evita inconsistencia: estado actualizado pero turno no persistido).
        if (saveResult.ok && cierreSugeridoEmitido && panelUpdate) {
          const subEstadoActual = entrevista.sub_estado_paso ?? 'en_curso'
          if (subEstadoActual === 'en_curso') {
            try {
              await updateSubEstadoPaso(entrevista.id, 'en_curso', 'cierre_sugerido')
              send({ type: 'cierre_sugerido', paso: panelUpdate.paso_actual })
              console.log(`[PE chat] cierre_sugerido emitido para Paso ${panelUpdate.paso_actual} (entrevista ${entrevista.id})`)
            } catch (e) {
              // Guard de transición rechazó. Probablemente race condition o estado raro.
              // Loggeamos pero no rompemos el turno — el modelo seguirá emitiendo
              // cierre_sugerido en próximos turnos hasta que la UI lo capture.
              console.warn(`[PE chat] No se pudo transicionar a cierre_sugerido:`, e instanceof Error ? e.message : String(e))
            }
          } else {
            // El modelo emite cierre_sugerido=true pero el estado ya está más adelante
            // (cierre_sugerido, esperando_auditoria, etc.). No-op silencioso.
          }
        }

        send({ type: 'done', panelUpdate })
      } catch (err: any) {
        console.error('[PE chat] Error en stream:', err)
        send({ type: 'error', message: 'Error al procesar la respuesta' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

async function saveWithRetry(
  entrevistaId: string,
  planId: string,
  plan: any,
  pasoActualCurrent: number,
  indiceInicial: number,
  nuevosTurnos: TurnoPE[],
  panelUpdate: PanelUpdatePE | null,
  panelHealth: { counterSinPanel: number; retriesAcumulados: number; ultimoPanelOK: string | undefined },
  attempt = 0
): Promise<{ ok: true } | { ok: false; error: string }> {
  const maxAttempts = 3
  const delay = [1000, 2000, 4000]

  try {
    // 1. Bulk-create de los nuevos turnos en Turnos_PE
    await appendTurnosPE(entrevistaId, nuevosTurnos, indiceInicial)

    // 2. Update de metadata de la entrevista (paso_actual, sub_bloque_actual)
    //    paso_actual usa mergePasoActual para nunca regresar (max).
    //    Siempre actualizamos los counters de salud del panel, haya panelUpdate o no.
    if (panelUpdate) {
      await updateEntrevistaPE(entrevistaId, {
        paso_actual: mergePasoActual(pasoActualCurrent, panelUpdate.paso_actual),
        sub_bloque_actual: panelUpdate.sub_bloque_actual,
        ultimo_panel_update_ok: panelHealth.ultimoPanelOK,
        turnos_sin_panel_consecutivos: panelHealth.counterSinPanel,
        retries_panel_update_acumulados: panelHealth.retriesAcumulados,
      })
    } else {
      // Sin panelUpdate: solo refrescar Ultima Actividad + counters de salud
      await updateEntrevistaPE(entrevistaId, {
        turnos_sin_panel_consecutivos: panelHealth.counterSinPanel,
        retries_panel_update_acumulados: panelHealth.retriesAcumulados,
      })
    }

    // 3. Update del plan en sí (proposito, situacion, datos_faltantes)
    //    Usa merge protector: nunca pisa un campo no-vacío con vacío.
    //    Esto resuelve H2 (PANEL_UPDATEs parciales). Limitación conocida:
    //    si incoming tiene array NO vacío pero MÁS CHICO que current, igual
    //    pisa (Fase 2 detectará "shrinkage").
    if (panelUpdate) {
      const propMerge = mergeProposito(plan.proposito, panelUpdate.proposito)
      const sitMerge = mergeSituacion(plan.situacion, panelUpdate.situacion)
      const datosMerge = mergeDatosFaltantes(plan.datos_faltantes, panelUpdate.datos_faltantes)

      // Log estructurado de eventos del merge (para Fase 2 instrumentación)
      const allEvents = [...propMerge.events, ...sitMerge.events, ...datosMerge.events]
      const shrinkages = allEvents.filter(e => e.type === 'preserved_shrinkage')
      const preserved = allEvents.filter(e => e.type === 'preserved_empty')
      const updated = allEvents.filter(e => e.type === 'updated')
      console.log(`[PE chat] panel_merge plan=${planId} updated=${updated.length} preserved_empty=${preserved.length} shrinkages=${shrinkages.length}`)
      if (shrinkages.length > 0) {
        console.warn('[PE chat] array_shrinkage_detected:', JSON.stringify(shrinkages))
      }

      const updates: Parameters<typeof updatePlanEstrategico>[1] = {
        proposito: propMerge.value,
        situacion: sitMerge.value,
        datos_faltantes: datosMerge.value,
      }
      if (propMerge.value.horizonte) {
        updates.horizonte = propMerge.value.horizonte
      }

      await updatePlanEstrategico(planId, updates)

      // Actualizar nombre cuando ya tenemos área
      if (plan.tipo && !plan.nombre.includes('–')) {
        const areaActual = plan.area
        if (areaActual) {
          const año = new Date().getFullYear()
          await updatePlanEstrategico(planId, {
            nombre: `${areaActual} – ${plan.tipo} – ${año}`,
          })
        }
      }
    }

    return { ok: true }
  } catch (err) {
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, delay[attempt]))
      return saveWithRetry(entrevistaId, planId, plan, pasoActualCurrent, indiceInicial, nuevosTurnos, panelUpdate, panelHealth, attempt + 1)
    }
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[PE chat] Fallo persistencia después de 3 intentos:', errMsg)
    return { ok: false, error: errMsg }
  }
}

/**
 * Reintenta UNA vez la generación del bloque PANEL_UPDATE cuando el primer
 * intento falló (no_block, malformed_json, o invalid_shape). Le manda al modelo
 * el response anterior + el detalle del error específico para que sepa qué arreglar.
 *
 * No reintenta más de una vez para no inflar costo (~$0.30-0.50 por retry).
 * Si esto también falla, el caller emite panel_unhealthy.
 */
async function retryPanelUpdate(
  systemPrompt: string,
  originalMessages: Anthropic.MessageParam[],
  failedAssistantResponse: string,
  parseResult: ParseResult & { ok: false },
): Promise<{ ok: true; data: PanelUpdatePE } | { ok: false; errors: string[] }> {
  const errorDescription =
    parseResult.reason === 'no_block'
      ? `Tu respuesta NO incluyó el bloque PANEL_UPDATE. El bloque es OBLIGATORIO en cada turno tuyo, sin excepción. Re-emitilo con TODO lo acumulado de la conversación: si en turnos previos se acordaron N ítems en "fuera", los N tienen que estar; si se cuantificaron desvíos, los desvíos tienen que estar. No solo el sub-bloque actual — TODO el estado acumulado.`
      : parseResult.reason === 'malformed_json'
      ? `Tu bloque PANEL_UPDATE contiene JSON malformado. Error: ${parseResult.errors.join('; ')}`
      : `Tu bloque PANEL_UPDATE no cumple el contrato. Errores: ${parseResult.errors.join('; ')}`

  const retryMessages: Anthropic.MessageParam[] = [
    ...originalMessages,
    { role: 'assistant', content: failedAssistantResponse },
    {
      role: 'user',
      content: `${errorDescription}

Re-emití SOLO el bloque PANEL_UPDATE entre los marcadores <!--PANEL_UPDATE-->...<!--/PANEL_UPDATE-->, sin ningún texto fuera del bloque. Asegurate de que sea JSON válido y que incluya TODOS los campos del contrato (los 18 del Plan Sr o 19 del Plan Jr) con todos los datos acumulados de la conversación. Nunca omitas un campo — campos sin valor van como "" o [].`,
    },
  ]

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      // 12000 = solo el bloque PANEL_UPDATE consolidado (sin texto conversacional
      // adicional, porque pedimos "SOLO el bloque"). Margen para planes ricos.
      max_tokens: 12000,
      system: systemPrompt,
      messages: retryMessages,
    })
    const text = resp.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('\n')
    const result = parsePanelUpdate(text)
    if (result.ok) return { ok: true, data: result.data }
    return { ok: false, errors: result.errors }
  } catch (e) {
    return { ok: false, errors: [`Anthropic call failed: ${e instanceof Error ? e.message : String(e)}`] }
  }
}
