// Endpoint POST /api/planes-estrategicos/[id]/audit/start
//
// SSE síncrono. Reutiliza la infra del chat route. Sin polling.
// Eventos del stream:
//   - { type: 'progress', etapa, elapsed_ms }    repetido mientras el reviewer piensa
//   - { type: 'result', report, metrics }         si la auditoría completó OK
//   - { type: 'skipped', reason }                 si skip:true en el body
//   - { type: 'error', code, detail }             si falla
//
// Body: { paso: number, skip?: boolean, reason?: string }
//
// Si skip=true: registra Reviewer Skipped, snapshot del paso, transiciona a
// 'completo' e incrementa paso_actual. NO llama a OpenAI.
//
// Si skip=false: corre el reviewer (gpt-5.5 effort=high vía Responses API),
// valida output con `validateReviewerReport`, persiste turno reviewer, transiciona
// sub_estado_paso a 'auditoria_completa'.
//
// Diseño serverless-ready: todo dentro del handler (ReadableStream síncrono).
// Sin background jobs. Sin setTimeout post-response.

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getTurnosPE,
  updateSubEstadoPaso,
  incrementAuditoriasPaso,
  appendReviewerTurno,
  appendSnapshotTurno,
  getReviewerTurnos,
  getUsuario,
  getUsuarioByEmail,
  updateEntrevistaPE,
} from '@/lib/airtable'
import { callReviewer } from '@/lib/openai-client'
import { buildReviewerSystemPrompt, buildReviewerUserMessage } from '@/lib/reviewer-prompt'
import { validateReviewerReport, REVIEWER_REPORT_SCHEMA } from '@/lib/reviewer-validator'
import type { PlanEstrategico, SnapshotPaso, SubEstadoPaso } from '@/lib/types'

// ─── Helper: serializar el resumen del Paso a markdown ──────────────────────

async function serializeResumenPaso(plan: PlanEstrategico, paso: number): Promise<string> {
  const responsable = plan.responsable_id
    ? await getUsuario(plan.responsable_id).catch(() => null)
    : null

  if (paso === 1) {
    // Bloque 0+1: Encuadre + Propósito.
    const enc = `## Encuadre

- **Tipo de plan:** ${plan.tipo}
- **Área:** ${plan.area || '(no declarada)'}
- **Responsable:** ${responsable?.nombre ?? '(no asignado)'}
- **Nombre del plan:** ${plan.nombre}
${plan.horizonte ? `- **Horizonte:** ${plan.horizonte}\n` : ''}`

    if (!plan.proposito) {
      return enc + '\n## Propósito\n\n_(no declarado todavía)_'
    }
    const p = plan.proposito
    const metricasList = p.metricas?.length
      ? p.metricas.map((m, i) => `${i + 1}. **${m.metrica}** — objetivo: ${m.valor_objetivo}${m.valor_actual ? ` · actual: ${m.valor_actual}` : ''}`).join('\n')
      : '_(ninguna)_'
    const fueraList = p.fuera?.length
      ? p.fuera.map(f => `- **${f.item}**${f.razon ? ` — razón: ${f.razon}` : ''}`).join('\n')
      : '_(ninguno)_'

    return `${enc}
## Propósito

### Lugar de llegada

${p.escena || '_(no declarado)_'}

### Métricas (${p.metricas?.length ?? 0})

${metricasList}

### Fuera de scope (${p.fuera?.length ?? 0})

${fueraList}

### Horizonte

${p.horizonte || '_(no declarado)_'}

### Estabilidad

${p.estabilidad || '_(no declarada)_'}
`
  }

  if (paso === 2) {
    if (!plan.situacion) return '## Situación\n\n_(no declarada todavía)_'
    const s = plan.situacion
    const desviosList = s.desvios_secundarios?.length
      ? s.desvios_secundarios.map(d => `- **${d.descripcion}** — datos: ${d.datos}`).join('\n')
      : '_(ninguno)_'
    const resistenciasList = s.resistencias?.length
      ? s.resistencias.map(r => `- **${r.actor}** [${r.tipo} · criticidad ${r.criticidad}] — ${r.descripcion}${r.mitigacion ? ` · mitigación: ${r.mitigacion}` : ''}`).join('\n')
      : '_(ninguna)_'

    return `## Situación

### Desvío principal

${s.desvio_principal || '_(no declarado)_'}

### Cuantificación

${s.desvio_cuantificado || '_(no cuantificado)_'}

### Desvíos secundarios (${s.desvios_secundarios?.length ?? 0})

${desviosList}

### Causa raíz

${s.causa_raiz || '_(no declarada)_'}

### Consecuencias de no actuar

- En 6 meses: ${s.consecuencia_6m || '_(no declarado)_'}
- En 12 meses: ${s.consecuencia_12m || '_(no declarado)_'}

### Recursos actuales

${s.recursos_actuales || '_(no declarado)_'}

### Recursos faltantes

${s.recursos_faltantes || '_(no declarado)_'}

### Intentos previos

${s.intentos_previos || '_(no declarado)_'}

### Resistencias y amenazas (${s.resistencias?.length ?? 0})

${resistenciasList}
`
  }

  return `## Paso ${paso}\n\n_(serialización no implementada para este Paso todavía)_`
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new Response('No autorizado', { status: 401 })
  }

  const { id: planId } = await params
  const body = await req.json().catch(() => ({}))
  const paso = body?.paso
  const skip = body?.skip === true
  const skipReason: string = typeof body?.reason === 'string' ? body.reason : 'user_choice'

  // ─── Overrides para audit retroactivo / educativo ────────────────────────
  // Cuando el caller pasa overrides, el audit ignora los turnos del Paso y la
  // serialización del plan, y usa el material provisto. Útil para auditar
  // cierres históricos donde el plan actual ya divergió del material auditado.
  const overrideRange: [number, number] | null =
    Array.isArray(body?.override_conversacion_range) &&
    body.override_conversacion_range.length === 2 &&
    typeof body.override_conversacion_range[0] === 'number' &&
    typeof body.override_conversacion_range[1] === 'number'
      ? [body.override_conversacion_range[0], body.override_conversacion_range[1]]
      : null
  const overrideResumen: string | null = typeof body?.override_resumen_inline === 'string' && body.override_resumen_inline.trim().length > 0
    ? body.override_resumen_inline
    : null
  const readOnly: boolean = body?.read_only === true
  const viaScript: boolean = body?.via_script === true

  if (typeof paso !== 'number' || !Number.isInteger(paso) || paso < 1 || paso > 2) {
    return new Response('paso debe ser 1 o 2 (otros pasos no implementados todavía)', { status: 400 })
  }

  // ─── Guards de los overrides ────────────────────────────────────────────
  // 1. read_only requiere al menos un override (sin overrides, no tiene sentido
  //    marcar audit como read-only si está auditando el material vivo).
  if (readOnly && !overrideRange && !overrideResumen) {
    return new Response('read_only=true requiere al menos un override (override_conversacion_range o override_resumen_inline)', { status: 400 })
  }
  // 2. Si HAY overrides, guard de rol: solo Ejecutivo o Program Manager pueden
  //    disparar audits con material custom (evita que cualquier usuario inserte
  //    reportes con datos arbitrarios contra el plan).
  if (overrideRange || overrideResumen) {
    const user = session.user.email ? await getUsuarioByEmail(session.user.email).catch(() => null) : null
    if (!user || (user.rol !== 'Ejecutivo' && user.rol !== 'Program Manager')) {
      return new Response('Solo Ejecutivo o Program Manager pueden disparar audits con overrides', { status: 403 })
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }
      function close() {
        try { controller.close() } catch { /* ya cerrado */ }
      }

      try {
        // ── Cargar plan + entrevista ──
        const [plan, entrevista] = await Promise.all([
          getPlanEstrategico(planId),
          getEntrevistaPE(planId),
        ])
        if (!entrevista) {
          send({ type: 'error', code: 'entrevista_not_found', detail: 'No se encontró entrevista para el plan' })
          return close()
        }

        // ── Validar estado: debe ser 'esperando_auditoria' (audit inicial) o
        //    'esperando_aprobacion_final' (re-audit desde Pantalla 4 — Fase 4) ──
        const subEstadoActual: SubEstadoPaso = entrevista.sub_estado_paso ?? 'en_curso'
        const estadosAceptados: SubEstadoPaso[] = ['esperando_auditoria', 'esperando_aprobacion_final']
        if (!estadosAceptados.includes(subEstadoActual)) {
          send({
            type: 'error',
            code: 'invalid_state',
            detail: `sub_estado_paso debe ser 'esperando_auditoria' o 'esperando_aprobacion_final', es '${subEstadoActual}'`,
          })
          return close()
        }
        // Si es re-audit desde Pantalla 4, primero transicionamos al estado intermedio
        // que el resto del flow espera (auditoria_en_proceso recibe desde dos lados:
        // esperando_auditoria y esperando_aprobacion_final, según la máquina de estados).
        if (subEstadoActual === 'esperando_aprobacion_final') {
          // No hace falta pasar por 'esperando_auditoria' explícito — la máquina de
          // estados permite la transición directa esperando_aprobacion_final → auditoria_en_proceso.
        }

        // ── BRANCH: skip ──
        if (skip) {
          await handleSkip(entrevista, plan, paso, skipReason, send)
          return close()
        }

        // ── BRANCH: audit ──
        await handleAudit(entrevista, plan, paso, send, {
          overrideRange,
          overrideResumen,
          readOnly,
          viaScript,
        })
        return close()
      } catch (err) {
        console.error('[audit/start] Error inesperado:', err)
        send({
          type: 'error',
          code: 'unexpected',
          detail: err instanceof Error ? err.message : String(err),
        })
        close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ─── Skip flow: registra reviewer skipped, snapshot, avanza paso ─────────────

type SendFn = (data: object) => void

async function handleSkip(
  entrevista: NonNullable<Awaited<ReturnType<typeof getEntrevistaPE>>>,
  plan: PlanEstrategico,
  paso: number,
  reason: string,
  send: SendFn,
): Promise<void> {
  const indiceInicial = entrevista.historial.length

  // 1. Crear turno reviewer con Skipped=true (registro mínimo).
  await appendReviewerTurno(entrevista.id, indiceInicial, {
    paso,
    bloqueAuditado: paso,
    modelo: process.env.REVIEWER_MODEL ?? 'gpt-5.5',
    report: { errors: [], questions: [], cross_block_changes: [], meta: {
      errores_alta: 0, errores_media: 0, errores_baja: 0,
      preguntas_criticas: 0, preguntas_recomendadas: 0,
      cross_block_changes_total: 0,
      confianza_general: 'Baja',
      justificacion_confianza: `Skipped por el usuario (reason=${reason}).`,
    } },
    costo_usd: 0,
    latencia_ms: 0,
    retry_count: 0,
    skipped: true,
    skipped_reason: reason,
  })

  // 2. Crear snapshot inmutable del Paso.
  const snapshot: SnapshotPaso = {
    paso,
    proposito: plan.proposito,
    situacion: plan.situacion,
    datos_faltantes: plan.datos_faltantes ?? [],
    cerrado_en: new Date().toISOString(),
  }
  await appendSnapshotTurno(entrevista.id, indiceInicial + 1, snapshot)

  // 3. Transicionar y avanzar paso. Acá el guard rechaza por ser estado terminal,
  // entonces actualizo directo el campo + el siguiente paso.
  await updateEntrevistaPE(entrevista.id, {
    sub_estado_paso: 'completo',
    paso_actual: paso + 1,
  })
  // Reset del sub_estado para el siguiente Paso (start fresh).
  await updateEntrevistaPE(entrevista.id, { sub_estado_paso: 'en_curso' })

  send({ type: 'skipped', reason })
  console.log(`[audit/start] skip OK: plan=${plan.id} paso=${paso} reason=${reason}`)
}

// ─── Audit flow: corre el reviewer + persiste resultado ──────────────────────

async function handleAudit(
  entrevista: NonNullable<Awaited<ReturnType<typeof getEntrevistaPE>>>,
  plan: PlanEstrategico,
  paso: number,
  send: SendFn,
  overrides: {
    overrideRange: [number, number] | null
    overrideResumen: string | null
    readOnly: boolean
    viaScript: boolean
  } = { overrideRange: null, overrideResumen: null, readOnly: false, viaScript: false },
): Promise<void> {
  // ── Validar count < 3 ──
  const counterField = paso === 1 ? 'auditorias_paso_1_count' : 'auditorias_paso_2_count'
  const currentCount = (entrevista[counterField] ?? 0) as number
  if (currentCount >= 3) {
    send({
      type: 'error',
      code: 'count_exceeded',
      detail: `Ya se hicieron ${currentCount} auditorías sobre el Paso ${paso} (máximo 3).`,
    })
    return
  }

  // ── Transicionar a auditoria_en_proceso (protección anti-doble-disparo) ──
  // El counter NO se incrementa acá — se incrementa solo si la audit completa
  // exitosamente más abajo. Razón: failures (cap excedido, parser inválido,
  // timeout) NO deben consumir el slot del usuario, que tiene 3 audits por Paso.
  // La protección anti-doble-disparo viene del estado: si una segunda llamada
  // llega mientras esta está corriendo, el guard de updateSubEstadoPaso rechaza
  // la transición desde el estado original.
  //
  // Estado origen puede ser:
  //   - 'esperando_auditoria' (audit inicial desde Pantalla 1).
  //   - 'esperando_aprobacion_final' (re-audit desde Pantalla 4).
  // Ambos pueden transicionar a 'auditoria_en_proceso' según la máquina de estados.
  const estadoOrigen = (entrevista.sub_estado_paso ?? 'esperando_auditoria') as 'esperando_auditoria' | 'esperando_aprobacion_final'
  await updateSubEstadoPaso(entrevista.id, estadoOrigen, 'auditoria_en_proceso')

  send({ type: 'progress', etapa: 'cargando_inputs', elapsed_ms: 0 })

  try {
    // ── Cargar inputs ──
    const [allTurnos, audicionesPrevias] = await Promise.all([
      getTurnosPE(entrevista.id),
      getReviewerTurnos(entrevista.id, paso),
    ])

    // Determinar el set de turnos a enviar al reviewer.
    // Modo normal: turnos del paso (user|model). Modo override: rango hardcoded.
    let turnosInput: typeof allTurnos
    if (overrides.overrideRange) {
      // override_conversacion_range: [from, to] inclusive, 1-indexed (los humanos
      // numeran desde 1, no 0).
      const [from, to] = overrides.overrideRange
      const slice = allTurnos.slice(Math.max(0, from - 1), to)
      turnosInput = slice.filter(t => t.rol === 'user' || t.rol === 'model')
    } else {
      // Filtrar a turnos del paso = paso (conversación del Bloque que se audita).
      // Solo user|model — el reviewer no audita los turnos reviewer/snapshot.
      const turnosBloque = allTurnos.filter(
        t => t.paso === paso && (t.rol === 'user' || t.rol === 'model'),
      )
      // Para Bloque 1 también incluir Paso 0 (Encuadre) según el diseño.
      turnosInput = paso === 1
        ? allTurnos.filter(t => t.paso <= 1 && (t.rol === 'user' || t.rol === 'model'))
        : turnosBloque
    }

    if (turnosInput.length === 0) {
      // Rollback: el bloque no tiene material, no se puede auditar.
      await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', estadoOrigen)
      send({
        type: 'error',
        code: 'empty_block',
        detail: `No hay turnos para auditar (después de aplicar filtros y overrides).`,
      })
      return
    }

    // Resumen: si hay override, usarlo directo (markdown). Sino, serializar
    // el plan vivo. Cuando readOnly + override resumen, el reviewer NO ve el
    // estado actual del plan — solo el material auditado.
    const resumenMd = overrides.overrideResumen ?? await serializeResumenPaso(plan, paso)

    // ── Construir prompts ──
    // Si readOnly: pasamos el flag `historicoEducativo` al system prompt para
    // que el reviewer NO se contenga marcando hallazgos posiblemente resueltos.
    const systemPrompt = buildReviewerSystemPrompt(paso, { historicoEducativo: overrides.readOnly })
    const userMessage = buildReviewerUserMessage({
      bloque: paso,
      turnos: turnosInput,
      resumenEstructurado: resumenMd,
      auditoriasPrevias: audicionesPrevias.length > 0
        ? audicionesPrevias.map(a => ({
            report: a.report,
            decisiones: a.decisiones,
            costo_usd: a.costo_usd,
            retry_count: a.retry_count,
          }))
        : undefined,
    })

    // ── Llamar al reviewer con onProgress que streamea al cliente ──
    send({ type: 'progress', etapa: 'esperando_reviewer', elapsed_ms: 0 })

    const result = await callReviewer({
      systemPrompt,
      userMessage,
      schema: REVIEWER_REPORT_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'reviewer_report',
      maxOutputTokens: 16000,
      onProgress: (elapsedMs) => send({ type: 'progress', etapa: 'esperando_reviewer', elapsed_ms: elapsedMs }),
    })

    if (!result.ok) {
      // Rollback de estado para que el user pueda reintentar.
      await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', estadoOrigen)
      // Persistimos un turno reviewer con Failed=true para tracking.
      await appendReviewerTurno(entrevista.id, allTurnos.length, {
        paso,
        bloqueAuditado: paso,
        modelo: result.metrics.model,
        report: { errors: [], questions: [], cross_block_changes: [], meta: {
          errores_alta: 0, errores_media: 0, errores_baja: 0,
          preguntas_criticas: 0, preguntas_recomendadas: 0,
          cross_block_changes_total: 0,
          confianza_general: 'Baja',
          justificacion_confianza: `Failed: ${result.reason}. ${result.details.slice(0, 300)}`,
        } },
        costo_usd: result.metrics.cost_usd,
        latencia_ms: result.metrics.latency_ms,
        retry_count: result.metrics.retries_used,
        failed: true,
        read_only: overrides.readOnly,
        via_script: overrides.viaScript,
      })
      send({
        type: 'error',
        code: result.reason,
        detail: result.details,
        metrics: result.metrics,
        // Counter NO se incrementó (failures no consumen slot), entonces hay
        // retry disponible mientras currentCount < 3 (validado al inicio del flow).
        retry_available: currentCount < 3,
      })
      return
    }

    // ── Validar shape contra reglas de aplicación ──
    const validation = validateReviewerReport(result.data, paso)
    if (!validation.ok) {
      await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', estadoOrigen)
      await appendReviewerTurno(entrevista.id, allTurnos.length, {
        paso,
        bloqueAuditado: paso,
        modelo: result.metrics.model,
        report: { errors: [], questions: [], cross_block_changes: [], meta: {
          errores_alta: 0, errores_media: 0, errores_baja: 0,
          preguntas_criticas: 0, preguntas_recomendadas: 0,
          cross_block_changes_total: 0,
          confianza_general: 'Baja',
          justificacion_confianza: `Validation failed: ${validation.errors.slice(0, 3).join(' | ')}`,
        } },
        costo_usd: result.metrics.cost_usd,
        latencia_ms: result.metrics.latency_ms,
        retry_count: result.metrics.retries_used,
        failed: true,
        read_only: overrides.readOnly,
        via_script: overrides.viaScript,
      })
      send({
        type: 'error',
        code: 'invalid_shape',
        detail: validation.errors.join(' | '),
        metrics: result.metrics,
        // Counter NO se incrementó (failures no consumen slot), entonces hay
        // retry disponible mientras currentCount < 3 (validado al inicio del flow).
        retry_available: currentCount < 3,
      })
      return
    }

    // ── Éxito: persistir turno reviewer + incrementar counter + transicionar ──
    //
    // Orden: turno reviewer primero (es el dato más valioso), después counter,
    // después transición. Si crashea entre el turno y la transición, el GET
    // /audit/[turno_id]/status detecta la inconsistencia (estado en proceso +
    // turno reviewer reciente con report válido) y auto-corrige.
    const reviewerTurno = await appendReviewerTurno(entrevista.id, allTurnos.length, {
      paso,
      bloqueAuditado: paso,
      modelo: result.metrics.model,
      report: validation.data,
      costo_usd: result.metrics.cost_usd,
      latencia_ms: result.metrics.latency_ms,
      retry_count: result.metrics.retries_used,
      read_only: overrides.readOnly,
      via_script: overrides.viaScript,
    })

    // Counter solo se incrementa tras éxito real — failures NO consumen slot.
    // Para audits read_only NO incrementamos el counter — son audits educativas
    // que no compiten con los 3 slots de audit "real" que tiene el paso.
    if (!overrides.readOnly) {
      await incrementAuditoriasPaso(entrevista.id, paso as 1 | 2, currentCount)
    }

    await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', 'auditoria_completa')

    console.log('[audit/start]', JSON.stringify({
      event: 'audit_completed',
      plan_id: plan.id,
      entrevista_id: entrevista.id,
      paso,
      reviewer_turno_id: reviewerTurno.id,
      audit_count_now: currentCount + 1,
      ...result.metrics,
      errores: validation.data.errors.length,
      preguntas: validation.data.questions.length,
      confianza: validation.data.meta.confianza_general,
    }))

    send({
      type: 'result',
      report: validation.data,
      metrics: result.metrics,
      reviewer_turno_id: reviewerTurno.id,
    })
  } catch (err) {
    // Cualquier error inesperado dentro del audit flow: rollback estado y reportar.
    console.error('[audit/start] Error inesperado dentro de handleAudit:', err)
    await updateSubEstadoPaso(entrevista.id, 'auditoria_en_proceso', estadoOrigen).catch(() => undefined)
    send({
      type: 'error',
      code: 'unexpected',
      detail: err instanceof Error ? err.message : String(err),
      retry_available: currentCount + 1 < 3,
    })
  }
}
