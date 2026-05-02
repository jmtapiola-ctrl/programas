// Hook para Pantalla 3 — manejo de decisiones del usuario sobre los hallazgos
// del reporte. Estado local + persistencia en tiempo real al backend.
//
// Patrón: cada vez que cambia una decisión, dispara un PATCH al backend con
// el ARRAY COMPLETO. El backend solo overwrite. Si el PATCH falla (network),
// el estado local NO se destruye — el user puede seguir trabajando y los
// cambios se sincronizan en próximas decisiones.
//
// Hidratación: si el GET status ya devolvió decisiones (recovery tras abandono),
// se inicializa el estado con esas. El user ve sus decisiones previas.

'use client'

import { useCallback, useState } from 'react'
import type { DecisionUsuario, ReviewerReport } from '@/lib/types'

export interface DecisionLocal {
  hallazgo_id: string
  tipo: 'error' | 'pregunta' | 'cross_block'
  estado: 'pending' | 'aprobado' | 'aprobado_con_cambios' | 'respondido' | 'ignorado'
  texto_editado?: string       // si aprobado_con_cambios
  respuesta_usuario?: string   // si respondido
}

export interface UseAuditDecisionesParams {
  planId: string
  reviewerTurnoId: string
  report: ReviewerReport
  decisionesIniciales?: DecisionUsuario[]  // hidratación tras abandono
}

export interface UseAuditDecisionesHook {
  decisiones: Record<string, DecisionLocal>  // keyed by hallazgo_id
  pendingCount: number
  totalCount: number
  syncStatus: 'idle' | 'saving' | 'saved' | 'error'
  syncError: string | null
  setDecision: (hallazgoId: string, update: Partial<DecisionLocal>) => void
  reset: () => void
}

export function useAuditDecisiones(params: UseAuditDecisionesParams): UseAuditDecisionesHook {
  const allHallazgos: Array<{ id: string; tipo: 'error' | 'pregunta' | 'cross_block' }> = [
    ...params.report.errors.map(e => ({ id: e.id, tipo: 'error' as const })),
    ...params.report.questions.map(q => ({ id: q.id, tipo: 'pregunta' as const })),
    ...params.report.cross_block_changes.map(c => ({ id: c.id, tipo: 'cross_block' as const })),
  ]

  const inicial: Record<string, DecisionLocal> = {}
  for (const h of allHallazgos) {
    inicial[h.id] = { hallazgo_id: h.id, tipo: h.tipo, estado: 'pending' }
  }
  // Hidratar con decisiones previas si las hay.
  if (params.decisionesIniciales) {
    for (const d of params.decisionesIniciales) {
      if (inicial[d.hallazgo_id]) {
        inicial[d.hallazgo_id] = {
          hallazgo_id: d.hallazgo_id,
          tipo: d.tipo,
          estado: d.decision === 'aprobado' ? 'aprobado'
            : d.decision === 'aprobado_con_cambios' ? 'aprobado_con_cambios'
            : d.decision === 'respondido' ? 'respondido'
            : 'ignorado',
          texto_editado: d.texto_editado,
          respuesta_usuario: d.respuesta_usuario,
        }
      }
    }
  }

  const [decisiones, setDecisiones] = useState<Record<string, DecisionLocal>>(inicial)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)

  const totalCount = allHallazgos.length
  const pendingCount = Object.values(decisiones).filter(d => d.estado === 'pending').length

  // Sincronizar al backend. Toma el estado actual + el cambio pendiente y manda
  // el array completo en formato DecisionUsuario.
  const sync = useCallback(async (currentDecisiones: Record<string, DecisionLocal>): Promise<void> => {
    setSyncStatus('saving')
    setSyncError(null)
    try {
      const arr: DecisionUsuario[] = Object.values(currentDecisiones)
        .filter(d => d.estado !== 'pending')
        .map(d => ({
          hallazgo_id: d.hallazgo_id,
          tipo: d.tipo,
          decision: d.estado as DecisionUsuario['decision'],
          texto_editado: d.texto_editado,
          respuesta_usuario: d.respuesta_usuario,
        }))

      const res = await fetch(
        `/api/planes-estrategicos/${params.planId}/audit/${params.reviewerTurnoId}/decision`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decisiones: arr }),
        },
      )
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        setSyncStatus('error')
        setSyncError(`HTTP ${res.status}: ${text.slice(0, 200)}`)
        return
      }
      setSyncStatus('saved')
    } catch (e) {
      setSyncStatus('error')
      setSyncError(e instanceof Error ? e.message : String(e))
    }
  }, [params.planId, params.reviewerTurnoId])

  const setDecision = useCallback((hallazgoId: string, update: Partial<DecisionLocal>) => {
    setDecisiones(prev => {
      const current = prev[hallazgoId]
      if (!current) return prev
      const next = { ...prev, [hallazgoId]: { ...current, ...update } }
      // Persistir async — no bloquear la UI.
      void sync(next)
      return next
    })
  }, [sync])

  const reset = useCallback(() => {
    setDecisiones(inicial)
    setSyncStatus('idle')
    setSyncError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    decisiones,
    pendingCount,
    totalCount,
    syncStatus,
    syncError,
    setDecision,
    reset,
  }
}
