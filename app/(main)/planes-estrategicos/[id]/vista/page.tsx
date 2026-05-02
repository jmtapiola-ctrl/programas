import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Source_Serif_4 } from 'next/font/google'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getUsuario,
} from '@/lib/airtable'
import './vista.css'

const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata = {
  title: 'Plan Estratégico — Vista completa',
}

export default async function VistaPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const plan = await getPlanEstrategico(id).catch(() => null)
  if (!plan) notFound()

  // Cargas paralelas: entrevista (para "última actualización"), responsable
  const [entrevista, responsable] = await Promise.all([
    getEntrevistaPE(id).catch(() => null),
    plan.responsable_id ? getUsuario(plan.responsable_id).catch(() => null) : Promise.resolve(null),
  ])

  const ultimaActualizacion = entrevista?.ultima_actividad
    ? new Date(entrevista.ultima_actividad).toLocaleDateString('es-AR', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  const proposito = plan.proposito
  const situacion = plan.situacion
  const datosFaltantes = plan.datos_faltantes ?? []

  return (
    <div className={`pe-vista-root ${serif.variable}`}>
      <div className="pe-vista-container">
        {/* ─── Header ───────────────────────────────────────────────────── */}
        <header className="pe-vista-header">
          <div className="top-bar">
            <Link href={`/planes-estrategicos/${id}/entrevista`} className="back">
              ← Volver al wizard
            </Link>
            <span className="back" style={{ fontSize: 11 }}>
              Documento read-only · Cmd/Ctrl+P para guardar PDF
            </span>
          </div>
          <h1>{plan.nombre || '(plan sin nombre)'}</h1>
          <p className="subtitle">
            Plan {plan.tipo}
            {responsable && ` · ${responsable.nombre}`}
            {plan.area && ` · ${plan.area}`}
          </p>
          {ultimaActualizacion && (
            <p className="meta">Última actualización: {ultimaActualizacion}</p>
          )}
        </header>

        <div className="pe-vista">
          {/* ─── Propósito ───────────────────────────────────────────── */}
          <section>
            <h2>Propósito</h2>

            <h3>Lugar de llegada</h3>
            <Field text={proposito?.escena} placeholder="Aún no declarado." />

            <h3>Métricas {proposito?.metricas?.length ? `(${proposito.metricas.length})` : ''}</h3>
            {proposito?.metricas?.length ? (
              <ol>
                {proposito.metricas.map((m: any, i) => (
                  <li key={i}>
                    {typeof m === 'string' ? (
                      m
                    ) : (
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
                {proposito.fuera.map((f: any, i) => (
                  <li key={i}>
                    {typeof f === 'string' ? (
                      f
                    ) : (
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

          {/* ─── Situación ───────────────────────────────────────────── */}
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
                {situacion.desvios_secundarios.map((d: any, i) => (
                  <li key={i}>
                    {typeof d === 'string' ? (
                      d
                    ) : (
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
                {situacion.resistencias.map((r: any, i) => (
                  <li key={i}>
                    {typeof r === 'string' ? (
                      r
                    ) : (
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

          {/* ─── Datos por conseguir ─────────────────────────────────── */}
          {datosFaltantes.length > 0 && (
            <section>
              <h2>Datos por conseguir {`(${datosFaltantes.length})`}</h2>
              <ul>
                {datosFaltantes.map((d, i) => (
                  <li key={i}>{typeof d === 'string' ? d : JSON.stringify(d)}</li>
                ))}
              </ul>
            </section>
          )}

          {/* ─── Placeholders para Pasos 3-5 (futuros) ───────────────── */}
          {/* Cuando el wizard se extienda con Pasos 3 (estrategia), 4 y 5,
              acá van las secciones nuevas. La estructura actual deja espacio
              suficiente entre Situación y Datos por conseguir para insertarlas
              sin re-ordenar nada. */}
        </div>
      </div>
    </div>
  )
}

function Field({ text, placeholder }: { text?: string; placeholder?: string }) {
  if (text && text.trim()) {
    return <p>{text}</p>
  }
  return <p className="empty">{placeholder ?? '—'}</p>
}
