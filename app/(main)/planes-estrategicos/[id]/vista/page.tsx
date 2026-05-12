import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Source_Serif_4 } from 'next/font/google'
import ReactMarkdown from 'react-markdown'
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
  const prep = plan.plan?.preparativos

  // Sub-bloques del Plan (Paso 3) que tienen contenido — se renderizan solo
  // los que existen. Cuando 3.A/3.B/3.C/3.D/3.E sumen contenido, se agregan
  // más h3 a la sección Preparativos / nuevas secciones h2.
  const tienePreparativos = !!(
    prep?.areas_afectadas?.length ||
    prep?.supuestos_exogenos?.length ||
    prep?.priorizacion_inicial?.desvio_elegido ||
    prep?.criterio_exito?.por_metrica?.length ||
    prep?.criterio_exito?.zona_fracaso
  )

  // Índice linkeable — secciones (h2) con sus campos (h3). Solo se incluyen
  // los campos que efectivamente existen en el documento.
  const indice: { titulo: string; slug: string; hijos: { titulo: string; slug: string }[] }[] = [
    {
      titulo: 'Propósito', slug: 'proposito',
      hijos: [
        { titulo: 'Lugar de llegada', slug: 'lugar-de-llegada' },
        { titulo: 'Métricas', slug: 'metricas' },
        { titulo: 'Lo que NO haremos', slug: 'lo-que-no-haremos' },
        { titulo: 'Horizonte', slug: 'horizonte' },
        { titulo: 'Estabilidad', slug: 'estabilidad' },
      ],
    },
    {
      titulo: 'Situación', slug: 'situacion',
      hijos: [
        { titulo: 'Desvío principal', slug: 'desvio-principal' },
        ...(situacion?.desvio_cuantificado ? [{ titulo: 'Cuantificación', slug: 'cuantificacion' }] : []),
        { titulo: 'Desvíos secundarios', slug: 'desvios-secundarios' },
        { titulo: 'Causa raíz', slug: 'causa-raiz' },
        { titulo: 'Recursos actuales', slug: 'recursos-actuales' },
        { titulo: 'Recursos faltantes', slug: 'recursos-faltantes' },
        { titulo: 'Intentos previos', slug: 'intentos-previos' },
        { titulo: 'Resistencias y amenazas', slug: 'resistencias-y-amenazas' },
        { titulo: 'Consecuencias de no actuar', slug: 'consecuencias-de-no-actuar' },
      ],
    },
    ...(tienePreparativos ? [{
      titulo: 'Preparativos (3.0)', slug: 'preparativos',
      hijos: [
        ...(prep?.areas_afectadas?.length ? [{ titulo: 'Áreas afectadas', slug: 'areas-afectadas' }] : []),
        ...(prep?.supuestos_exogenos?.length ? [{ titulo: 'Supuestos exógenos', slug: 'supuestos-exogenos' }] : []),
        ...(prep?.priorizacion_inicial?.desvio_elegido ? [{ titulo: 'Priorización inicial', slug: 'priorizacion-inicial' }] : []),
        ...((prep?.criterio_exito?.por_metrica?.length || prep?.criterio_exito?.zona_fracaso) ? [{ titulo: 'Criterio de éxito', slug: 'criterio-de-exito' }] : []),
      ],
    }] : []),
    ...(datosFaltantes.length > 0
      ? [{ titulo: 'Datos por conseguir', slug: 'datos-por-conseguir', hijos: [] }]
      : []),
  ]

  return (
    <div className={`pe-vista-root ${serif.variable}`}>
      {/* Índice lateral fijo (hidden en print y en viewports angostos). */}
      <nav className="pe-vista-toc" aria-label="Índice del plan">
        <p className="toc-title">Índice</p>
        <ol>
          {indice.map(sec => (
            <li key={sec.slug}>
              <a href={`#${sec.slug}`}>{sec.titulo}</a>
              {sec.hijos.length > 0 && (
                <ul>
                  {sec.hijos.map(h => (
                    <li key={h.slug}><a href={`#${h.slug}`}>{h.titulo}</a></li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </nav>

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
            <h2 id="proposito">Propósito</h2>

            <h3 id="lugar-de-llegada">Lugar de llegada</h3>
            <Field text={proposito?.escena} placeholder="Aún no declarado." />

            <h3 id="metricas">Métricas {proposito?.metricas?.length ? `(${proposito.metricas.length})` : ''}</h3>
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

            <h3 id="lo-que-no-haremos">Lo que NO haremos {proposito?.fuera?.length ? `(${proposito.fuera.length})` : ''}</h3>
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
            ) : <p className="empty">Sin items declarados.</p>}

            <h3 id="horizonte">Horizonte</h3>
            <Field text={proposito?.horizonte} placeholder="No declarado." />

            <h3 id="estabilidad">Estabilidad</h3>
            <Field text={proposito?.estabilidad} placeholder="No declarada." />
          </section>

          {/* ─── Situación ───────────────────────────────────────────── */}
          <section>
            <h2 id="situacion">Situación</h2>

            <h3 id="desvio-principal">Desvío principal</h3>
            <Field text={situacion?.desvio_principal} placeholder="Aún no identificado." />
            {situacion?.desvio_cuantificado && (
              <>
                <h3 id="cuantificacion">Cuantificación</h3>
                <Field text={situacion.desvio_cuantificado} />
              </>
            )}

            <h3 id="desvios-secundarios">Desvíos secundarios {situacion?.desvios_secundarios?.length ? `(${situacion.desvios_secundarios.length})` : ''}</h3>
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

            <h3 id="causa-raiz">Causa raíz</h3>
            <Field text={situacion?.causa_raiz} placeholder="No identificada." />

            <h3 id="recursos-actuales">Recursos actuales</h3>
            <Field text={situacion?.recursos_actuales} placeholder="No declarados." />

            <h3 id="recursos-faltantes">Recursos faltantes</h3>
            <Field text={situacion?.recursos_faltantes} placeholder="No declarados." />

            <h3 id="intentos-previos">Intentos previos</h3>
            <Field text={situacion?.intentos_previos} placeholder="No declarados." />

            <h3 id="resistencias-y-amenazas">Resistencias y amenazas {situacion?.resistencias?.length ? `(${situacion.resistencias.length})` : ''}</h3>
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

            <h3 id="consecuencias-de-no-actuar">Consecuencias de no actuar</h3>
            {(situacion?.consecuencia_6m || situacion?.consecuencia_12m) ? (
              <>
                {situacion.consecuencia_6m && (
                  <div className="consecuencia-block">
                    <p className="consecuencia-horizonte">En 6 meses</p>
                    <Field text={situacion.consecuencia_6m} />
                  </div>
                )}
                {situacion.consecuencia_12m && (
                  <div className="consecuencia-block">
                    <p className="consecuencia-horizonte">En 12 meses</p>
                    <Field text={situacion.consecuencia_12m} />
                  </div>
                )}
              </>
            ) : <p className="empty">No declaradas.</p>}
          </section>

          {/* ─── Plan estratégico · Preparativos (3.0) ───────────────── */}
          {tienePreparativos && (
            <section>
              <h2 id="preparativos">Preparativos (3.0)</h2>

              {prep?.areas_afectadas?.length ? (
                <>
                  <h3 id="areas-afectadas">Áreas afectadas ({prep.areas_afectadas.length})</h3>
                  <ul>
                    {prep.areas_afectadas.map((a, i) => (
                      <li key={i}>
                        <span className="item-title">
                          {a.nombre}
                          <span className="item-meta">{a.responsable || '[vacancia]'}</span>
                        </span>
                        {a.notas && <span className="item-detail">{a.notas}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {prep?.supuestos_exogenos?.length ? (
                <>
                  <h3 id="supuestos-exogenos">Supuestos exógenos ({prep.supuestos_exogenos.length})</h3>
                  <ol>
                    {prep.supuestos_exogenos.map((s, i) => {
                      const calificado = !!(s.probabilidad && s.impacto_signo && s.impacto_magnitud && s.estrategia)
                      // El supuesto a menudo viene como "<afirmación>. Si se rompe: <consecuencia>".
                      // Solo el primer fragmento es el título; lo demás es contexto y va normal.
                      const splitMatch = s.descripcion.match(/^([\s\S]*?)(\s*Si\s+se\s+rompe[\s\S]*)$/i)
                      const titulo = splitMatch ? splitMatch[1].trim() : s.descripcion
                      const consecuencia = splitMatch ? splitMatch[2].trim() : ''
                      return (
                        <li key={i}>
                          <span className="item-title">
                            {titulo}
                            <span className="item-meta">{s.tipo}</span>
                          </span>
                          {consecuencia && (
                            <span className="item-detail">{consecuencia}</span>
                          )}
                          <span className="item-detail">
                            {calificado ? (
                              <>
                                Probabilidad {s.probabilidad} · Impacto {s.impacto_signo} ({s.impacto_magnitud}) · Estrategia {s.estrategia}
                              </>
                            ) : (
                              <em>Calificación pendiente</em>
                            )}
                          </span>
                          {s.razon && (
                            <span className="item-detail">
                              Razón: {s.razon}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </>
              ) : null}

              {prep?.priorizacion_inicial?.desvio_elegido && (
                <>
                  <h3 id="priorizacion-inicial">Priorización inicial</h3>
                  <p><span className="item-label">Desvío elegido</span>{prep.priorizacion_inicial.desvio_elegido}</p>
                  {prep.priorizacion_inicial.razon && (
                    <p><span className="item-label">Razón</span>{prep.priorizacion_inicial.razon}</p>
                  )}
                  {prep.priorizacion_inicial.desbloquea && (
                    <p><span className="item-label">Desbloquea</span>{prep.priorizacion_inicial.desbloquea}</p>
                  )}
                </>
              )}

              {(prep?.criterio_exito?.por_metrica?.length || prep?.criterio_exito?.zona_fracaso) && (
                <>
                  <h3 id="criterio-de-exito">Criterio de éxito</h3>
                  {prep?.criterio_exito?.por_metrica?.length ? (
                    <ol>
                      {prep.criterio_exito.por_metrica.map((m, i) => (
                        <li key={i}>
                          <span className="item-title">{m.metrica}</span>
                          {m.pleno && <span className="item-detail"><span className="item-label">Pleno</span>{m.pleno}</span>}
                          {m.minimo && <span className="item-detail"><span className="item-label">Mínimo</span>{m.minimo}</span>}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {prep?.criterio_exito?.zona_fracaso && (
                    <p><span className="item-label">Zona de fracaso</span>{prep.criterio_exito.zona_fracaso}</p>
                  )}
                </>
              )}
            </section>
          )}

          {/* ─── Datos por conseguir ─────────────────────────────────── */}
          {datosFaltantes.length > 0 && (
            <section>
              <h2 id="datos-por-conseguir">Datos por conseguir {`(${datosFaltantes.length})`}</h2>
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
    return (
      <div className="field-markdown">
        <ReactMarkdown
          components={{
            // ### dentro de un campo = subsección de contenido (NO usar <h3>, ya
            // está reservado para los labels de cada campo en la página).
            h3: ({ children }) => <h4 className="vista-subseccion">{children}</h4>,
            h4: ({ children }) => <h5 className="vista-subsubseccion">{children}</h5>,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    )
  }
  return <p className="empty">{placeholder ?? '—'}</p>
}
