// Pantalla 1 — `/planes-estrategicos/[id]/cierre/[paso]`
// URL real: `/planes-estrategicos/<id>/cierre/1` (paso = 1, 2, ...)
// El folder usa `[paso]` literal (dynamic segment), NO `paso-[paso]` —
// Next App Router solo soporta dynamic segments que ocupan el folder entero.
//
// Vista del paso cerrado (filtrada al Paso solamente, no plan completo) +
// 2 botones (Auditar / Saltar) renderizados por AuditFlowClient.
//
// Reusa el CSS de la Vista de prestigio (Pieza 4) — comparte la misma estética.
//
// Si el paso ya tiene una auditoría completada (sub_estado_paso post-flow),
// hidrata directamente a Pantalla 3 con el report cargado.

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Source_Serif_4 } from 'next/font/google'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getUsuario,
  getReviewerTurnos,
} from '@/lib/airtable'
import { AuditFlowClient } from '@/components/audit/AuditFlowClient'
import type { ReviewerReport, DecisionUsuario } from '@/lib/types'
import '../../vista/vista.css'

const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata = {
  title: 'Cierre del Paso — Plan Estratégico',
}

export default async function CierrePasoPage({
  params,
}: {
  params: Promise<{ id: string; paso: string }>
}) {
  const { id, paso: pasoStr } = await params
  const paso = Number.parseInt(pasoStr, 10)
  if (!Number.isInteger(paso) || paso < 1 || paso > 5) notFound()

  const plan = await getPlanEstrategico(id).catch(() => null)
  if (!plan) notFound()

  const [entrevista, responsable] = await Promise.all([
    getEntrevistaPE(id).catch(() => null),
    plan.responsable_id ? getUsuario(plan.responsable_id).catch(() => null) : Promise.resolve(null),
  ])

  if (!entrevista) notFound()

  // Validación de estado: solo permitimos esta vista si:
  //   - sub_estado_paso es esperando_auditoria (entrada normal desde el wizard)
  //   - O auditoria_completa / esperando_aprobacion_final (recovery tras abandono)
  // En cualquier otro estado redirigimos al wizard.
  const sub = entrevista.sub_estado_paso ?? 'en_curso'
  const estadosValidos: Array<typeof sub> = [
    'esperando_auditoria',
    'auditoria_en_proceso',
    'auditoria_completa',
    'aplicando_cambios',
    'esperando_aprobacion_final',
    'completo',
  ]
  if (!estadosValidos.includes(sub)) {
    redirect(`/planes-estrategicos/${id}/entrevista`)
  }

  // Hidratación: si ya hay un turno reviewer reciente sin failed/skipped, lo cargamos.
  let reviewerTurnoIdInicial: string | undefined
  let reportInicial: ReviewerReport | undefined
  let decisionesIniciales: DecisionUsuario[] | undefined
  let readOnlyInicial = false
  let autoCorregido = false

  if (sub === 'auditoria_completa' || sub === 'esperando_aprobacion_final' || sub === 'aplicando_cambios') {
    const reviewerTurnos = await getReviewerTurnos(entrevista.id, paso).catch(() => [])
    const ultimoExitoso = [...reviewerTurnos].reverse().find(r => {
      const j = r.report?.meta?.justificacion_confianza ?? ''
      return !/skipped|failed/i.test(j)
    })
    if (ultimoExitoso) {
      reviewerTurnoIdInicial = ultimoExitoso.airtableId
      reportInicial = ultimoExitoso.report
      decisionesIniciales = ultimoExitoso.decisiones
      readOnlyInicial = ultimoExitoso.readOnly
    }
  }

  // Auto-corrección: si sub === 'auditoria_en_proceso' pero hay un turno reviewer
  // exitoso, el GET /audit/.../status auto-corrige. Acá NO la disparamos (server
  // component); el AuditFlowClient va a hacer el GET cuando lo necesite. Sin embargo,
  // si llegamos a esta page con auditoria_en_proceso, indicamos en la UI que algo
  // pasó (probablemente recovery).
  if (sub === 'auditoria_en_proceso') {
    autoCorregido = true
  }

  return (
    <div className={`pe-vista-root ${serif.variable}`}>
      <div className="pe-vista-container">
        {/* Header */}
        <header className="pe-vista-header">
          <div className="top-bar">
            <Link href={`/planes-estrategicos/${id}/entrevista`} className="back">
              ← Volver al wizard
            </Link>
            <span className="back" style={{ fontSize: 11 }}>
              Cierre del Paso {paso}
            </span>
          </div>
          <h1>{plan.nombre || '(plan sin nombre)'}</h1>
          <p className="subtitle">
            Plan {plan.tipo}
            {responsable && ` · ${responsable.nombre}`}
            {plan.area && ` · ${plan.area}`}
          </p>
          <p className="meta" style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            Cierre formal del Paso {paso} · revisá el contenido y decidí si auditar antes de avanzar.
          </p>
        </header>

        <div className="pe-vista">
          {/* Bloque 1: Encuadre + Propósito */}
          {paso === 1 && (
            <PropositoSection plan={plan} />
          )}

          {/* Bloque 2: Situación */}
          {paso === 2 && (
            <SituacionSection plan={plan} />
          )}

          {/* Footer client: botones + modales del flow */}
          <AuditFlowClient
            planId={id}
            paso={paso}
            subEstadoActual={sub}
            reviewerTurnoIdInicial={reviewerTurnoIdInicial}
            reportInicial={reportInicial}
            decisionesIniciales={decisionesIniciales}
            readOnlyInicial={readOnlyInicial}
            autoCorregido={autoCorregido}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Secciones de render ─────────────────────────────────────────────────────

function PropositoSection({ plan }: { plan: any }) {
  const proposito = plan.proposito
  return (
    <section>
      <h2>Propósito</h2>

      <h3>Lugar de llegada</h3>
      <Field text={proposito?.escena} placeholder="Aún no declarado." />

      <h3>Métricas {proposito?.metricas?.length ? `(${proposito.metricas.length})` : ''}</h3>
      {proposito?.metricas?.length ? (
        <ol>
          {proposito.metricas.map((m: any, i: number) => (
            <li key={i}>
              {typeof m === 'string' ? m : (
                <>
                  <span className="item-title">{m.metrica}</span>
                  {m.valor_objetivo}
                  {m.valor_actual && (
                    <span className="item-detail">
                      <span className="item-label">Hoy</span>{m.valor_actual}
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="empty">Sin métricas definidas todavía.</p>}

      <h3>Fuera de scope {proposito?.fuera?.length ? `(${proposito.fuera.length})` : ''}</h3>
      {proposito?.fuera?.length ? (
        <ul>
          {proposito.fuera.map((f: any, i: number) => (
            <li key={i}>
              {typeof f === 'string' ? f : (
                <>
                  <span className="item-title">{f.item}</span>
                  {f.razon && <span className="item-detail">{f.razon}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="empty">Sin items fuera de scope declarados.</p>}

      <h3>Horizonte</h3>
      <Field text={proposito?.horizonte} placeholder="No declarado." />

      <h3>Estabilidad</h3>
      <Field text={proposito?.estabilidad} placeholder="No declarada." />
    </section>
  )
}

function SituacionSection({ plan }: { plan: any }) {
  const situacion = plan.situacion
  return (
    <section>
      <h2>Situación</h2>

      <h3>Desvío principal</h3>
      <Field text={situacion?.desvio_principal} placeholder="Aún no identificado." />
      {situacion?.desvio_cuantificado && (
        <>
          <h3>Cuantificación</h3>
          <Field text={situacion.desvio_cuantificado} />
        </>
      )}

      <h3>Desvíos secundarios {situacion?.desvios_secundarios?.length ? `(${situacion.desvios_secundarios.length})` : ''}</h3>
      {situacion?.desvios_secundarios?.length ? (
        <ol>
          {situacion.desvios_secundarios.map((d: any, i: number) => (
            <li key={i}>
              {typeof d === 'string' ? d : (
                <>
                  <span className="item-title">{d.descripcion}</span>
                  {d.datos && <span className="item-detail">{d.datos}</span>}
                </>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="empty">Sin desvíos secundarios declarados.</p>}

      <h3>Causa raíz</h3>
      <Field text={situacion?.causa_raiz} placeholder="No identificada." />

      <h3>Recursos actuales</h3>
      <Field text={situacion?.recursos_actuales} placeholder="No declarados." />

      <h3>Recursos faltantes</h3>
      <Field text={situacion?.recursos_faltantes} placeholder="No declarados." />

      <h3>Intentos previos</h3>
      <Field text={situacion?.intentos_previos} placeholder="No declarados." />

      <h3>Resistencias y amenazas {situacion?.resistencias?.length ? `(${situacion.resistencias.length})` : ''}</h3>
      {situacion?.resistencias?.length ? (
        <ol>
          {situacion.resistencias.map((r: any, i: number) => (
            <li key={i}>
              {typeof r === 'string' ? r : (
                <>
                  <span className="item-title">
                    {r.actor}
                    {(r.tipo || r.criticidad) && (
                      <span className="item-meta">
                        {[r.tipo, r.criticidad && `criticidad ${r.criticidad}`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {r.descripcion && <span className="item-detail">{r.descripcion}</span>}
                  {r.mitigacion && (
                    <span className="item-detail">
                      <span className="item-label">Mitigación</span>{r.mitigacion}
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="empty">Sin resistencias declaradas.</p>}

      <h3>Consecuencias de no actuar</h3>
      {(situacion?.consecuencia_6m || situacion?.consecuencia_12m) ? (
        <>
          {situacion.consecuencia_6m && (
            <p>
              <span className="item-label">En 6 meses</span>
              {situacion.consecuencia_6m}
            </p>
          )}
          {situacion.consecuencia_12m && (
            <p>
              <span className="item-label">En 12 meses</span>
              {situacion.consecuencia_12m}
            </p>
          )}
        </>
      ) : <p className="empty">No declaradas.</p>}
    </section>
  )
}

function Field({ text, placeholder }: { text?: string; placeholder?: string }) {
  if (text && text.trim()) return <p>{text}</p>
  return <p className="empty">{placeholder ?? '—'}</p>
}
