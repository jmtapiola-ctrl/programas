import { PE_MODEL } from '@/lib/llm-config'
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
  appendSnapshotTurno,
} from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/pe-system-prompt'
import {
  parsePanelUpdate,
  mergeProposito,
  mergeSituacion,
  mergeDatosFaltantes,
  mergePlan,
  mergePasoActual,
  mergeSubBloque,
  type ParseResult,
} from '@/lib/pe-panel-update'
import type { TurnoPE, PanelUpdatePE, PalancaQAPE } from '@/lib/types'
import { sintetizarPreguntaPalanca } from '@/lib/palanca-sintesis'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PANEL_UPDATE_RE = /<!--PANEL_UPDATE-->([\s\S]*?)<!--\/PANEL_UPDATE-->/

// Limpieza defensiva: un "stub anti-mirroring" que se probó antes se filtró a
// algunos turnos guardados (el modelo lo copiaba). Lo removemos del historial que
// se le manda al modelo (para que no lo vuelva a copiar) y del texto que se guarda.
const STUB_LEGACY_RE = /\n*\[sistema: en este turno emitiste el bloque PANEL_UPDATE[^\]]*\]/g

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { planId, mensaje, expected_sub_bloque } = body as {
    planId: string
    mensaje: string
    // Hint del cliente para mitigar stale read del list endpoint de Airtable
    // (eventual consistency, patrón documentado en CLAUDE.md). Lo pasan callers
    // que acaban de hacer un PATCH a entrevista y saben qué sub_bloque debería
    // leerse — si el read devuelve uno anterior, lo overrideamos con este.
    expected_sub_bloque?: string
  }

  if (!planId) return NextResponse.json({ error: 'planId requerido' }, { status: 400 })

  // Cargar plan y entrevista
  const plan = await getPlanEstrategico(planId)
  const entrevista = await getEntrevistaPE(planId)
  if (!entrevista) return NextResponse.json({ error: 'Entrevista no encontrada' }, { status: 404 })

  // Stale read mitigation: si el cliente nos dice "esperaba sub_bloque=X" y
  // nosotros leímos uno distinto (caso típico: cliente hizo PATCH inmediatamente
  // antes y el list endpoint de Airtable devolvió la versión pre-PATCH),
  // overrideamos en memoria. No persistimos — la próxima request leerá el real.
  if (expected_sub_bloque && entrevista.sub_bloque_actual !== expected_sub_bloque) {
    console.log(`[PE chat] Stale read detectado — entrevista.sub_bloque_actual='${entrevista.sub_bloque_actual}' pero cliente esperaba '${expected_sub_bloque}'. Override en memoria para esta request.`)
    entrevista.sub_bloque_actual = expected_sub_bloque
  }

  // Sistema Sr→Jr Fase 5: el chat del Jr NO carga el plan Sr crudo. La única
  // referencia al Sr que ve el modelo es `plan.contexto_curado` (los 5 campos
  // editados por el Sr/Admin en el wizard de despliegue, concatenados a markdown
  // por pe-system-prompt) + `plan.movs_heredados_snapshot`.
  // Esto preserva la confidencialidad entre líneas Jr y simplifica el chat:
  // el modelo solo razona sobre el contexto curado, no sobre todo el plan Sr.
  const planSr = null

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
    // NOTA: NO agregar stubs/marcas al contenido del assistant en el historial.
    // Se probó un "stub anti-mirroring" y el modelo lo COPIABA literal en su prosa
    // (se filtraba al chat visible). El panel se mantiene robusto vía la síntesis
    // determinística (route, 3.B) + el strip de respuesta_estructurada del parser.
    if (t.rol === 'model') return { role: 'assistant', content: t.contenido.replace(STUB_LEGACY_RE, '').trimEnd() }
    if (t.rol === 'reviewer') {
      return {
        role: 'user',
        content: `[CONTEXTO DE AUDITORÍA EXTERNA DEL PASO ${t.paso} — REPORTE Y DECISIONES DEL USUARIO]\n\n${t.contenido}`,
      }
    }
    if (t.rol === 'snapshot') {
      // Distinguir cierre formal del Paso vs cierre intermedio de sub-bloque
      // mirando el campo cierre_tipo del JSON del snapshot. Backward compat:
      // snapshots viejos sin cierre_tipo se tratan como 'formal_paso'.
      let cierreTipo: string | undefined
      try {
        const parsed = JSON.parse(t.contenido ?? '')
        cierreTipo = parsed?.cierre_tipo
      } catch {
        // contenido no parsea — asumir formal_paso (legacy)
      }
      let header: string
      if (cierreTipo === 'intermedio_sub_bloque_3.0') {
        header = `[CIERRE INTERMEDIO DEL SUB-BLOQUE 3.0 — el usuario terminó Preparativos y avanza a 3.A. El Paso 3 NO está cerrado, solo el sub-bloque 3.0. Inventario / Palancas / Borrador / Estrés / Curado todavía deben construirse.]`
      } else if (cierreTipo === 'intermedio_sub_bloque_3.A') {
        header = `[CIERRE INTERMEDIO DEL SUB-BLOQUE 3.A — el usuario terminó Inventario y avanza a 3.B. El Paso 3 NO está cerrado, solo los sub-bloques 3.0 y 3.A. Palancas / Borrador / Estrés / Curado todavía deben construirse.]`
      } else {
        header = `[CIERRE FORMAL DEL PASO ${t.paso} — RESUMEN CONGELADO]`
      }
      return {
        role: 'user',
        content: `${header}\n\n${t.contenido}`,
      }
    }
    return { role: 'user', content: t.contenido }
  })

  // Caso especial: historial vacío o mensaje vacío → apertura del sub-bloque
  // que indica entrevista.sub_bloque_actual (Paso 0 si arranca limpio, o el
  // sub-bloque correcto si abre sesión nueva en plan ya avanzado).
  const userContent = mensaje.trim() || 'Comenzar entrevista'
  messages.push({ role: 'user', content: userContent })

  // ─── Reset del latch de cierre ──
  // Si entramos a un turno de chat (mensaje real del usuario) con
  // sub_estado_paso='cierre_sugerido', significa que el usuario eligió SEGUIR
  // EDITANDO por chat en vez de clickear "Cerrar Paso N" (ese botón va a la ruta de
  // auditoría, NO pasa por acá). Sin reset, el estado queda trabado: el cierre-block
  // de más abajo se vuelve no-op permanente (subEstadoActual !== 'en_curso') y el
  // modelo sigue avanzando contenido con el estado congelado — bug real (Lab 10x):
  // paso_actual trepó a 3 con sub_estado='cierre_sugerido' y sub_bloque atrás en 2.G,
  // botón mostrando "Cerrar Paso 3" sin haber cerrado el 2. Volvemos a 'en_curso';
  // si el modelo re-sugiere cierre al final del turno, el botón reaparece (el flujo
  // se re-evalúa turno a turno). No reseteamos en apertura de sesión (mensaje vacío):
  // ahí el botón debe seguir visible para que el usuario lo pueda clickear.
  if (entrevista.sub_estado_paso === 'cierre_sugerido' && mensaje.trim()) {
    try {
      await updateSubEstadoPaso(entrevista.id, 'cierre_sugerido', 'en_curso')
      entrevista.sub_estado_paso = 'en_curso'
      console.log(`[PE chat] reset cierre_sugerido→en_curso (usuario siguió editando, entrevista ${entrevista.id})`)
    } catch (e) {
      console.warn(`[PE chat] no se pudo resetear cierre_sugerido:`, e instanceof Error ? e.message : String(e))
    }
  }

  // Pasar entrevista al system prompt para que el modelo sepa en qué paso/
  // sub-bloque está. Sin esto, el modelo asume Paso 0 cuando arranca sin
  // historial — bug confirmado en checkpoint del Paso 3 (3 mayo 2026).
  let systemPrompt = buildSystemPrompt(plan, planSr, {
    paso_actual: entrevista.paso_actual,
    sub_bloque_actual: entrevista.sub_bloque_actual,
    sub_estado_paso: entrevista.sub_estado_paso,
    historial: entrevista.historial,
  })

  // RECORDATORIO DE RECENCIA (3.B / 3.D). El contrato del PANEL_UPDATE instruye
  // sumar cada pregunta nueva al array, pero está sepultado en un prompt enorme y
  // el modelo lo ignora: ve sus turnos previos (con el bloque ya stripeado) sin
  // PANEL_UPDATE y los imita, dejando de estructurar las preguntas. Resultado: el
  // panel queda clavado en la primera pregunta (bug confirmado: solo P-1 persiste).
  // Reponer la instrucción AL FINAL (máxima recencia) mejora mucho la adherencia.
  if (entrevista.sub_bloque_actual === '3.B') {
    systemPrompt += `\n\n## ⚠️ RECORDATORIO FINAL — 3.B (leé esto antes de responder)
Si en esta respuesta hacés una pregunta PRINCIPAL nueva de palanca (P-2, P-3, P-4 o P-5), es OBLIGATORIO sumarla a \`plan.palancas.preguntas_principal\` dentro de tu bloque PANEL_UPDATE: un objeto nuevo con \`id\` ("P-2".."P-5"), \`origen:"principal"\`, \`pregunta\`, \`respuesta:""\`, \`observacion_modelo:""\`, y el panel metadata (\`modo_interaccion\`, \`campos_a_mostrar\`, \`instruccion_panel\`, restricciones). El array es ACUMULATIVO: incluí TODAS las preguntas previas (P-1…) + la nueva. Si solo la narrás en la prosa pero NO la agregás al array, el panel del usuario queda clavado en la pregunta anterior. NO importa que tus turnos previos en el historial no muestren el bloque (el sistema lo strippea) — emitilo IGUAL, siempre, con la pregunta nueva incluida.`
  } else if (entrevista.sub_bloque_actual === '3.D') {
    systemPrompt += `\n\n## ⚠️ RECORDATORIO FINAL — 3.D (leé esto antes de responder)
Si en esta respuesta hacés una pregunta de estrés nueva, es OBLIGATORIO sumarla a \`plan.estres.preguntas\` dentro de tu bloque PANEL_UPDATE (objeto nuevo con \`id\`, \`pregunta\`, \`respuesta:""\`, y el panel metadata si aplica). El array es ACUMULATIVO: incluí todas las previas + la nueva. Si solo la narrás en la prosa, el panel queda clavado en la pregunta anterior. Emití el bloque SIEMPRE, con la pregunta nueva incluida.`
  }

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
          model: PE_MODEL,
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

        // Modelo terminó de emitir tokens. Avisamos al cliente para que cambie
        // el indicador a "Guardando..." mientras hacemos parsing + persistencia
        // + transiciones (3-8s típicos). Sin esto, el cliente queda 'streaming'
        // con tres puntitos animados sin saber qué está pasando.
        send({ type: 'content_done' })

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
            // Para no_block: en lugar de alerta UI, sintetizamos un PANEL_UPDATE
            // mínimo server-side. El merge protector preserva todos los sub-trees
            // persistidos → cero data loss del estado ya guardado. La única
            // pérdida son mutaciones que el modelo verbalizó en prosa y no
            // emitió en bloque (mismo resultado que con el warning, pero sin
            // bloquear al usuario). Telemetría loguea el evento para detectar
            // si pasa frecuente.
            if (parseResult.reason === 'no_block') {
              panelUpdate = {
                paso_actual: entrevista.paso_actual ?? 0,
                sub_bloque_actual: entrevista.sub_bloque_actual ?? '0',
                cierre_sugerido: false,
                cambio_retroactivo: { detectado: false },
              } as PanelUpdatePE
              console.warn(
                `[PE chat] PANEL_UPDATE sintetizado server-side (no_block_synthesized) — ` +
                `paso=${entrevista.paso_actual} sub=${entrevista.sub_bloque_actual}. ` +
                `Mutaciones verbalizadas en prosa pueden haberse perdido.`,
              )
            } else {
              // malformed_json / invalid_shape — no synthesizamos porque el
              // modelo TUVO intención de emitir block (lo emitió, mal) y
              // sintetizar enmascararía bugs reales del modelo.
            }
          }
        }

        // ─── Síntesis determinística de la pregunta de palanca (3.B) ─────────
        // Si el modelo narró "PREGUNTA P-N" en la prosa pero no la agregó a
        // plan.palancas.preguntas_principal, la sintetizamos e inyectamos al
        // panelUpdate ANTES del merge, para que el panel avance sin depender de
        // la adherencia del modelo. Construimos el array final completo y ordenado
        // (current + incoming + la nueva al final) para que la última pregunta
        // del array sea la sintetizada (el frontend muestra la última).
        if (panelUpdate && entrevista.sub_bloque_actual === '3.B') {
          const prosa = fullResponse.replace(PANEL_UPDATE_RE, '')
          const current = plan.plan?.palancas?.preguntas_principal ?? []
          const incoming = ((panelUpdate.plan as any)?.palancas?.preguntas_principal ?? []) as PalancaQAPE[]
          const idsExistentes = new Set<string>([...current.map(q => q.id), ...incoming.map(q => q.id)])
          const sintetizada = sintetizarPreguntaPalanca(prosa, idsExistentes)
          if (sintetizada) {
            // Orden: current primero (preservando sus objetos completos), luego
            // incoming nuevas, luego la sintetizada al final.
            const byId = new Map<string, PalancaQAPE>()
            for (const q of current) byId.set(q.id, q)
            for (const q of incoming) byId.set(q.id, q)
            const ordered = [...byId.values(), sintetizada]
            const pu = panelUpdate as any
            pu.plan = pu.plan ?? {}
            pu.plan.palancas = pu.plan.palancas ?? {}
            pu.plan.palancas.preguntas_principal = ordered
            console.warn(
              `[PE chat] Pregunta de palanca ${sintetizada.id} sintetizada server-side ` +
              `(modo=${sintetizada.modo_interaccion ?? 'texto'}) — el modelo la narró en prosa ` +
              `pero no la emitió en preguntas_principal.`,
            )
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

        // Telemetría temporal — qué sub-trees emite el modelo en cada turno.
        // Aprobada por Juan junto al fix de latencia (regla "no re-emitir
        // sub-trees congelados"). Sirve para verificar si la nueva instrucción
        // del system prompt se respeta turno a turno. Una vez validado, se puede
        // mover a debug-mode o eliminar.
        const subBloqueIncoming = panelUpdate?.sub_bloque_actual ?? entrevista.sub_bloque_actual
        const fullText = fullResponse  // incluye el bloque PANEL_UPDATE crudo
        const blockMatch = fullText.match(/<!--PANEL_UPDATE-->([\s\S]*?)<!--\/PANEL_UPDATE-->/)
        const blockChars = blockMatch?.[1]?.length ?? 0
        const blockTokensApprox = Math.ceil(blockChars / 4)
        const emitted = panelUpdate ? {
          proposito: !!panelUpdate.proposito && Object.keys(panelUpdate.proposito).length > 0,
          situacion: !!panelUpdate.situacion && Object.keys(panelUpdate.situacion).length > 0,
          datos_faltantes: Array.isArray(panelUpdate.datos_faltantes) && panelUpdate.datos_faltantes.length > 0,
          'plan.preparativos': !!panelUpdate.plan?.preparativos,
          'plan.inventario': !!panelUpdate.plan?.inventario,
          'plan.palancas': !!panelUpdate.plan?.palancas,
          'plan.borrador': !!panelUpdate.plan?.borrador,
          'plan.estres': !!panelUpdate.plan?.estres,
          'plan.curado': !!panelUpdate.plan?.curado,
        } : null

        // Detectar sub-trees emitidos innecesariamente según sub_bloque (los
        // que la regla nueva del system prompt pide omitir). Sirve para
        // validar adopción de la regla turno a turno.
        const supuestamenteCongelados: Record<string, string[]> = {
          '3.A': ['plan.preparativos'],
          '3.B': ['plan.preparativos', 'plan.inventario'],
          '3.C': ['plan.preparativos', 'plan.inventario', 'plan.palancas'],
          '3.D': ['plan.preparativos', 'plan.inventario', 'plan.palancas', 'plan.borrador'],
          '3.E': ['plan.preparativos', 'plan.inventario', 'plan.palancas', 'plan.borrador', 'plan.estres'],
        }
        const congeladosEsperados = supuestamenteCongelados[subBloqueIncoming] ?? []
        const reemitidosInnecesariamente = emitted
          ? congeladosEsperados.filter(k => emitted[k as keyof typeof emitted])
          : []

        console.log('[PE chat panel]', JSON.stringify({
          event: 'panel_update_processed',
          plan_id: planId,
          entrevista_id: entrevista.id,
          turn_index: historial.length,
          paso_actual: entrevista.paso_actual,
          sub_bloque: subBloqueIncoming,
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
          // Telemetría temporal de sub-trees emitidos
          subtrees_emitted: emitted,
          panel_block_chars: blockChars,
          panel_block_tokens_approx: blockTokensApprox,
          subtrees_reemitidos_innecesariamente: reemitidosInnecesariamente,
        }))
        if (reemitidosInnecesariamente.length > 0) {
          console.warn(`[PE chat panel] modelo re-emitió sub-trees congelados en ${subBloqueIncoming}: ${reemitidosInnecesariamente.join(', ')} — la nueva regla del system prompt no se respetó este turno (latencia inflada).`)
        }

        // Texto limpio (sin el bloque PANEL_UPDATE)
        const textoLimpio = fullResponse.replace(PANEL_UPDATE_RE, '').replace(STUB_LEGACY_RE, '').trim()

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
          entrevista.sub_bloque_actual,
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

        // ─── Detección de cierre_sugerido ──
        // Comportamiento dual según el sub_bloque que se está cerrando:
        //
        //   1. Sub-bloques INTERNOS del Paso 3 (3.0, 3.A): cierre intermedio.
        //      Crea snapshot del estado actual (con plan parcialmente poblado),
        //      emite SSE 'sub_bloque_cerrado' al frontend, NO transiciona
        //      sub_estado_paso (sigue en 'en_curso'). El modelo continúa
        //      con el siguiente sub-bloque automáticamente.
        //
        //   2. Cierre del Paso entero (Pasos 1, 2, o 3 en sub-bloque 3.E):
        //      transición 'en_curso' → 'cierre_sugerido', emite SSE 'cierre_sugerido',
        //      el frontend muestra el botón "Cerrar Paso N y revisar".
        //      Después: flow estándar audit + apply.
        //
        // Si el save falló, NO procesamos cierre (evita inconsistencia).
        if (saveResult.ok && cierreSugeridoEmitido && panelUpdate) {
          const subEstadoActual = entrevista.sub_estado_paso ?? 'en_curso'
          const subBloque = panelUpdate.sub_bloque_actual
          const esCierreInterno = panelUpdate.paso_actual === 3 && (subBloque === '3.0' || subBloque === '3.A')

          if (esCierreInterno && subEstadoActual === 'en_curso') {
            // Cierre intermedio: snapshot sin transición.
            // Marcamos con cierre_tipo='intermedio_sub_bloque_X' para que el
            // wrapper de history del LLM lo etiquete como cierre intermedio
            // (NO como cierre formal del Paso). Sin esa marca, el modelo lee
            // "[CIERRE FORMAL DEL PASO 3]" en turnos posteriores y alucina
            // que el Paso 3 entero está terminado cuando solo 3.0/3.A lo están.
            try {
              // Re-leer el plan después del save para tener el estado post-merge
              // que efectivamente quedó persistido (no el panelUpdate.plan crudo).
              const planFresh = await getPlanEstrategico(planId)
              const indiceSnapshot = entrevista.historial.length + 2 // +2 = user turn + model turn ya persistidos
              const cierreTipo = subBloque === '3.0'
                ? 'intermedio_sub_bloque_3.0' as const
                : 'intermedio_sub_bloque_3.A' as const
              await appendSnapshotTurno(entrevista.id, indiceSnapshot, {
                paso: 3,
                proposito: planFresh.proposito,
                situacion: planFresh.situacion,
                datos_faltantes: planFresh.datos_faltantes ?? [],
                plan: planFresh.plan,
                cerrado_en: new Date().toISOString(),
                cierre_tipo: cierreTipo,
              })
              send({ type: 'sub_bloque_cerrado', paso: 3, sub_bloque: subBloque })
              console.log(`[PE chat] sub_bloque_cerrado=${subBloque} cierre_tipo=${cierreTipo} (entrevista ${entrevista.id})`)
            } catch (e) {
              console.warn(`[PE chat] No se pudo crear snapshot intermedio de ${subBloque}:`, e instanceof Error ? e.message : String(e))
            }
          } else if (subEstadoActual === 'en_curso') {
            // Cierre del Paso entero: transición + dispara flow audit.
            try {
              await updateSubEstadoPaso(entrevista.id, 'en_curso', 'cierre_sugerido')
              send({ type: 'cierre_sugerido', paso: panelUpdate.paso_actual })
              console.log(`[PE chat] cierre_sugerido emitido para Paso ${panelUpdate.paso_actual} (entrevista ${entrevista.id})`)
            } catch (e) {
              console.warn(`[PE chat] No se pudo transicionar a cierre_sugerido:`, e instanceof Error ? e.message : String(e))
            }
          }
          // Si subEstadoActual !== 'en_curso': no-op silencioso (el flow ya avanzó).
        }

        // ─── Detección de cambio_retroactivo estructural sobre material validado (H7) ──
        //
        // Si el modelo emitió cambio_retroactivo con detectado=true + toca_material_validado=true
        // + es_estructural=true, NO debería haber mutado los trees. Le emitimos al frontend
        // el evento 'retroactividad_control_suave' con los datos para abrir el modal.
        // El user confirma o cancela en el modal. Si confirma, el frontend llama al
        // endpoint /paso3/retroactividad/confirmar (registra warning) y envía mensaje
        // [Sistema] al chat (el modelo entonces aplica la mutación en el próximo turno).
        if (saveResult.ok && panelUpdate?.cambio_retroactivo?.detectado === true) {
          const cr = panelUpdate.cambio_retroactivo
          const requiereConfirmacion = cr.toca_material_validado === true && cr.es_estructural === true
          if (requiereConfirmacion) {
            send({
              type: 'retroactividad_control_suave',
              cambio: {
                bloque_afectado: cr.bloque_afectado ?? '(no especificado)',
                texto_previo: cr.texto_previo ?? '',
                descripcion_cambio: cr.descripcion_cambio ?? '',
                impactos_detectados: cr.impactos_detectados ?? [],
              },
            })
            console.log(`[PE chat] retroactividad_control_suave emitido — bloque='${cr.bloque_afectado}' (entrevista ${entrevista.id})`)
          } else {
            console.log(`[PE chat] cambio_retroactivo detectado pero aplicado directo (no estructural o no validado) — bloque='${cr.bloque_afectado ?? '?'}', validado=${cr.toca_material_validado}, estructural=${cr.es_estructural}`)
          }
        }

        // Re-leer el plan post-merge desde Airtable y mandarlo al cliente.
        // El cliente lo usa como ground truth en vez de aplicar panelUpdate.plan
        // crudo (que puede tener shrinkage o sub-keys omitidas que el merge
        // protector preservó del current). Sin esto, el cliente queda con
        // estado inconsistente: ej. P-5 con modo_interaccion pero plan.inventario
        // vacío en cliente porque el modelo no lo re-emitió.
        let planPostMerge = null
        if (saveResult.ok) {
          try {
            planPostMerge = await getPlanEstrategico(planId)
          } catch (e) {
            console.warn('[PE chat] No se pudo re-leer plan post-merge:', e instanceof Error ? e.message : String(e))
          }
        }
        send({ type: 'done', panelUpdate, plan: planPostMerge })
      } catch (err: any) {
        console.error('[PE chat] Error en stream:', err)
        // Extraer mensaje útil del error de Anthropic SDK si está disponible
        // (rate limit / spending cap / content policy / max_tokens / etc.).
        // Esto reemplaza un genérico inútil por algo accionable que el frontend
        // puede mostrar en el banner de error (ej: "You have reached your
        // specified API usage limits. You will regain access on 2026-06-01...").
        const anthropicMsg = err?.error?.error?.message
        const detail = typeof anthropicMsg === 'string' && anthropicMsg.length > 0
          ? anthropicMsg
          : err instanceof Error
            ? err.message
            : 'Error desconocido al procesar la respuesta'
        send({ type: 'error', message: detail })
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
  subBloqueActualCurrent: string,
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
      // sub_bloque_actual nunca debe retroceder en el orden canónico. Sin esta
      // protección, el modelo emitiendo un sub_bloque anterior por desconocer
      // una transición hecha por endpoint dedicado (ej. /paso3/palancas/respuestas
      // movió a 3.C pero el modelo aún cree estar en 3.B) lo hace backslide.
      const subBloqueAEscribir = mergeSubBloque(subBloqueActualCurrent, panelUpdate.sub_bloque_actual)
      if (subBloqueAEscribir !== panelUpdate.sub_bloque_actual) {
        console.warn(`[PE chat] Backslide bloqueado en sub_bloque: current='${subBloqueActualCurrent}' incoming='${panelUpdate.sub_bloque_actual}' → preservando '${subBloqueAEscribir}'.`)
      }
      await updateEntrevistaPE(entrevistaId, {
        paso_actual: mergePasoActual(pasoActualCurrent, panelUpdate.paso_actual),
        sub_bloque_actual: subBloqueAEscribir,
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
      const planMerge = mergePlan(plan.plan, panelUpdate.plan)

      // Log estructurado de eventos del merge (para Fase 2 instrumentación)
      const allEvents = [...propMerge.events, ...sitMerge.events, ...datosMerge.events, ...planMerge.events]
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
      // Plan (Paso 3): solo persistir si hay cambios reales (planMerge.value
      // distinto de undefined). El merge protector evita pisar un plan poblado
      // con uno vacío.
      if (planMerge.value !== undefined) {
        updates.plan = planMerge.value
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
      return saveWithRetry(entrevistaId, planId, plan, pasoActualCurrent, subBloqueActualCurrent, indiceInicial, nuevosTurnos, panelUpdate, panelHealth, attempt + 1)
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
      ? `Tu respuesta anterior NO incluyó el bloque <!--PANEL_UPDATE-->...<!--/PANEL_UPDATE-->. El panel del usuario está roto sin él. Probable causa: tu respuesta conversacional fue larga y te olvidaste del bloque al final.`
      : parseResult.reason === 'malformed_json'
      ? `Tu bloque PANEL_UPDATE contiene JSON malformado. Error: ${parseResult.errors.join('; ')}`
      : `Tu bloque PANEL_UPDATE no cumple el contrato. Errores: ${parseResult.errors.join('; ')}`

  const retryMessages: Anthropic.MessageParam[] = [
    ...originalMessages,
    { role: 'assistant', content: failedAssistantResponse },
    {
      role: 'user',
      content: `${errorDescription}

INSTRUCCIÓN ESTRICTA: en tu próxima respuesta, NO escribas NADA fuera del bloque. Empezá tu respuesta con "<!--PANEL_UPDATE-->" en la primera línea, después el JSON, después "<!--/PANEL_UPDATE-->" como última línea. Sin texto antes, sin texto después, sin saludos, sin explicaciones. Solo el bloque.

El JSON debe incluir SÍ O SÍ: paso_actual (number) + sub_bloque_actual (string). Para el resto, seguí la regla "no re-emitir sub-trees congelados" CON SU EXCEPCIÓN crítica:

  - Durante 3.0/3.A/3.B/3.C/3.D/3.E: por defecto OMITÍ las keys "proposito" y "situacion" (están congelados desde Paso 1/2 — el backend las preserva).
  - **EXCEPCIÓN — cambio retroactivo a Paso 1/2:** si tu respuesta anterior verbalizó una corrección a "proposito" o "situacion" (frases como "Aplico la corrección...", "Corrijo...", "Cambio la métrica...", "Tomadas las dos correcciones..."), DEBÉS emitir el sub-tree afectado COMPLETO con la mutación aplicada. Si lo omitís, el merge protector preserva el valor viejo y la corrección se pierde. Releé tu respuesta anterior y chequeá explícitamente: ¿mencionaste cambios a proposito/situacion? Si SÍ → emití ese sub-tree completo. Si NO → omitilo.
  - "datos_faltantes": omitible si no los modificás este turno.
  - "plan": SOLO la sub-key del sub-bloque activo (modificada por el sub-bloque actual o por un cambio retroactivo verbalizado). Las sub-keys de bloques cerrados anteriores se omiten salvo que las hayas mutado en la prosa.

Para los sub-trees que SÍ emitís: el contenido es el ESTADO COMPLETO ACUMULADO (si se acordaron N ítems, los N tienen que estar — no patches parciales, no solo el item modificado). Si el sub-tree no tiene contenido todavía: omitir la key completa (NO emitir "" ni []).

Si verbalizaste un cambio retroactivo, además del sub-tree mutado: incluí también el campo "cambio_retroactivo" con detectado=true + el resto de los campos según el contrato H7.`,
    },
  ]

  try {
    const resp = await anthropic.messages.create({
      model: PE_MODEL,
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
