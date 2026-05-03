// Agregación de métricas del feature de audit-reviewer desde Turnos_PE.
//
// Lee TODOS los turnos con rol=reviewer + snapshot, calcula agregados.
// Filtros opcionales por rango de fechas (basado en Timestamp del turno).
//
// Output destinado al dashboard /admin/audit-metrics.

import type { ReviewerReport, DecisionUsuario } from './types'

const TABLA_TURNOS_PE = 'tblWxPv53CRscq18w'
const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`

function safeParseJson<T>(value: any, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

interface ReviewerTurnoRaw {
  airtableId: string
  paso: number
  modelo: string
  report: ReviewerReport
  decisiones?: DecisionUsuario[]
  costo_usd: number
  latencia_ms: number
  retry_count: number
  applyCostoUsd: number
  applyLatenciaMs: number
  skipped: boolean
  failed: boolean
  timestamp: string
  entrevista_id: string
}

async function fetchAllReviewerTurnos(): Promise<ReviewerTurnoRaw[]> {
  const records: any[] = []
  let offset: string | undefined
  do {
    let url = `${BASE_URL}/${TABLA_TURNOS_PE}?pageSize=100&sort[0][field]=Indice&sort[0][direction]=asc`
    if (offset) url += `&offset=${offset}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Airtable fetch error: ${res.status}`)
    const data = await res.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  return records
    .filter(r => {
      const rolName = r.fields?.['Rol']?.name ?? r.fields?.['Rol']
      return rolName === 'reviewer'
    })
    .map(r => {
      const f = r.fields ?? {}
      return {
        airtableId: r.id,
        paso: f['Reviewer Bloque Auditado'] ?? f['Paso'] ?? 0,
        modelo: f['Reviewer Modelo'] ?? '',
        report: safeParseJson<ReviewerReport>(f['Contenido'], {
          errors: [], questions: [], cross_block_changes: [],
          meta: { errores_alta: 0, errores_media: 0, errores_baja: 0, preguntas_criticas: 0, preguntas_recomendadas: 0, cross_block_changes_total: 0, confianza_general: 'Baja', justificacion_confianza: '' },
        }),
        decisiones: f['Reviewer Decisiones JSON']
          ? safeParseJson<DecisionUsuario[]>(f['Reviewer Decisiones JSON'], [])
          : undefined,
        costo_usd: f['Reviewer Costo USD'] ?? 0,
        latencia_ms: f['Reviewer Latencia MS'] ?? 0,
        retry_count: f['Reviewer Retry Count'] ?? 0,
        applyCostoUsd: f['Apply Changes Cost USD'] ?? 0,
        applyLatenciaMs: f['Apply Changes Latency MS'] ?? 0,
        skipped: f['Reviewer Skipped'] === true,
        failed: f['Reviewer Failed'] === true,
        timestamp: f['Timestamp'] ?? '',
        entrevista_id: (f['Entrevista'] ?? [])[0] ?? '',
      }
    })
}

// ─── Tipo del output ─────────────────────────────────────────────────────────

export interface AuditMetrics {
  rangoFechas: { desde?: string; hasta?: string }
  totales: {
    audits_disparados: number          // suma de turnos reviewer (con o sin skip/failed)
    audits_completados_ok: number      // ni skipped ni failed
    audits_skipped: number             // skipped por user (incluye api_failure)
    audits_failed: number              // failed (3 retries fallaron)
    apply_completados: number          // turnos reviewer con decisiones persistidas
    snapshots_inmutables_creados: number  // turnos rol=snapshot (lo lee aparte abajo)
  }
  porcentajes: {
    skip_rate: number                  // skipped / disparados
    failure_rate: number               // failed / disparados
    re_audit_rate: number              // entrevistas con >= 2 audits / entrevistas con >= 1 audit
  }
  hallazgos_promedio_por_audit: {
    errors_alta: number
    errors_media: number
    errors_baja: number
    preguntas_criticas: number
    preguntas_recomendadas: number
  }
  decisiones_agregadas: {
    total_decisiones: number
    errors_aprobados: number
    errors_aprobados_con_cambios: number
    errors_ignorados: number
    questions_respondidas: number
    questions_ignoradas: number
    tasa_aprobacion_errors: number          // (aprobados + aprobados_con_cambios) / total errors decididos
    tasa_aprobacion_criticas_alta: number   // (aprobados + aprobados_con_cambios) / errors Alta decididos
    tasa_respuesta_preguntas: number        // respondidas / total preguntas decididas
  }
  costo_y_latencia: {
    costo_total_reviewer_usd: number
    costo_total_apply_usd: number
    costo_total_usd: number
    costo_promedio_por_audit_usd: number
    latencia_promedio_reviewer_seg: number
    latencia_promedio_apply_seg: number
  }
  por_modelo: Record<string, { audits: number; costo_total_usd: number; latencia_promedio_seg: number; confianza_alta_pct: number }>
  warnings: string[]
}

// ─── Función principal ───────────────────────────────────────────────────────

export interface MetricsFilters {
  fechaDesde?: string  // ISO datetime, inclusive
  fechaHasta?: string  // ISO datetime, exclusive
}

export async function getMetricasAuditoria(filters?: MetricsFilters): Promise<AuditMetrics> {
  const allTurnos = await fetchAllReviewerTurnos()

  // Filtrar por rango de fechas si aplica.
  const turnos = allTurnos.filter(t => {
    if (filters?.fechaDesde && t.timestamp < filters.fechaDesde) return false
    if (filters?.fechaHasta && t.timestamp >= filters.fechaHasta) return false
    return true
  })

  // Snapshots: contar turnos rol=snapshot en el mismo rango.
  const snapshotsCount = await fetchSnapshotsCount(filters)

  const warnings: string[] = []
  if (turnos.length === 0) {
    warnings.push('No hay turnos reviewer en el rango especificado.')
  }

  // Totales.
  const audits_disparados = turnos.length
  const audits_skipped = turnos.filter(t => t.skipped).length
  const audits_failed = turnos.filter(t => t.failed).length
  const audits_completados_ok = turnos.filter(t => !t.skipped && !t.failed).length
  const apply_completados = turnos.filter(t => t.decisiones && t.decisiones.length > 0).length

  // Re-audit rate: entrevistas distintas con >=2 audits.
  const audicionesPorEntrevista = new Map<string, number>()
  for (const t of turnos) {
    audicionesPorEntrevista.set(t.entrevista_id, (audicionesPorEntrevista.get(t.entrevista_id) ?? 0) + 1)
  }
  const entrevistasConAlMenosUna = audicionesPorEntrevista.size
  const entrevistasConDosOMas = [...audicionesPorEntrevista.values()].filter(n => n >= 2).length
  const re_audit_rate = entrevistasConAlMenosUna > 0 ? entrevistasConDosOMas / entrevistasConAlMenosUna : 0

  // Hallazgos promedio (solo sobre audits_completados_ok).
  const turnosOK = turnos.filter(t => !t.skipped && !t.failed)
  function avg(getter: (t: ReviewerTurnoRaw) => number): number {
    if (turnosOK.length === 0) return 0
    return turnosOK.reduce((s, t) => s + getter(t), 0) / turnosOK.length
  }
  const hallazgos = {
    errors_alta: avg(t => t.report?.meta?.errores_alta ?? 0),
    errors_media: avg(t => t.report?.meta?.errores_media ?? 0),
    errors_baja: avg(t => t.report?.meta?.errores_baja ?? 0),
    preguntas_criticas: avg(t => t.report?.meta?.preguntas_criticas ?? 0),
    preguntas_recomendadas: avg(t => t.report?.meta?.preguntas_recomendadas ?? 0),
  }

  // Decisiones agregadas — solo sobre audits con decisiones persistidas.
  let total_decisiones = 0
  let errors_aprobados = 0
  let errors_aprobados_con_cambios = 0
  let errors_ignorados = 0
  let errors_alta_aprobados = 0
  let errors_alta_decididos = 0
  let questions_respondidas = 0
  let questions_ignoradas = 0
  for (const t of turnos) {
    if (!t.decisiones) continue
    const errorsById = new Map(t.report.errors.map(e => [e.id, e]))
    for (const d of t.decisiones) {
      total_decisiones++
      if (d.tipo === 'error') {
        const error = errorsById.get(d.hallazgo_id)
        const esAlta = error?.severidad === 'Alta'
        if (esAlta) errors_alta_decididos++
        if (d.decision === 'aprobado') {
          errors_aprobados++
          if (esAlta) errors_alta_aprobados++
        } else if (d.decision === 'aprobado_con_cambios') {
          errors_aprobados_con_cambios++
          if (esAlta) errors_alta_aprobados++
        } else if (d.decision === 'ignorado') {
          errors_ignorados++
        }
      } else if (d.tipo === 'pregunta') {
        if (d.decision === 'respondido') questions_respondidas++
        else if (d.decision === 'ignorado') questions_ignoradas++
      }
    }
  }
  const total_errors_decididos = errors_aprobados + errors_aprobados_con_cambios + errors_ignorados
  const total_questions_decididas = questions_respondidas + questions_ignoradas

  // Costo y latencia.
  const costoReviewer = turnos.reduce((s, t) => s + t.costo_usd, 0)
  const costoApply = turnos.reduce((s, t) => s + t.applyCostoUsd, 0)
  const latencyReviewer = turnos.length > 0
    ? turnos.reduce((s, t) => s + t.latencia_ms, 0) / turnos.length / 1000
    : 0
  const latencyApply = apply_completados > 0
    ? turnos.filter(t => t.applyLatenciaMs > 0).reduce((s, t) => s + t.applyLatenciaMs, 0) / apply_completados / 1000
    : 0

  // Por modelo.
  const porModelo: AuditMetrics['por_modelo'] = {}
  const modelosBucket = new Map<string, ReviewerTurnoRaw[]>()
  for (const t of turnos) {
    const key = t.modelo || '(sin modelo)'
    if (!modelosBucket.has(key)) modelosBucket.set(key, [])
    modelosBucket.get(key)!.push(t)
  }
  for (const [modelo, ts] of modelosBucket.entries()) {
    const tsOK = ts.filter(t => !t.skipped && !t.failed)
    const confianzaAlta = tsOK.filter(t => t.report?.meta?.confianza_general === 'Alta').length
    porModelo[modelo] = {
      audits: ts.length,
      costo_total_usd: ts.reduce((s, t) => s + t.costo_usd + t.applyCostoUsd, 0),
      latencia_promedio_seg: ts.length > 0 ? ts.reduce((s, t) => s + t.latencia_ms, 0) / ts.length / 1000 : 0,
      confianza_alta_pct: tsOK.length > 0 ? (confianzaAlta / tsOK.length) * 100 : 0,
    }
  }

  return {
    rangoFechas: { desde: filters?.fechaDesde, hasta: filters?.fechaHasta },
    totales: {
      audits_disparados,
      audits_completados_ok,
      audits_skipped,
      audits_failed,
      apply_completados,
      snapshots_inmutables_creados: snapshotsCount,
    },
    porcentajes: {
      skip_rate: audits_disparados > 0 ? audits_skipped / audits_disparados : 0,
      failure_rate: audits_disparados > 0 ? audits_failed / audits_disparados : 0,
      re_audit_rate,
    },
    hallazgos_promedio_por_audit: hallazgos,
    decisiones_agregadas: {
      total_decisiones,
      errors_aprobados,
      errors_aprobados_con_cambios,
      errors_ignorados,
      questions_respondidas,
      questions_ignoradas,
      tasa_aprobacion_errors: total_errors_decididos > 0 ? (errors_aprobados + errors_aprobados_con_cambios) / total_errors_decididos : 0,
      tasa_aprobacion_criticas_alta: errors_alta_decididos > 0 ? errors_alta_aprobados / errors_alta_decididos : 0,
      tasa_respuesta_preguntas: total_questions_decididas > 0 ? questions_respondidas / total_questions_decididas : 0,
    },
    costo_y_latencia: {
      costo_total_reviewer_usd: costoReviewer,
      costo_total_apply_usd: costoApply,
      costo_total_usd: costoReviewer + costoApply,
      costo_promedio_por_audit_usd: audits_disparados > 0 ? (costoReviewer + costoApply) / audits_disparados : 0,
      latencia_promedio_reviewer_seg: latencyReviewer,
      latencia_promedio_apply_seg: latencyApply,
    },
    por_modelo: porModelo,
    warnings,
  }
}

async function fetchSnapshotsCount(filters?: MetricsFilters): Promise<number> {
  const records: any[] = []
  let offset: string | undefined
  do {
    let url = `${BASE_URL}/${TABLA_TURNOS_PE}?pageSize=100`
    if (offset) url += `&offset=${offset}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) return 0
    const data = await res.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records.filter(r => {
    const rolName = r.fields?.['Rol']?.name ?? r.fields?.['Rol']
    if (rolName !== 'snapshot') return false
    const ts = r.fields?.['Timestamp'] ?? ''
    if (filters?.fechaDesde && ts < filters.fechaDesde) return false
    if (filters?.fechaHasta && ts >= filters.fechaHasta) return false
    return true
  }).length
}
