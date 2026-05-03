// Pantalla 2 — Modal "Auditoría en proceso".
//
// SE MUESTRA ENCIMA DE PANTALLA 1. Sin X de cierre, sin click-outside, sin
// Escape (evitar pérdida accidental del progreso). Si la audit falla, ofrecer
// botones explícitos: Reintentar / Skip de emergencia. Si está en éxito,
// transicionar automáticamente a Pantalla 3.
//
// Timer real (M9): muestra elapsedSeconds del hook, NO etapas simuladas.

'use client'

import type { AuditSSEHook } from './hooks/useAuditSSE'

interface Props {
  audit: AuditSSEHook
  paso: number
  onSuccess: () => void                            // transición auto a Pantalla 3
  onSkipEmergency: () => Promise<void> | void      // skip tras 3 fallas
  onRetry: () => Promise<void> | void              // reintentar audit
}

function formatElapsed(s: number): string {
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function AuditoriaEnProcesoModal({ audit, paso, onSuccess, onSkipEmergency, onRetry }: Props) {
  const { status, elapsedSeconds, error, metrics } = audit

  // Auto-transición a Pantalla 3 cuando la audit completa.
  if (status === 'success') {
    onSuccess()
    return null
  }

  return (
    <div className="font-sans fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay sin onClick — explícito según pedido del user (Fase 3). */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-full max-w-md p-8 ring-1 ring-white/5">
        {(status === 'cargando' || status === 'esperando_reviewer') && (
          <ProcesandoPanel paso={paso} elapsedSeconds={elapsedSeconds} />
        )}

        {status === 'error' && error && (
          <ErrorPanel
            paso={paso}
            error={error}
            elapsedSeconds={elapsedSeconds}
            metrics={metrics}
            onRetry={onRetry}
            onSkipEmergency={onSkipEmergency}
          />
        )}
      </div>
    </div>
  )
}

function ProcesandoPanel({ paso, elapsedSeconds }: { paso: number; elapsedSeconds: number }) {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <Spinner />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">
          Un revisor estratégico independiente está analizando tu Paso {paso}
        </h2>
        <p className="text-sm text-gray-400">Esto puede tardar 3 a 5 minutos.</p>
      </div>
      <div className="bg-gray-900/60 rounded px-4 py-3 font-mono text-sm text-gray-300">
        Tiempo: <span className="text-white font-semibold">{formatElapsed(elapsedSeconds)}</span> · esperando reviewer...
      </div>
      <p className="text-[11px] text-gray-500">No cierres esta ventana — el progreso se pierde.</p>
    </div>
  )
}

function ErrorPanel({
  paso, error, elapsedSeconds, metrics, onRetry, onSkipEmergency,
}: {
  paso: number
  error: { code: string; detail: string; retryAvailable: boolean }
  elapsedSeconds: number
  metrics: { cost_usd?: number; retries_used?: number } | null
  onRetry: () => Promise<void> | void
  onSkipEmergency: () => Promise<void> | void
}) {
  // Mensajes específicos por código de error (los más comunes).
  const friendly = (() => {
    switch (error.code) {
      case 'cost_cap_exceeded':
        return 'El costo estimado superó el cap de seguridad. La auditoría no se ejecutó para protegerte.'
      case 'malformed_json':
        return 'El revisor devolvió una respuesta malformada (probablemente truncada por límite de tokens).'
      case 'timeout':
        return 'El revisor tardó más del límite máximo y la conexión se interrumpió.'
      case 'api_error':
        return 'OpenAI rechazó la llamada (posible problema de credenciales o rate limit).'
      case 'all_retries_failed':
        return 'Los 3 intentos al revisor fallaron consecutivamente.'
      case 'invalid_shape':
        return 'El revisor devolvió un reporte que no cumple el formato esperado.'
      case 'count_exceeded':
        return 'Ya se hicieron las 3 auditorías permitidas para este Paso.'
      case 'empty_block':
        return `No hay material conversacional en el Paso ${paso} para auditar.`
      default:
        return 'Hubo un error inesperado.'
    }
  })()

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-red-300 mb-2">El revisor no respondió</h2>
        <p className="text-sm text-gray-300">{friendly}</p>
      </div>
      <div className="bg-gray-900/60 rounded px-4 py-3 text-[11px] text-gray-400 font-mono space-y-1">
        <div><span className="text-gray-500">code:</span> {error.code}</div>
        <div><span className="text-gray-500">tiempo:</span> {formatElapsed(elapsedSeconds)}</div>
        {metrics?.cost_usd ? <div><span className="text-gray-500">costo:</span> ${metrics.cost_usd.toFixed(3)}</div> : null}
        {metrics?.retries_used ? <div><span className="text-gray-500">retries:</span> {metrics.retries_used}</div> : null}
        <details>
          <summary className="cursor-pointer text-gray-500 hover:text-gray-400">detalle técnico</summary>
          <div className="mt-1 text-gray-400 break-all">{error.detail.slice(0, 500)}</div>
        </details>
      </div>
      <div className="flex gap-3">
        {error.retryAvailable && (
          <button
            onClick={() => onRetry()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded transition-colors"
          >
            Reintentar
          </button>
        )}
        <button
          onClick={() => onSkipEmergency()}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-2.5 px-4 rounded transition-colors text-sm"
        >
          Saltar auditoría y avanzar
        </button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}
