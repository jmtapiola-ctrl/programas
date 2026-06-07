// Orquestador client del flow de auditoría.
//
// Vive dentro del server component `page.tsx` de Pantalla 1. Maneja:
//   - Estado del flow: 'idle' (Pantalla 1) → 'auditando' (Pantalla 2 modal) →
//                      'reporte' (Pantalla 3 modal) → 'procesando' (handoff a Fase 4)
//   - Disparo del audit/start (con o sin skip) y del cerrar-paso si hace falta.
//   - Hidratación tras abandono: si la entrevista ya tiene un turno reviewer
//     completado para este paso (sub_estado_paso === 'auditoria_completa'),
//     abrir directamente Pantalla 3 con el report cargado.

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ReviewerReport, DecisionUsuario, SubEstadoPaso } from '@/lib/types'
import { useAuditSSE } from './hooks/useAuditSSE'
import { AuditoriaEnProcesoModal } from './AuditoriaEnProcesoModal'
import { ReporteHallazgosModal } from './ReporteHallazgosModal'
import { AplicandoCambiosModal } from './AplicandoCambiosModal'

type FlowState = 'idle' | 'auditando' | 'reporte' | 'procesando'

interface Props {
  planId: string
  paso: number
  subEstadoActual: SubEstadoPaso
  // Si la audit ya completó (recovery tras abandono), estos vienen populados:
  reviewerTurnoIdInicial?: string
  reportInicial?: ReviewerReport
  decisionesIniciales?: DecisionUsuario[]
  // true cuando el reviewer turn se persistió con read_only (audit retroactivo
  // / educativo). UI termina en Pantalla 3 con botón "Cerrar" en lugar de
  // "Procesar todos los cambios y avanzar".
  readOnlyInicial?: boolean
  autoCorregido?: boolean
  // Glosario id→nombre de los movimientos del plan, para expandir los códigos
  // (M-9 → "M-9 (Nombre)") que el reviewer cita en sus hallazgos.
  movNombres?: Record<string, string>
}

export function AuditFlowClient(props: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const audit = useAuditSSE(props.planId)

  // Flow inicial: si ya hay report (recovery), arranco en 'reporte'. Sino 'idle'.
  const [flow, setFlow] = useState<FlowState>(
    props.reportInicial ? 'reporte' : 'idle',
  )
  const [reportActual, setReportActual] = useState<ReviewerReport | null>(props.reportInicial ?? null)
  const [reviewerTurnoIdActual, setReviewerTurnoIdActual] = useState<string | null>(props.reviewerTurnoIdInicial ?? null)
  const [skipping, setSkipping] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [aplicandoError, setAplicandoError] = useState<string | null>(null)
  const [autoCorregidoAviso, setAutoCorregidoAviso] = useState(props.autoCorregido === true)

  // Si llegamos con ?reaudit=true desde Pantalla 4, disparar audit/start automáticamente.
  // Esto soporta el botón "Re-auditar" de PantallaFinalClient: navega acá y nosotros
  // arrancamos solo. La transición de estado (esperando_aprobacion_final →
  // auditoria_en_proceso) la maneja /audit/start internamente.
  useEffect(() => {
    if (searchParams.get('reaudit') === 'true' && flow === 'idle' && !audit.status.startsWith('error')) {
      // Ejecuta una vez al montar.
      setFlow('auditando')
      void audit.start({ paso: props.paso, skip: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Logging del auto-corregido al montar (recordatorio de Fase 3 del user).
  if (typeof window !== 'undefined' && props.autoCorregido) {
    console.log('[audit] auto_corregido=true en GET status — la auditoría se recuperó de un error temporal.')
  }

  // ── Handlers ──

  async function handleAuditar() {
    setFlow('auditando')
    await audit.start({ paso: props.paso, skip: false })
  }

  async function handleSaltar() {
    if (skipping) return
    setSkipping(true)
    await audit.start({ paso: props.paso, skip: true, reason: 'user_choice' })
    // Cuando el SSE devuelve 'skipped', redirigimos a la conversación con el
    // siguiente paso ya activo (el endpoint avanzó paso_actual y reseteó sub_estado).
    router.push(`/planes-estrategicos/${props.planId}/entrevista`)
  }

  async function handleSkipEmergency() {
    audit.reset()
    await audit.start({ paso: props.paso, skip: true, reason: 'api_failure' })
    router.push(`/planes-estrategicos/${props.planId}/entrevista`)
  }

  async function handleRetry() {
    audit.reset()
    await audit.start({ paso: props.paso, skip: false })
  }

  function handleSuccessTransition() {
    // SSE devolvió 'result' → transición de Pantalla 2 a Pantalla 3.
    if (audit.report && audit.reviewerTurnoId) {
      setReportActual(audit.report)
      setReviewerTurnoIdActual(audit.reviewerTurnoId)
      setFlow('reporte')
    }
  }

  async function handleProcesarTodos(decisiones: import('@/lib/types').DecisionUsuario[]) {
    if (aplicando || !reviewerTurnoIdActual) return
    setAplicando(true)
    setAplicandoError(null)
    setFlow('procesando')

    try {
      const res = await fetch(
        `/api/planes-estrategicos/${props.planId}/audit/${reviewerTurnoIdActual}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decisiones }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        setAplicandoError(data?.error ?? `HTTP ${res.status}`)
        setFlow('reporte')  // volver a Pantalla 3 para reintentar
        setAplicando(false)
        return
      }
      // Éxito: navegar a Pantalla 4.
      router.push(data.redirect ?? `/planes-estrategicos/${props.planId}/cierre/${props.paso}/final`)
    } catch (e) {
      setAplicandoError(e instanceof Error ? e.message : String(e))
      setFlow('reporte')
      setAplicando(false)
    }
  }

  // ── Render ──

  const yaCompletado = props.subEstadoActual === 'completo' || props.subEstadoActual === 'aplicando_cambios' || props.subEstadoActual === 'esperando_aprobacion_final'

  return (
    <>
      {/* Aviso sutil de auto-corregido (recordatorio del user). */}
      {autoCorregidoAviso && (
        <div className="bg-yellow-900/30 border border-yellow-800/40 rounded px-4 py-2 mb-4 text-[12px] text-yellow-200 flex items-center justify-between gap-3">
          <span>Auditoría completada (recuperada de error temporal del sistema).</span>
          <button onClick={() => setAutoCorregidoAviso(false)} className="text-yellow-400 hover:text-yellow-200">×</button>
        </div>
      )}

      {/* Banner de error del apply (Fase 4) — visible si /apply falló y volvimos a Pantalla 3. */}
      {aplicandoError && (
        <div className="bg-red-900/30 border border-red-700 rounded px-4 py-2 mb-4 text-[12px] text-red-100 flex items-center justify-between gap-3">
          <span>Error al aplicar las decisiones: {aplicandoError}</span>
          <button onClick={() => setAplicandoError(null)} className="text-red-300 hover:text-red-100">×</button>
        </div>
      )}

      {/* Footer de Pantalla 1: 2 botones, solo visibles si todavía no auditamos. */}
      {flow === 'idle' && !yaCompletado && (
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <button
            onClick={handleAuditar}
            disabled={skipping}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded shadow transition-colors"
          >
            Auditar bloque con revisor independiente
          </button>
          <button
            onClick={handleSaltar}
            disabled={skipping}
            className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-200 py-3 px-6 rounded transition-colors text-sm"
          >
            {skipping ? 'Saltando...' : 'Saltar auditoría y avanzar'}
          </button>
        </div>
      )}

      {/* Si el paso ya está completo, mostramos un mensaje informativo. */}
      {flow === 'idle' && yaCompletado && (
        <div className="text-center mt-8">
          <p className="text-sm text-gray-400">
            Este Paso ya está cerrado. Volvé a la conversación o avanzá al Paso siguiente.
          </p>
        </div>
      )}

      {/* Pantalla 2: modal de auditoría en proceso */}
      {flow === 'auditando' && (
        <AuditoriaEnProcesoModal
          audit={audit}
          paso={props.paso}
          onSuccess={handleSuccessTransition}
          onSkipEmergency={handleSkipEmergency}
          onRetry={handleRetry}
        />
      )}

      {/* Pantalla 3: modal de reporte de hallazgos */}
      {flow === 'reporte' && reportActual && reviewerTurnoIdActual && (
        <ReporteHallazgosModal
          planId={props.planId}
          reviewerTurnoId={reviewerTurnoIdActual}
          report={reportActual}
          decisionesIniciales={props.decisionesIniciales}
          paso={props.paso}
          readOnly={props.readOnlyInicial === true}
          movNombres={props.movNombres}
          onProcesarTodos={handleProcesarTodos}
          onCerrarReadOnly={() => router.push(`/planes-estrategicos/${props.planId}/entrevista`)}
        />
      )}

      {/* Overlay mientras corre /apply (puede tardar minutos — Opus reescribe el
          plan curado). Sin esto, 'procesando' no renderizaba nada y la pantalla
          quedaba en blanco. */}
      {flow === 'procesando' && <AplicandoCambiosModal paso={props.paso} />}
    </>
  )
}
