// Card de un cross-block change del reviewer en Pantalla 3.
//
// Para Bloque 1 SIEMPRE está vacío (validateReviewerReport lo enforza).
// Para Bloque 2+: misma lógica que HallazgoErrorCard pero referenciando el
// bloque afectado y la sección.

'use client'

import { useState } from 'react'
import type { ReviewerCrossBlock } from '@/lib/types'
import type { DecisionLocal } from './hooks/useAuditDecisiones'

interface Props {
  hallazgo: ReviewerCrossBlock
  decision: DecisionLocal
  onChange: (update: Partial<DecisionLocal>) => void
}

const SEVERIDAD_BG: Record<string, string> = {
  Alta: 'bg-red-900/40 border-red-700 text-red-200',
  Media: 'bg-yellow-900/40 border-yellow-700 text-yellow-200',
  Baja: 'bg-blue-900/40 border-blue-700 text-blue-200',
}

export function HallazgoCrossBlockCard({ hallazgo, decision, onChange }: Props) {
  const [editando, setEditando] = useState(decision.estado === 'aprobado_con_cambios')
  const [textoEditado, setTextoEditado] = useState(decision.texto_editado ?? hallazgo.cambio_propuesto)

  const yaDecidido = decision.estado !== 'pending'
  const isAprobado = decision.estado === 'aprobado' || decision.estado === 'aprobado_con_cambios'

  return (
    <div className="bg-purple-950/20 border border-purple-800/40 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${SEVERIDAD_BG[hallazgo.severidad]}`}>
            {hallazgo.severidad}
          </span>
          <span className="text-[10px] text-purple-300 uppercase font-semibold">
            Bloque {hallazgo.bloque_afectado} · {hallazgo.seccion_afectada}
          </span>
          <span className="text-[10px] text-gray-600 font-mono">{hallazgo.id}</span>
        </div>
        {yaDecidido && (
          <span className={`text-[11px] font-semibold ${isAprobado ? 'text-green-400' : 'text-gray-500'}`}>
            {decision.estado === 'aprobado' && '✓ aprobado'}
            {decision.estado === 'aprobado_con_cambios' && '✓ aprobado (editado)'}
            {decision.estado === 'ignorado' && '✗ ignorado'}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Qué dice actualmente el Bloque {hallazgo.bloque_afectado}</p>
          <p className="text-sm text-gray-200 leading-relaxed">{hallazgo.que_dice_actualmente}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">
            Qué se declaró que lo modifica (turno {hallazgo.turno_referencia})
          </p>
          <p className="text-sm text-gray-300 leading-relaxed italic">{hallazgo.que_se_declaro_que_lo_modifica}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Cambio propuesto</p>
          {!editando ? (
            <p className="text-sm text-purple-200 leading-relaxed bg-purple-950/30 border border-purple-900/40 rounded px-3 py-2">
              {hallazgo.cambio_propuesto}
            </p>
          ) : (
            <textarea
              value={textoEditado}
              onChange={(e) => setTextoEditado(e.target.value)}
              rows={4}
              className="w-full text-sm text-gray-100 bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:border-purple-500 focus:outline-none resize-vertical"
            />
          )}
        </div>
      </div>

      {!yaDecidido && !editando && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onChange({ estado: 'aprobado', texto_editado: undefined })}
            className="flex-1 bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
          >
            Aprobar y aplicar al Bloque {hallazgo.bloque_afectado}
          </button>
          <button
            onClick={() => setEditando(true)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm py-2 px-3 rounded transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() => onChange({ estado: 'ignorado' })}
            className="bg-gray-700 hover:bg-gray-600 text-gray-400 text-sm py-2 px-3 rounded transition-colors"
          >
            Ignorar
          </button>
        </div>
      )}

      {!yaDecidido && editando && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              onChange({ estado: 'aprobado_con_cambios', texto_editado: textoEditado })
              setEditando(false)
            }}
            className="flex-1 bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
          >
            Aprobar versión editada
          </button>
          <button
            onClick={() => { setEditando(false); setTextoEditado(hallazgo.cambio_propuesto) }}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm py-2 px-3 rounded transition-colors"
          >
            Cancelar edición
          </button>
        </div>
      )}
    </div>
  )
}
