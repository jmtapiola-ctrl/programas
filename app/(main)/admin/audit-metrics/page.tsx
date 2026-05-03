// Dashboard /admin/audit-metrics
//
// Server component que rendea las métricas agregadas del feature de
// audit-reviewer. Solo visible para usuarios con rol Ejecutivo o Program Manager.
//
// Filtrable por rango de fechas vía query params ?desde=...&hasta=...

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUsuarioByEmail } from '@/lib/airtable'
import { getMetricasAuditoria } from '@/lib/audit-metrics'

export const metadata = { title: 'Métricas de Auditoría — Admin' }

export default async function AuditMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/login')
  const user = await getUsuarioByEmail(session.user.email)
  if (!user) redirect('/login')
  if (user.rol !== 'Ejecutivo' && user.rol !== 'Program Manager') {
    return (
      <div className="p-8 text-gray-300">
        Acceso restringido. Solo Ejecutivos y Program Managers pueden ver este dashboard.
      </div>
    )
  }

  const { desde, hasta } = await searchParams
  const metricas = await getMetricasAuditoria({ fechaDesde: desde, fechaHasta: hasta })

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 text-gray-100">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Métricas de Auditoría (audit-reviewer)</h1>
        <p className="text-sm text-gray-400">
          Agregación de turnos reviewer + snapshot desde Airtable.
          {desde || hasta ? ` Rango: ${desde ?? '(inicio)'} → ${hasta ?? '(ahora)'}` : ' Rango: completo'}
        </p>
        <FormFiltros desde={desde} hasta={hasta} />
      </header>

      {metricas.warnings.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3 text-[12px] text-yellow-100">
          {metricas.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* Totales */}
      <Section titulo="Totales">
        <Tabla rows={[
          ['Audits disparados', String(metricas.totales.audits_disparados)],
          ['Audits completados OK', String(metricas.totales.audits_completados_ok)],
          ['Audits skipped', String(metricas.totales.audits_skipped)],
          ['Audits failed (3 retries)', String(metricas.totales.audits_failed)],
          ['Apply completados (con decisiones)', String(metricas.totales.apply_completados)],
          ['Snapshots inmutables creados', String(metricas.totales.snapshots_inmutables_creados)],
        ]} />
      </Section>

      {/* Porcentajes */}
      <Section titulo="Tasas">
        <Tabla rows={[
          ['Skip rate', formatPct(metricas.porcentajes.skip_rate)],
          ['Failure rate', formatPct(metricas.porcentajes.failure_rate)],
          ['Re-audit rate (entrevistas con ≥2 audits)', formatPct(metricas.porcentajes.re_audit_rate)],
        ]} />
      </Section>

      {/* Hallazgos */}
      <Section titulo="Hallazgos promedio por audit (solo OK)">
        <Tabla rows={[
          ['Errores Alta', formatNum(metricas.hallazgos_promedio_por_audit.errors_alta)],
          ['Errores Media', formatNum(metricas.hallazgos_promedio_por_audit.errors_media)],
          ['Errores Baja', formatNum(metricas.hallazgos_promedio_por_audit.errors_baja)],
          ['Preguntas críticas', formatNum(metricas.hallazgos_promedio_por_audit.preguntas_criticas)],
          ['Preguntas recomendadas', formatNum(metricas.hallazgos_promedio_por_audit.preguntas_recomendadas)],
        ]} />
      </Section>

      {/* Decisiones */}
      <Section titulo="Decisiones del usuario sobre hallazgos">
        <Tabla rows={[
          ['Total decisiones', String(metricas.decisiones_agregadas.total_decisiones)],
          ['Errors aprobados (sin edición)', String(metricas.decisiones_agregadas.errors_aprobados)],
          ['Errors aprobados con edición', String(metricas.decisiones_agregadas.errors_aprobados_con_cambios)],
          ['Errors ignorados', String(metricas.decisiones_agregadas.errors_ignorados)],
          ['Questions respondidas', String(metricas.decisiones_agregadas.questions_respondidas)],
          ['Questions ignoradas', String(metricas.decisiones_agregadas.questions_ignoradas)],
          ['Tasa aprobación errors', formatPct(metricas.decisiones_agregadas.tasa_aprobacion_errors)],
          ['Tasa aprobación Críticas Alta ⭐', formatPct(metricas.decisiones_agregadas.tasa_aprobacion_criticas_alta)],
          ['Tasa respuesta preguntas', formatPct(metricas.decisiones_agregadas.tasa_respuesta_preguntas)],
        ]} />
        <p className="text-[10px] text-gray-500 mt-2">
          ⭐ La <strong>tasa de aprobación de Críticas Alta</strong> es la métrica de calibración del reviewer.
          Si baja del 60%, el reviewer está produciendo ruido en sus hallazgos más graves — recalibrar prompt.
        </p>
      </Section>

      {/* Costo y latencia */}
      <Section titulo="Costo y latencia">
        <Tabla rows={[
          ['Costo total reviewer (OpenAI)', `$${metricas.costo_y_latencia.costo_total_reviewer_usd.toFixed(3)}`],
          ['Costo total apply (Anthropic Opus)', `$${metricas.costo_y_latencia.costo_total_apply_usd.toFixed(3)}`],
          ['Costo total combinado', `$${metricas.costo_y_latencia.costo_total_usd.toFixed(3)}`],
          ['Costo promedio por audit', `$${metricas.costo_y_latencia.costo_promedio_por_audit_usd.toFixed(3)}`],
          ['Latencia promedio reviewer', `${metricas.costo_y_latencia.latencia_promedio_reviewer_seg.toFixed(1)}s`],
          ['Latencia promedio apply', `${metricas.costo_y_latencia.latencia_promedio_apply_seg.toFixed(1)}s`],
        ]} />
      </Section>

      {/* Por modelo */}
      <Section titulo="Por modelo">
        {Object.keys(metricas.por_modelo).length === 0 ? (
          <p className="text-gray-500 text-sm">Sin datos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-800">
              <tr><th className="text-left py-2">Modelo</th><th className="text-right">Audits</th><th className="text-right">Costo total</th><th className="text-right">Latencia avg</th><th className="text-right">% Confianza Alta</th></tr>
            </thead>
            <tbody>
              {Object.entries(metricas.por_modelo).map(([modelo, m]) => (
                <tr key={modelo} className="border-b border-gray-900">
                  <td className="py-2">{modelo}</td>
                  <td className="text-right">{m.audits}</td>
                  <td className="text-right">${m.costo_total_usd.toFixed(3)}</td>
                  <td className="text-right">{m.latencia_promedio_seg.toFixed(1)}s</td>
                  <td className="text-right">{m.confianza_alta_pct.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Notas */}
      <section className="text-[11px] text-gray-500 space-y-2 border-t border-gray-800 pt-4">
        <p>
          <strong>Nota — first_attempt_no_block_rate:</strong> esta métrica
          (definida en wrap-up Fase 0) viene de logs estructurados del chat
          route, no de Airtable. Pendiente: scrape de logs Vercel cuando deployemos.
        </p>
        <p>
          <strong>Pricing referencia:</strong> gpt-5.5 $5/$25 por M tokens (placeholder),
          claude-opus-4-7 $15/$75 por M tokens. Re-calibrar con factura real.
        </p>
      </section>
    </div>
  )
}

function FormFiltros({ desde, hasta }: { desde?: string; hasta?: string }) {
  return (
    <form method="GET" className="flex gap-2 items-center text-[12px]">
      <label className="text-gray-400">Desde:</label>
      <input
        type="date"
        name="desde"
        defaultValue={desde?.slice(0, 10)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100"
      />
      <label className="text-gray-400">Hasta:</label>
      <input
        type="date"
        name="hasta"
        defaultValue={hasta?.slice(0, 10)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100"
      />
      <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-3 py-1 rounded">
        Filtrar
      </button>
      <a href="/admin/audit-metrics" className="text-gray-500 hover:text-gray-300 text-[11px]">
        Reset
      </a>
    </form>
  )
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[13px] uppercase tracking-wider text-white font-semibold border-b border-gray-700 pb-2">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Tabla({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-gray-900">
            <td className="py-2 text-gray-300">{k}</td>
            <td className="py-2 text-right text-white font-mono">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function formatNum(n: number): string {
  return n.toFixed(2)
}
