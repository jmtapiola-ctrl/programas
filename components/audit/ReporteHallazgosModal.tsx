// Pantalla 3 — Modal "Reporte de hallazgos".
//
// SE MUESTRA ENCIMA DE PANTALLA 1. Sin X de cierre, sin click-outside, sin
// Escape (evitar pérdida accidental de decisiones — pedido del user para Fase 3).
//
// Estructura:
//   - Header: contador "X de Y procesados" + barra de progreso real + estado de sync.
//   - Sección "Errores en el resumen (N)" colapsable.
//   - Sección "Preguntas críticas (N)" colapsable.
//   - Sección "Preguntas recomendadas (N)" colapsable.
//   - Sección "Cambios retroactivos (N)" — solo si hay (vacía para Bloque 1).
//   - Footer: botón "Procesar todos los cambios y avanzar" (habilitado si pending=0).
//
// Hallazgos ignorados se ocultan con fade-out → placeholder colapsable "N ignorados".
//
// Las decisiones se persisten en tiempo real al backend (PATCH a /decision).
// Si el sync falla (network), el estado local sigue intacto y se reintenta en
// el próximo cambio del user.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReviewerReport, ReviewerError, ReviewerQuestion, ReviewerCrossBlock, DecisionUsuario } from '@/lib/types'
import { useAuditDecisiones } from './hooks/useAuditDecisiones'
import { HallazgoErrorCard } from './HallazgoErrorCard'
import { HallazgoPreguntaCard } from './HallazgoPreguntaCard'
import { HallazgoCrossBlockCard } from './HallazgoCrossBlockCard'

interface Props {
  planId: string
  reviewerTurnoId: string
  report: ReviewerReport
  decisionesIniciales?: DecisionUsuario[]   // hidratación tras abandono
  paso: number
  onProcesarTodos: () => void               // → Fase 4 apply, en esta fase solo signal
}

export function ReporteHallazgosModal({ planId, reviewerTurnoId, report, decisionesIniciales, paso, onProcesarTodos }: Props) {
  const dec = useAuditDecisiones({ planId, reviewerTurnoId, report, decisionesIniciales })
  const [verIgnoradosError, setVerIgnoradosError] = useState(false)
  const [verIgnoradosPregCrit, setVerIgnoradosPregCrit] = useState(false)
  const [verIgnoradosPregReco, setVerIgnoradosPregReco] = useState(false)
  const [verIgnoradosCB, setVerIgnoradosCB] = useState(false)

  // Mounted check para createPortal en SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const errors = report.errors
  const preguntasCriticas = report.questions.filter(q => q.categoria === 'CRITICA')
  const preguntasRecomendadas = report.questions.filter(q => q.categoria === 'RECOMENDADA')
  const crossBlock = report.cross_block_changes

  const procesadoCount = dec.totalCount - dec.pendingCount
  const procesadoPct = dec.totalCount > 0 ? Math.round((procesadoCount / dec.totalCount) * 100) : 0
  const habilitarFooter = dec.pendingCount === 0 && dec.totalCount > 0

  // Helper: separa los items de cada sección entre visibles e ignorados.
  function split<T extends { id: string }>(items: T[]): { visibles: T[]; ignorados: T[] } {
    const visibles: T[] = []
    const ignorados: T[] = []
    for (const it of items) {
      const d = dec.decisiones[it.id]
      if (d?.estado === 'ignorado') ignorados.push(it)
      else visibles.push(it)
    }
    return { visibles, ignorados }
  }

  const errorsSplit = useMemo(() => split(errors), [errors, dec.decisiones])
  const critSplit = useMemo(() => split(preguntasCriticas), [preguntasCriticas, dec.decisiones])
  const recoSplit = useMemo(() => split(preguntasRecomendadas), [preguntasRecomendadas, dec.decisiones])
  const cbSplit = useMemo(() => split(crossBlock), [crossBlock, dec.decisiones])

  if (!mounted) return null

  // Render con createPortal en document.body — escapa del DOM tree del page
  // (pe-vista-root) cuyo CSS cascadea colores negros (color: #1a1a1a) con
  // especificidad mayor que las utility classes de Tailwind. Sin esto, todos
  // los textos del modal heredan #1a1a1a del scope de la Vista de prestigio.
  return createPortal(
    <div className="font-sans text-white fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-600 rounded-lg shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col ring-1 ring-white/5">
        {/* Header con contador + barra de progreso */}
        <div className="px-6 py-4 border-b border-gray-700 space-y-2 flex-shrink-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">
              Auditoría del Paso {paso}
            </h2>
            <p className="text-sm text-gray-300">
              <span className="text-white font-semibold">{procesadoCount}</span> de {dec.totalCount} hallazgos procesados
            </p>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${procesadoPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="text-gray-300">
              Confianza del revisor: <span className="text-white font-semibold">{report.meta.confianza_general}</span>
            </span>
            <SyncStatusIndicator status={dec.syncStatus} error={dec.syncError} />
          </div>
        </div>

        {/* Body con scroll */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
          {errors.length > 0 && (
            <Seccion
              titulo={`Errores en el resumen (${errorsSplit.visibles.length})`}
              ignoradosCount={errorsSplit.ignorados.length}
              verIgnorados={verIgnoradosError}
              onToggleIgnorados={() => setVerIgnoradosError(v => !v)}
            >
              {errorsSplit.visibles.map(e => (
                <HallazgoErrorCard
                  key={e.id}
                  hallazgo={e}
                  decision={dec.decisiones[e.id]}
                  onChange={(u) => dec.setDecision(e.id, u)}
                />
              ))}
              {verIgnoradosError && errorsSplit.ignorados.map(e => (
                <HallazgoErrorCard
                  key={e.id}
                  hallazgo={e}
                  decision={dec.decisiones[e.id]}
                  onChange={(u) => dec.setDecision(e.id, u)}
                />
              ))}
            </Seccion>
          )}

          {preguntasCriticas.length > 0 && (
            <Seccion
              titulo={`Preguntas críticas (${critSplit.visibles.length})`}
              ignoradosCount={critSplit.ignorados.length}
              verIgnorados={verIgnoradosPregCrit}
              onToggleIgnorados={() => setVerIgnoradosPregCrit(v => !v)}
            >
              {critSplit.visibles.map(q => (
                <HallazgoPreguntaCard
                  key={q.id}
                  hallazgo={q}
                  decision={dec.decisiones[q.id]}
                  onChange={(u) => dec.setDecision(q.id, u)}
                />
              ))}
              {verIgnoradosPregCrit && critSplit.ignorados.map(q => (
                <HallazgoPreguntaCard
                  key={q.id}
                  hallazgo={q}
                  decision={dec.decisiones[q.id]}
                  onChange={(u) => dec.setDecision(q.id, u)}
                />
              ))}
            </Seccion>
          )}

          {preguntasRecomendadas.length > 0 && (
            <Seccion
              titulo={`Preguntas recomendadas (${recoSplit.visibles.length})`}
              ignoradosCount={recoSplit.ignorados.length}
              verIgnorados={verIgnoradosPregReco}
              onToggleIgnorados={() => setVerIgnoradosPregReco(v => !v)}
            >
              {recoSplit.visibles.map(q => (
                <HallazgoPreguntaCard
                  key={q.id}
                  hallazgo={q}
                  decision={dec.decisiones[q.id]}
                  onChange={(u) => dec.setDecision(q.id, u)}
                />
              ))}
              {verIgnoradosPregReco && recoSplit.ignorados.map(q => (
                <HallazgoPreguntaCard
                  key={q.id}
                  hallazgo={q}
                  decision={dec.decisiones[q.id]}
                  onChange={(u) => dec.setDecision(q.id, u)}
                />
              ))}
            </Seccion>
          )}

          {crossBlock.length > 0 && (
            <Seccion
              titulo={`Cambios retroactivos a bloques anteriores (${cbSplit.visibles.length})`}
              ignoradosCount={cbSplit.ignorados.length}
              verIgnorados={verIgnoradosCB}
              onToggleIgnorados={() => setVerIgnoradosCB(v => !v)}
            >
              {cbSplit.visibles.map(c => (
                <HallazgoCrossBlockCard
                  key={c.id}
                  hallazgo={c}
                  decision={dec.decisiones[c.id]}
                  onChange={(u) => dec.setDecision(c.id, u)}
                />
              ))}
              {verIgnoradosCB && cbSplit.ignorados.map(c => (
                <HallazgoCrossBlockCard
                  key={c.id}
                  hallazgo={c}
                  decision={dec.decisiones[c.id]}
                  onChange={(u) => dec.setDecision(c.id, u)}
                />
              ))}
            </Seccion>
          )}

          {dec.totalCount === 0 && (
            <p className="text-center text-gray-400 py-8">
              El revisor no encontró ningún hallazgo. Podés avanzar directamente al paso siguiente.
            </p>
          )}
        </div>

        {/* Footer con botón de procesar */}
        <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0 space-y-2">
          {!habilitarFooter && dec.pendingCount > 0 && (
            <p className="text-[11px] text-gray-500 text-center">
              Quedan {dec.pendingCount} hallazgo{dec.pendingCount === 1 ? '' : 's'} sin procesar.
            </p>
          )}
          <button
            onClick={onProcesarTodos}
            disabled={!habilitarFooter}
            className={`w-full py-3 px-4 rounded font-semibold transition-colors text-sm ${
              habilitarFooter
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {dec.totalCount === 0
              ? 'Avanzar al paso siguiente'
              : 'Procesar todos los cambios y avanzar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Seccion({
  titulo, ignoradosCount, verIgnorados, onToggleIgnorados, children,
}: {
  titulo: string
  ignoradosCount: number
  verIgnorados: boolean
  onToggleIgnorados: () => void
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[13px] uppercase tracking-wider text-white font-semibold border-b border-gray-700 pb-2">
        {titulo}
      </h3>
      {children}
      {ignoradosCount > 0 && (
        <button
          onClick={onToggleIgnorados}
          className="text-[12px] text-gray-400 hover:text-gray-200 transition-colors"
        >
          {verIgnorados
            ? `← ocultar ${ignoradosCount} ignorado${ignoradosCount === 1 ? '' : 's'}`
            : `+ ver ${ignoradosCount} ignorado${ignoradosCount === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  )
}

function SyncStatusIndicator({ status, error }: { status: 'idle' | 'saving' | 'saved' | 'error'; error: string | null }) {
  if (status === 'idle') return <span className="text-gray-600">—</span>
  if (status === 'saving') return <span className="text-blue-400">guardando...</span>
  if (status === 'saved') return <span className="text-green-500/80">✓ guardado</span>
  if (status === 'error') return (
    <span className="text-red-400" title={error ?? ''}>
      ⚠ error de sync (próximo cambio reintenta)
    </span>
  )
  return null
}
