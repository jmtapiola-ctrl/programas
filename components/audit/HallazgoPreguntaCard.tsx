// Card de una pregunta del reviewer en Pantalla 3.
//
// 2 acciones explícitas: Responder y enviar / Ignorar.
// El textarea tiene placeholder con el ejemplo de respuesta del reviewer
// (más útil que un placeholder genérico — guía al user qué tipo de respuesta espera).

'use client'

import { useState } from 'react'
import type { ReviewerQuestion } from '@/lib/types'
import type { DecisionLocal } from './hooks/useAuditDecisiones'

interface Props {
  hallazgo: ReviewerQuestion
  decision: DecisionLocal
  onChange: (update: Partial<DecisionLocal>) => void
}

export function HallazgoPreguntaCard({ hallazgo, decision, onChange }: Props) {
  const [respuesta, setRespuesta] = useState(decision.respuesta_usuario ?? '')

  const yaDecidido = decision.estado !== 'pending'
  const isCritica = hallazgo.categoria === 'CRITICA'

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
            isCritica ? 'bg-orange-900/40 border border-orange-700 text-orange-200'
                      : 'bg-gray-700 border border-gray-600 text-gray-300'
          }`}>
            {hallazgo.categoria === 'CRITICA' ? 'Crítica' : 'Recomendada'}
          </span>
          <span className="text-[10px] text-gray-600 font-mono">{hallazgo.id}</span>
        </div>
        {yaDecidido && (
          <span className={`text-[11px] font-semibold ${decision.estado === 'respondido' ? 'text-green-400' : 'text-gray-500'}`}>
            {decision.estado === 'respondido' && '✓ respondido'}
            {decision.estado === 'ignorado' && '✗ ignorado'}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        <p className="text-base text-white font-medium leading-relaxed">{hallazgo.pregunta}</p>
        <div className="space-y-1">
          <p className="text-[12px] text-gray-200 leading-relaxed">
            <span className="font-semibold text-white uppercase tracking-wide text-[10px]">Por qué importa: </span>
            <span className="text-gray-100">{hallazgo.por_que_importa}</span>
          </p>
          <p className="text-[12px] text-gray-300 leading-relaxed">
            <span className="font-semibold text-gray-100 uppercase tracking-wide text-[10px]">Relación con el plan: </span>
            {hallazgo.relacion_con_plan}
          </p>
        </div>
      </div>

      {!yaDecidido && (
        <>
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            placeholder={hallazgo.placeholder_ejemplo_respuesta}
            rows={3}
            className="w-full text-sm text-gray-100 bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:border-blue-500 focus:outline-none resize-vertical placeholder:text-gray-400 placeholder:italic"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onChange({ estado: 'respondido', respuesta_usuario: respuesta.trim() })}
              disabled={respuesta.trim().length === 0}
              className="flex-1 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-3 rounded transition-colors"
            >
              Responder y enviar
            </button>
            <button
              onClick={() => onChange({ estado: 'ignorado' })}
              className="bg-gray-700 hover:bg-gray-600 text-gray-400 text-sm py-2 px-3 rounded transition-colors"
            >
              Ignorar
            </button>
          </div>
        </>
      )}

      {decision.estado === 'respondido' && decision.respuesta_usuario && (
        <div className="bg-green-950/30 border border-green-900/40 rounded px-3 py-2">
          <p className="text-[10px] text-green-500 uppercase tracking-wide mb-1">Tu respuesta</p>
          <p className="text-sm text-green-200 leading-relaxed whitespace-pre-wrap">{decision.respuesta_usuario}</p>
        </div>
      )}
    </div>
  )
}
