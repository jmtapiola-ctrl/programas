// Orquestador de Pantalla 4 — resumen actualizado tras apply de auditoría.
//
// Renderiza:
//   - Toggle "Solo cambios | Plan completo" (default solo cambios).
//   - Vista de prestigio del paso, con campos modificados marcados visualmente.
//   - Footer con 3 botones: Aceptar y avanzar / Comentar / Re-auditar.
//
// Acciones:
//   - Aceptar: POST /cerrar-paso-final → snapshot inmutable + avanza paso →
//             redirige a /entrevista (Paso N+1 activo).
//   - Comentar: abre ComentarFeedbackModal con loop de hasta 3 iteraciones.
//   - Re-auditar: confirm dialog → POST /audit/start → navega a /cierre/[paso]
//                que hidrata directo a Pantalla 3 con el nuevo report.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanEstrategico } from '@/lib/types'
import { ComentarFeedbackModal } from './ComentarFeedbackModal'

interface Props {
  planId: string
  paso: number
  plan: PlanEstrategico
  fieldsModificados: string[]
  reAuditDisponible: boolean
  auditCountActual: number
}

type ToggleMode = 'solo_cambios' | 'plan_completo'

export function PantallaFinalClient(props: Props) {
  const router = useRouter()
  const [toggle, setToggle] = useState<ToggleMode>('solo_cambios')
  const [comentarOpen, setComentarOpen] = useState(false)
  const [aceptando, setAceptando] = useState(false)
  const [reAuditando, setReAuditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const modSet = new Set(props.fieldsModificados)

  async function handleAceptar() {
    if (aceptando) return
    setAceptando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${props.planId}/cerrar-paso-final`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: props.paso }),
      })
      if (!res.ok) {
        setError(`Error al cerrar el Paso: HTTP ${res.status} — ${await res.text()}`)
        setAceptando(false)
        return
      }
      router.push(`/planes-estrategicos/${props.planId}/entrevista`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setAceptando(false)
    }
  }

  async function handleReAuditar() {
    if (!props.reAuditDisponible || reAuditando) return
    const confirmed = window.confirm(
      `Re-auditar el Paso ${props.paso} va a:\n` +
      `  - Costar ~$1-2 USD adicionales (gpt-5.5).\n` +
      `  - Tardar ~3-5 minutos.\n` +
      `  - Pasar al revisor el reporte previo + tus decisiones para que identifique hallazgos NUEVOS (no repetir lo ya procesado).\n` +
      `  - Consumir 1 de los ${3 - props.auditCountActual} re-audit${(3 - props.auditCountActual) === 1 ? '' : 's'} restantes.\n\n` +
      `¿Confirmás?`,
    )
    if (!confirmed) return
    setReAuditando(true)
    // Navegamos a /cierre/[paso] — el AuditFlowClient detecta el estado y
    // dispara el SSE de /audit/start automáticamente desde ahí. Eso reusa
    // toda la infra de Pantalla 2 + 3 sin código duplicado.
    router.push(`/planes-estrategicos/${props.planId}/cierre/${props.paso}?reaudit=true`)
  }

  // Render: alterna entre solo_cambios (oculta secciones sin cambios) y plan_completo.
  // Una sección se considera "con cambios" si CUALQUIER subcampo (path) está en modSet.
  const seccionTieneCambios = (paths: string[]): boolean => paths.some(p => modSet.has(p))

  // Decide qué secciones mostrar según el toggle.
  const mostrarSeccion = (paths: string[]): boolean => {
    if (toggle === 'plan_completo') return true
    return seccionTieneCambios(paths)
  }

  return (
    <>
      {/* Toggle */}
      <div className="pe-vista" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <div className="font-sans" style={{ display: 'inline-flex', background: '#e8e8e2', borderRadius: 6, padding: 2 }}>
          <ToggleButton active={toggle === 'solo_cambios'} onClick={() => setToggle('solo_cambios')}>
            Solo cambios{modSet.size > 0 ? ` (${modSet.size})` : ''}
          </ToggleButton>
          <ToggleButton active={toggle === 'plan_completo'} onClick={() => setToggle('plan_completo')}>
            Plan completo
          </ToggleButton>
        </div>
      </div>

      {/* Render del paso (filtrado por toggle + indicadores visuales) */}
      <div className="pe-vista">
        {props.paso === 1 ? (
          <PropositoSection
            plan={props.plan}
            modSet={modSet}
            mostrarTodo={toggle === 'plan_completo'}
          />
        ) : (
          <SituacionSection
            plan={props.plan}
            modSet={modSet}
            mostrarTodo={toggle === 'plan_completo'}
          />
        )}

        {modSet.has('datos_faltantes') && (props.plan.datos_faltantes?.length ?? 0) > 0 && mostrarSeccion(['datos_faltantes']) && (
          <section data-modificado="true" style={diffStyle}>
            <h2>Datos por conseguir <ModBadge /></h2>
            <ul>
              {props.plan.datos_faltantes.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </section>
        )}

        {/* Si toggle es solo_cambios y NO hay nada modificado, mostrar mensaje. */}
        {toggle === 'solo_cambios' && modSet.size === 0 && (
          <div className="font-sans" style={{ textAlign: 'center', padding: '3rem 1rem', color: '#888' }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              Ningún campo del Paso fue modificado por la auditoría.
            </p>
            <button
              onClick={() => setToggle('plan_completo')}
              style={{ marginTop: 12, fontSize: 13, color: '#444', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Ver plan completo →
            </button>
          </div>
        )}
      </div>

      {/* Footer client con 3 botones */}
      <div className="font-sans" style={{ marginTop: '3rem', borderTop: '1px solid #d4d4cf', paddingTop: '2rem' }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={() => setComentarOpen(true)}
            disabled={aceptando || reAuditando}
            style={btnSecondaryStyle}
          >
            Comentar
          </button>
          <button
            onClick={handleReAuditar}
            disabled={!props.reAuditDisponible || aceptando || reAuditando}
            style={props.reAuditDisponible ? btnSecondaryStyle : btnDisabledStyle}
            title={!props.reAuditDisponible ? 'Ya alcanzaste el máximo de 3 auditorías para este Paso' : ''}
          >
            {reAuditando ? 'Re-auditando…' : `Re-auditar (${3 - props.auditCountActual} restantes)`}
          </button>
          <button
            onClick={handleAceptar}
            disabled={aceptando || reAuditando}
            style={btnPrimaryStyle}
          >
            {aceptando ? 'Cerrando…' : `Aceptar y avanzar al Paso ${props.paso + 1}`}
          </button>
        </div>
      </div>

      {comentarOpen && (
        <ComentarFeedbackModal
          planId={props.planId}
          paso={props.paso}
          onClose={() => setComentarOpen(false)}
          onApplied={() => {
            setComentarOpen(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

// ─── Sub-componentes de render con indicadores de diff ───────────────────────

const diffStyle: React.CSSProperties = {
  borderLeft: '3px solid #16a34a',
  paddingLeft: '1rem',
  marginLeft: '-1rem',
  background: 'linear-gradient(90deg, rgba(22, 163, 74, 0.04) 0%, transparent 80px)',
}

function ModBadge() {
  return (
    <span
      title="Modificado por auditoría"
      className="font-sans"
      style={{
        marginLeft: 8,
        display: 'inline-block',
        verticalAlign: 'middle',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#15803d',
        background: '#dcfce7',
        border: '1px solid #86efac',
        borderRadius: 4,
        padding: '2px 6px',
        fontWeight: 600,
      }}
    >
      modificado
    </span>
  )
}

function PropositoSection({ plan, modSet, mostrarTodo }: { plan: PlanEstrategico; modSet: Set<string>; mostrarTodo: boolean }) {
  const proposito = plan.proposito
  const muestra = (path: string): boolean => mostrarTodo || modSet.has(path)
  const seccionMod = ['proposito.escena', 'proposito.metricas', 'proposito.fuera', 'proposito.horizonte', 'proposito.estabilidad'].some(p => modSet.has(p))

  if (!mostrarTodo && !seccionMod) return null

  return (
    <section style={seccionMod ? diffStyle : undefined} data-modificado={seccionMod}>
      <h2>Propósito {seccionMod && <ModBadge />}</h2>

      {muestra('proposito.escena') && (
        <>
          <h3>Lugar de llegada {modSet.has('proposito.escena') && <ModBadge />}</h3>
          <Field text={proposito?.escena} placeholder="Aún no declarado." />
        </>
      )}

      {muestra('proposito.metricas') && (
        <>
          <h3>Métricas {proposito?.metricas?.length ? `(${proposito.metricas.length})` : ''} {modSet.has('proposito.metricas') && <ModBadge />}</h3>
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
          ) : <p className="empty">Sin métricas.</p>}
        </>
      )}

      {muestra('proposito.fuera') && (
        <>
          <h3>Fuera de scope {proposito?.fuera?.length ? `(${proposito.fuera.length})` : ''} {modSet.has('proposito.fuera') && <ModBadge />}</h3>
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
          ) : <p className="empty">Sin items fuera de scope.</p>}
        </>
      )}

      {muestra('proposito.horizonte') && (
        <>
          <h3>Horizonte {modSet.has('proposito.horizonte') && <ModBadge />}</h3>
          <Field text={proposito?.horizonte} placeholder="No declarado." />
        </>
      )}

      {muestra('proposito.estabilidad') && (
        <>
          <h3>Estabilidad {modSet.has('proposito.estabilidad') && <ModBadge />}</h3>
          <Field text={proposito?.estabilidad} placeholder="No declarada." />
        </>
      )}
    </section>
  )
}

function SituacionSection({ plan, modSet, mostrarTodo }: { plan: PlanEstrategico; modSet: Set<string>; mostrarTodo: boolean }) {
  const situacion = plan.situacion
  const muestra = (path: string): boolean => mostrarTodo || modSet.has(path)
  const seccionMod = [
    'situacion.desvio_principal', 'situacion.desvio_cuantificado',
    'situacion.desvios_secundarios', 'situacion.causa_raiz',
    'situacion.consecuencia_6m', 'situacion.consecuencia_12m',
    'situacion.recursos_actuales', 'situacion.recursos_faltantes',
    'situacion.intentos_previos', 'situacion.resistencias',
  ].some(p => modSet.has(p))

  if (!mostrarTodo && !seccionMod) return null

  return (
    <section style={seccionMod ? diffStyle : undefined} data-modificado={seccionMod}>
      <h2>Situación {seccionMod && <ModBadge />}</h2>

      {muestra('situacion.desvio_principal') && (
        <>
          <h3>Desvío principal {modSet.has('situacion.desvio_principal') && <ModBadge />}</h3>
          <Field text={situacion?.desvio_principal} placeholder="No identificado." />
        </>
      )}
      {muestra('situacion.desvio_cuantificado') && situacion?.desvio_cuantificado && (
        <>
          <h3>Cuantificación {modSet.has('situacion.desvio_cuantificado') && <ModBadge />}</h3>
          <Field text={situacion.desvio_cuantificado} />
        </>
      )}
      {muestra('situacion.desvios_secundarios') && (
        <>
          <h3>Desvíos secundarios {situacion?.desvios_secundarios?.length ? `(${situacion.desvios_secundarios.length})` : ''} {modSet.has('situacion.desvios_secundarios') && <ModBadge />}</h3>
          {situacion?.desvios_secundarios?.length ? (
            <ol>
              {situacion.desvios_secundarios.map((d: any, i: number) => (
                <li key={i}>{typeof d === 'string' ? d : (<><span className="item-title">{d.descripcion}</span>{d.datos && <span className="item-detail">{d.datos}</span>}</>)}</li>
              ))}
            </ol>
          ) : <p className="empty">Sin desvíos secundarios.</p>}
        </>
      )}
      {muestra('situacion.causa_raiz') && (
        <>
          <h3>Causa raíz {modSet.has('situacion.causa_raiz') && <ModBadge />}</h3>
          <Field text={situacion?.causa_raiz} placeholder="No identificada." />
        </>
      )}
      {muestra('situacion.recursos_actuales') && (
        <>
          <h3>Recursos actuales {modSet.has('situacion.recursos_actuales') && <ModBadge />}</h3>
          <Field text={situacion?.recursos_actuales} placeholder="No declarados." />
        </>
      )}
      {muestra('situacion.recursos_faltantes') && (
        <>
          <h3>Recursos faltantes {modSet.has('situacion.recursos_faltantes') && <ModBadge />}</h3>
          <Field text={situacion?.recursos_faltantes} placeholder="No declarados." />
        </>
      )}
      {muestra('situacion.intentos_previos') && (
        <>
          <h3>Intentos previos {modSet.has('situacion.intentos_previos') && <ModBadge />}</h3>
          <Field text={situacion?.intentos_previos} placeholder="No declarados." />
        </>
      )}
      {muestra('situacion.resistencias') && (
        <>
          <h3>Resistencias y amenazas {situacion?.resistencias?.length ? `(${situacion.resistencias.length})` : ''} {modSet.has('situacion.resistencias') && <ModBadge />}</h3>
          {situacion?.resistencias?.length ? (
            <ol>
              {situacion.resistencias.map((r: any, i: number) => (
                <li key={i}>{typeof r === 'string' ? r : (
                  <>
                    <span className="item-title">{r.actor}{(r.tipo || r.criticidad) && (<span className="item-meta">{[r.tipo, r.criticidad && `criticidad ${r.criticidad}`].filter(Boolean).join(' · ')}</span>)}</span>
                    {r.descripcion && <span className="item-detail">{r.descripcion}</span>}
                    {r.mitigacion && <span className="item-detail"><span className="item-label">Mitigación</span>{r.mitigacion}</span>}
                  </>
                )}</li>
              ))}
            </ol>
          ) : <p className="empty">Sin resistencias declaradas.</p>}
        </>
      )}
      {(muestra('situacion.consecuencia_6m') || muestra('situacion.consecuencia_12m')) && (
        <>
          <h3>Consecuencias de no actuar {(modSet.has('situacion.consecuencia_6m') || modSet.has('situacion.consecuencia_12m')) && <ModBadge />}</h3>
          {situacion?.consecuencia_6m && <p><span className="item-label">En 6 meses</span>{situacion.consecuencia_6m}</p>}
          {situacion?.consecuencia_12m && <p><span className="item-label">En 12 meses</span>{situacion.consecuencia_12m}</p>}
        </>
      )}
    </section>
  )
}

function Field({ text, placeholder }: { text?: string; placeholder?: string }) {
  if (text && text.trim()) return <p>{text}</p>
  return <p className="empty">{placeholder ?? '—'}</p>
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 4,
        border: 'none',
        background: active ? '#fff' : 'transparent',
        color: active ? '#1a1a1a' : '#5c5c5c',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : undefined,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const btnPrimaryStyle: React.CSSProperties = {
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondaryStyle: React.CSSProperties = {
  background: '#fff',
  color: '#1a1a1a',
  border: '1px solid #d4d4cf',
  borderRadius: 6,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}

const btnDisabledStyle: React.CSSProperties = {
  ...btnSecondaryStyle,
  background: '#f5f5f0',
  color: '#a3a3a0',
  cursor: 'not-allowed',
}
