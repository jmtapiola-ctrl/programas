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

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReviewerReport, DecisionUsuario, SubEstadoPaso } from '@/lib/types'
import { useAuditSSE } from './hooks/useAuditSSE'
import { AuditoriaEnProcesoModal } from './AuditoriaEnProcesoModal'
import { ReporteHallazgosModal } from './ReporteHallazgosModal'

type FlowState = 'idle' | 'auditando' | 'reporte' | 'procesando'

interface Props {
  planId: string
  paso: number
  subEstadoActual: SubEstadoPaso
  // Si la audit ya completó (recovery tras abandono), estos vienen populados:
  reviewerTurnoIdInicial?: string
  reportInicial?: ReviewerReport
  decisionesIniciales?: DecisionUsuario[]
  autoCorregido?: boolean
}

export function AuditFlowClient(props: Props) {
  const router = useRouter()
  const audit = useAuditSSE(props.planId)

  // Flow inicial: si ya hay report (recovery), arranco en 'reporte'. Sino 'idle'.
  const [flow, setFlow] = useState<FlowState>(
    props.reportInicial ? 'reporte' : 'idle',
  )
  const [reportActual, setReportActual] = useState<ReviewerReport | null>(props.reportInicial ?? null)
  const [reviewerTurnoIdActual, setReviewerTurnoIdActual] = useState<string | null>(props.reviewerTurnoIdInicial ?? null)
  const [skipping, setSkipping] = useState(false)
  const [autoCorregidoAviso, setAutoCorregidoAviso] = useState(props.autoCorregido === true)

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

  function handleProcesarTodos() {
    // En Fase 3 esto es solo un signal — Fase 4 implementa el endpoint /apply
    // que va a procesar los cambios y avanzar a Pantalla 4.
    setFlow('procesando')
    // Por ahora navego de vuelta a la conversación con un alert.
    alert('Fase 4 todavía no implementada. Las decisiones quedaron persistidas.\nPróximo paso: Pantalla 4 con resumen actualizado + diff.')
    router.push(`/planes-estrategicos/${props.planId}/entrevista`)
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
          onProcesarTodos={handleProcesarTodos}
        />
      )}
    </>
  )
}
