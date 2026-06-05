import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Source_Serif_4 } from 'next/font/google'
import ReactMarkdown from 'react-markdown'
import {
  getPlanEstrategico,
  getEntrevistaPE,
  getUsuario,
} from '@/lib/airtable'
import { getCuradoActivo } from '@/lib/types'
import type { MovimientoPE } from '@/lib/types'
import { GlosarioVista } from '@/components/planes-estrategicos/GlosarioVista'
import { DAGSecuenciacionReadOnly } from '@/components/planes-estrategicos/DAGSecuenciacionReadOnly'
import { FasesCanvasReadOnly } from '@/components/planes-estrategicos/FasesCanvasReadOnly'
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
  const inventario = plan.plan?.inventario
  // Curado activo (versión seleccionada del versionado). Si el usuario está
  // iterando con "Pedir ajuste narrativo", esto refleja la última versión.
  const curado = getCuradoActivo(plan)

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
  const tieneCurado = !!curado
  const tieneInventarioActivo = !!(inventario?.movimientos?.some(m => m.estado_usuario !== 'quitado'))

  // Vacancias agrupadas por puesto (mov.dueno). Reusa la misma lógica que
  // CuradoVista para que el ejecutivo vea cada vacancia una sola vez con
  // todos sus movs adentro, ordenadas por impacto (desbloqueos totales) desc.
  const vacanciasAgrupadas = curado ? agruparVacancias(curado.secuencia_movimientos) : []

  // Índice linkeable — secciones (h2) con sus campos (h3). Solo se incluyen
  // los campos que efectivamente existen en el documento.
  const indice: { titulo: string; slug: string; hijos: { titulo: string; slug: string }[] }[] = [
    { titulo: 'Glosario del plan', slug: 'glosario', hijos: [] },
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
    ...(tieneCurado ? [{
      titulo: 'Plan curado (3.E)', slug: 'plan-curado',
      hijos: [
        { titulo: 'Contexto', slug: 'curado-contexto' },
        { titulo: 'Decisiones de priorización', slug: 'curado-decisiones' },
        { titulo: 'Secuencia de movimientos', slug: 'curado-secuencia' },
        ...(vacanciasAgrupadas.length > 0 ? [{ titulo: 'Vacancias críticas', slug: 'curado-vacancias' }] : []),
        { titulo: 'Supuestos críticos', slug: 'curado-supuestos' },
        { titulo: 'Criterio de éxito final', slug: 'curado-criterio' },
        { titulo: 'Alternativas descartadas', slug: 'curado-alternativas' },
      ],
    }] : []),
    ...(tieneInventarioActivo ? [{
      titulo: 'Cronograma', slug: 'cronograma', hijos: [],
    }] : []),
    ...(tieneInventarioActivo ? [{
      titulo: 'Mapa de dependencias', slug: 'mapa-dependencias', hijos: [],
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
          {/* ─── Glosario ────────────────────────────────────────────── */}
          {/* Va arriba de todo para que el ejecutivo lo tenga de referencia
              mientras lee el resto del plan. Las siglas P-N, V-N, M-N,
              componente A/B, FS/FF/continuo, etc. se aclaran acá. */}
          <GlosarioVista />

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

          {/* ─── Plan curado (3.E) ───────────────────────────────────── */}
          {curado && (
            <section>
              <h2 id="plan-curado">Plan curado (3.E)</h2>

              <h3 id="curado-contexto">Contexto</h3>
              <Field text={curado.contexto} placeholder="No declarado todavía." />

              <h3 id="curado-decisiones">
                Decisiones de priorización {curado.decisiones_priorizacion.length ? `(${curado.decisiones_priorizacion.length})` : ''}
              </h3>
              {curado.decisiones_priorizacion.length > 0 ? (
                <ol>
                  {curado.decisiones_priorizacion.map((d, i) => (
                    <li key={i}>
                      <span className="item-title">{d.decision}</span>
                      {d.razon && <span className="item-detail">{d.razon}</span>}
                    </li>
                  ))}
                </ol>
              ) : <p className="empty">Sin decisiones declaradas.</p>}

              <h3 id="curado-secuencia">
                Secuencia de movimientos {curado.secuencia_movimientos.length ? `(${curado.secuencia_movimientos.length} fases)` : ''}
              </h3>
              {curado.secuencia_movimientos.length > 0 ? (
                <div className="pe-vista-fases">
                  {curado.secuencia_movimientos.map((f, i) => (
                    <div key={i} className="pe-vista-fase">
                      <p className="pe-vista-fase-titulo">
                        <span className="pe-vista-fase-numero">F{i + 1}</span>
                        {f.fase}
                        <span className="pe-vista-fase-count">· {f.movimientos.length} mov.</span>
                      </p>
                      {f.razon_secuencia && (
                        <p className="pe-vista-fase-razon">{f.razon_secuencia}</p>
                      )}
                      <ul className="pe-vista-fase-movs">
                        {f.movimientos.map(m => (
                          <li key={m.id} className="pe-vista-mov">
                            <p className="pe-vista-mov-header">
                              <span className="pe-vista-mov-id">{m.id}</span>
                              <span className="pe-vista-mov-nombre">{m.nombre}</span>
                            </p>
                            {m.que_resuelve && (
                              <p className="pe-vista-mov-resuelve">{m.que_resuelve}</p>
                            )}
                            <p className="pe-vista-mov-dueno">
                              Dueño: {m.dueno}
                              {esMovVacante(m) && (
                                <span className="pe-vista-mov-vacante">
                                  Vacante{m.dueno_semanas_cobertura ? ` · ${m.dueno_semanas_cobertura} sem` : ''}
                                </span>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : <p className="empty">Sin fases declaradas.</p>}

              {vacanciasAgrupadas.length > 0 && (
                <>
                  <h3 id="curado-vacancias">
                    Vacancias críticas ({vacanciasAgrupadas.length} puesto{vacanciasAgrupadas.length === 1 ? '' : 's'})
                  </h3>
                  <p className="pe-vista-glosario-intro" style={{ marginTop: 0 }}>
                    Puestos a cubrir agrupados — un mismo puesto puede ser responsable de varios movs. Priorizá la búsqueda por desbloqueos totales (impacto si la posición queda vacante).
                  </p>
                  <ul className="pe-vista-vacancias">
                    {vacanciasAgrupadas.map((g, i) => (
                      <li key={i}>
                        <p className="pe-vista-vacancia-titulo">{g.dueno}</p>
                        <p className="pe-vista-vacancia-meta">
                          cubre {g.movs.length} mov{g.movs.length === 1 ? '' : 's'}
                          {g.semanasCobertura !== undefined && ` · cobertura ${g.semanasCobertura} sem`}
                          {' · '}desbloqueos totales {g.totalDesbloqueos}
                        </p>
                        <ul className="pe-vista-vacancia-movs">
                          {g.movs.map(({ mov, fase }) => (
                            <li key={mov.id}>
                              <span className="pe-vista-mov-id">{mov.id}</span>{' '}
                              {mov.nombre} <span className="pe-vista-mov-fase">({fase} · desbloquea {(mov.desbloquea ?? []).length})</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3 id="curado-supuestos">
                Supuestos críticos {curado.supuestos_criticos.length ? `(${curado.supuestos_criticos.length})` : ''}
              </h3>
              {curado.supuestos_criticos.length > 0 ? (
                <ol>
                  {curado.supuestos_criticos.map((s, i) => (
                    <li key={i}>
                      <span className="item-title">
                        {s.descripcion}
                        {s.tipo && <span className="item-meta">{s.tipo}</span>}
                      </span>
                      <span className="item-detail">
                        Probabilidad {s.probabilidad} · Impacto {s.impacto_signo} ({s.impacto_magnitud}) · Estrategia {s.estrategia}
                      </span>
                      {s.razon && (
                        <span className="item-detail">Razón: {s.razon}</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : <p className="empty">Sin supuestos críticos declarados.</p>}

              <h3 id="curado-criterio">Criterio de éxito final</h3>
              <div className="pe-vista-criterio">
                {curado.criterio_exito.pleno && (
                  <div className="pe-vista-criterio-row">
                    <span className="item-label">Pleno</span>
                    <p>{curado.criterio_exito.pleno}</p>
                  </div>
                )}
                {curado.criterio_exito.minimo && (
                  <div className="pe-vista-criterio-row">
                    <span className="item-label">Mínimo aceptable</span>
                    <p>{curado.criterio_exito.minimo}</p>
                  </div>
                )}
                {curado.criterio_exito.path_minimo && (
                  <div className="pe-vista-criterio-row">
                    <span className="item-label">Path mínimo</span>
                    <p>{curado.criterio_exito.path_minimo}</p>
                  </div>
                )}
              </div>

              <h3 id="curado-alternativas">
                Alternativas descartadas {curado.alternativas_descartadas.length ? `(${curado.alternativas_descartadas.length})` : ''}
              </h3>
              {curado.alternativas_descartadas.length > 0 ? (
                <ul>
                  {curado.alternativas_descartadas.map((a, i) => (
                    <li key={i}>
                      <span className="item-title">{a.decision}</span>
                      {a.razon && <span className="item-detail">{a.razon}</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="empty">Sin alternativas descartadas declaradas.</p>}
            </section>
          )}

          {/* ─── Cronograma ──────────────────────────────────────────── */}
          {/* Gantt-style read-only del cronograma derivado del CPM: lanes
              horizontales = dueño, lanes verticales = cuatrimestres. La barra
              de cada mov es proporcional a su duración. Útil para que el
              ejecutivo vea quién se compromete a qué y en qué ventana. */}
          {tieneInventarioActivo && inventario && (
            <section className="pe-vista-dag-section">
              <h2 id="cronograma">Cronograma</h2>
              <p className="pe-vista-dag-intro">
                Cronograma derivado del CPM (camino crítico) sobre el inventario activo. Cada barra es un movimiento; el ancho corresponde a su duración. Lanes horizontales agrupan por dueño, lanes verticales por cuatrimestre. Tiempo fluye de izquierda a derecha.
              </p>
              <p className="pe-vista-dag-hint">
                <strong>Cómo navegarlo</strong>: usá <strong>scroll del mouse</strong> sobre el gráfico para zoomar, <strong>click + arrastrar</strong> en el fondo para moverte. Click sobre un mov resalta sus conexiones con otros.
              </p>
              <FasesCanvasReadOnly inventario={inventario} height="800px" />
            </section>
          )}

          {/* ─── Mapa de dependencias ────────────────────────────────── */}
          {/* DAG read-only de los movs activos del inventario. Útil cuando
              el ejecutivo quiere ver el ordenamiento causal completo más allá
              del agrupamiento por fases del curado. */}
          {tieneInventarioActivo && inventario && (
            <section className="pe-vista-dag-section">
              <h2 id="mapa-dependencias">Mapa de dependencias</h2>
              <p className="pe-vista-dag-intro">
                Visualización completa del grafo de precondiciones del inventario activo. Cada nodo es un movimiento; las flechas indican qué movimiento debe terminar (o avanzar) antes de que el siguiente arranque. Tipos de flecha: FS (finish-to-start), FF (finish-to-finish), continuo (con lag).
              </p>
              <p className="pe-vista-dag-hint">
                <strong>Cómo navegarlo</strong>: el zoom inicial muestra todos los movs y el texto puede leerse chico. Usá <strong>scroll del mouse</strong> sobre el gráfico para zoomar in/out, <strong>click + arrastrar</strong> en el fondo para moverte por el canvas. Click sobre un nodo para resaltar sus conexiones.
              </p>
              <DAGSecuenciacionReadOnly inventario={inventario} height="900px" />
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

// Helpers para la sección del curado. Coherentes con CuradoVista.tsx.

function esMovVacante(m: MovimientoPE): boolean {
  if (m.dueno_es_vacante === true) return true
  const d = (m.dueno ?? '').toLowerCase()
  return /vacanc|vacante/.test(d)
}

// Agrupa vacancias por puesto (mov.dueno). Mismo shape que CuradoVista para
// que la lectura sea consistente entre wizard y vista de prestigio.
function agruparVacancias(secuencia: { fase: string; movimientos: MovimientoPE[] }[]): {
  dueno: string
  semanasCobertura: number | undefined
  movs: { mov: MovimientoPE; fase: string }[]
  totalDesbloqueos: number
}[] {
  const porPuesto = new Map<string, {
    dueno: string
    semanasCobertura: number | undefined
    movs: { mov: MovimientoPE; fase: string }[]
    totalDesbloqueos: number
  }>()
  for (const f of secuencia) {
    for (const m of f.movimientos) {
      if (!esMovVacante(m)) continue
      const key = (m.dueno ?? '').trim()
      const desbl = m.desbloquea?.length ?? 0
      const existing = porPuesto.get(key)
      if (existing) {
        existing.movs.push({ mov: m, fase: f.fase })
        existing.totalDesbloqueos += desbl
        if (existing.semanasCobertura === undefined && m.dueno_semanas_cobertura !== undefined) {
          existing.semanasCobertura = m.dueno_semanas_cobertura
        }
      } else {
        porPuesto.set(key, {
          dueno: key,
          semanasCobertura: m.dueno_semanas_cobertura,
          movs: [{ mov: m, fase: f.fase }],
          totalDesbloqueos: desbl,
        })
      }
    }
  }
  return Array.from(porPuesto.values()).sort((a, b) => b.totalDesbloqueos - a.totalDesbloqueos)
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
