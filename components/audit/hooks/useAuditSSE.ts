// Hook que consume el SSE de POST /api/planes-estrategicos/[id]/audit/start.
//
// Reusa el patrón de fetch + ReadableStream del chat route (no usa EventSource
// porque EventSource solo soporta GET y nuestro endpoint es POST con body).
//
// Estados expuestos:
//   - status: 'idle' | 'cargando' | 'esperando_reviewer' | 'success' | 'error' | 'skipped'
//   - elapsedSeconds: timer cliente-side (incrementado cada segundo desde mount).
//                     NO usa el elapsed_ms del server (M9: timer real, no etapas
//                     simuladas). El server SSE solo confirma que el reviewer
//                     sigue pensando.
//   - report: ReviewerReport | null (poblado cuando status === 'success').
//   - reviewerTurnoId: string | null (poblado cuando status === 'success').
//   - error: { code, detail, retryAvailable } | null
//   - metrics: ReviewerCallMetrics | null

'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReviewerReport } from '@/lib/types'

export type AuditSSEStatus =
  | 'idle'
  | 'cargando'              // server respondió, etapa cargando_inputs
  | 'esperando_reviewer'    // server respondió, etapa esperando_reviewer
  | 'success'
  | 'skipped'
  | 'error'

export interface AuditSSEError {
  code: string
  detail: string
  retryAvailable: boolean
}

export interface AuditSSEMetrics {
  input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  cost_usd: number
  latency_ms: number
  retries_used: number
  attempts: number
  model: string
  effort: string
}

export interface AuditSSEHook {
  status: AuditSSEStatus
  elapsedSeconds: number
  report: ReviewerReport | null
  reviewerTurnoId: string | null
  error: AuditSSEError | null
  metrics: AuditSSEMetrics | null
  start: (params: { paso: number; skip?: boolean; reason?: string }) => Promise<void>
  reset: () => void
}

export function useAuditSSE(planId: string): AuditSSEHook {
  const [status, setStatus] = useState<AuditSSEStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [report, setReport] = useState<ReviewerReport | null>(null)
  const [reviewerTurnoId, setReviewerTurnoId] = useState<string | null>(null)
  const [error, setError] = useState<AuditSSEError | null>(null)
  const [metrics, setMetrics] = useState<AuditSSEMetrics | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Timer real cliente-side: incrementa cada segundo mientras status sea
  // cargando o esperando_reviewer.
  useEffect(() => {
    if (status === 'cargando' || status === 'esperando_reviewer') {
      if (!startTimeRef.current) startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [status])

  // Cleanup del fetch en unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  function reset(): void {
    abortRef.current?.abort()
    abortRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    startTimeRef.current = null
    setStatus('idle')
    setElapsedSeconds(0)
    setReport(null)
    setReviewerTurnoId(null)
    setError(null)
    setMetrics(null)
  }

  async function start(params: { paso: number; skip?: boolean; reason?: string }): Promise<void> {
    reset()
    setStatus('cargando')
    startTimeRef.current = Date.now()

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/audit/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        setStatus('error')
        setError({
          code: `http_${res.status}`,
          detail: await res.text().catch(() => 'sin detalle'),
          retryAvailable: false,
        })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE format: "data: {...}\n\n"
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const json = trimmed.slice(5).trim()
          if (!json) continue
          let event: any
          try {
            event = JSON.parse(json)
          } catch {
            continue
          }
          handleEvent(event)
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return  // intencional, no reportamos
      setStatus('error')
      setError({
        code: 'network',
        detail: e instanceof Error ? e.message : String(e),
        retryAvailable: true,
      })
    }

    function handleEvent(event: any): void {
      switch (event.type) {
        case 'progress':
          // El server nos avisa que sigue pensando. La etapa la usamos solo
          // para clasificar el estado, no para etiquetar al usuario (timer real).
          if (event.etapa === 'cargando_inputs') setStatus('cargando')
          else if (event.etapa === 'esperando_reviewer') setStatus('esperando_reviewer')
          break
        case 'result':
          setStatus('success')
          setReport(event.report ?? null)
          setReviewerTurnoId(event.reviewer_turno_id ?? null)
          setMetrics(event.metrics ?? null)
          break
        case 'skipped':
          setStatus('skipped')
          break
        case 'error':
          setStatus('error')
          setError({
            code: event.code ?? 'unknown',
            detail: event.detail ?? 'sin detalle',
            retryAvailable: event.retry_available !== false,
          })
          if (event.metrics) setMetrics(event.metrics)
          break
      }
    }
  }

  return { status, elapsedSeconds, report, reviewerTurnoId, error, metrics, start, reset }
}
