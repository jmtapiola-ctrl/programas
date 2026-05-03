// Card de un error del reviewer en Pantalla 3.
//
// 3 acciones explícitas: Aprobar y aplicar / Editar antes de aplicar / Ignorar.
// El "editar antes de aplicar" abre un editor inline del cambio_propuesto.
// Cuando la decisión es 'ignorado', el card se oculta con fade-out (manejado
// por el contenedor — acá solo notifica el cambio).

'use client'

import { useState } from 'react'
import type { ReviewerError } from '@/lib/types'
import type { DecisionLocal } from './hooks/useAuditDecisiones'

interface Props {
  hallazgo: ReviewerError
  decision: DecisionLocal
  onChange: (update: Partial<DecisionLocal>) => void
}

const SEVERIDAD_BG: Record<string, string> = {
  Alta: 'bg-red-900/40 border-red-700 text-red-200',
  Media: 'bg-yellow-900/40 border-yellow-700 text-yellow-200',
  Baja: 'bg-blue-900/40 border-blue-700 text-blue-200',
}

const TIPO_LABEL: Record<number, string> = {
  1: 'OMISIÓN',
  2: 'DECISIÓN VIOLADA',
  3: 'ALUCINACIÓN',
  4: 'INCONSISTENCIA',
}

export function HallazgoErrorCard({ hallazgo, decision, onChange }: Props) {
  const [editando, setEditando] = useState(decision.estado === 'aprobado_con_cambios')
  const [textoEditado, setTextoEditado] = useState(decision.texto_editado ?? hallazgo.cambio_propuesto)

  const yaDecidido = decision.estado !== 'pending'
  const isAprobado = decision.estado === 'aprobado' || decision.estado === 'aprobado_con_cambios'

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${SEVERIDAD_BG[hallazgo.severidad]}`}>
            {hallazgo.severidad}
          </span>
          <span className="text-[10px] text-gray-500 uppercase">{TIPO_LABEL[hallazgo.tipo] ?? `Tipo ${hallazgo.tipo}`}</span>
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

      <div className="space-y-3">
        <div>
          <p className="text-[11px] text-gray-200 uppercase tracking-wide font-medium mb-1.5">Qué dice el resumen</p>
          <blockquote className="text-sm text-gray-100 leading-relaxed bg-gray-900/60 border-l-2 border-gray-500 rounded-r pl-3 pr-3 py-2">
            {hallazgo.que_dice_resumen}
          </blockquote>
        </div>
        <div>
          <p className="text-[11px] text-gray-200 uppercase tracking-wide font-medium mb-1.5">
            Qué se dijo en la conversación <span className="text-gray-400 normal-case">(turno {hallazgo.turno_referencia})</span>
          </p>
          <blockquote className="text-sm text-gray-100 leading-relaxed italic bg-gray-900/60 border-l-2 border-amber-600/60 rounded-r pl-3 pr-3 py-2">
            {hallazgo.que_se_dijo_en_conversacion}
          </blockquote>
        </div>
        <div>
          <p className="text-[11px] text-gray-200 uppercase tracking-wide font-medium mb-1.5">Cambio propuesto por el revisor</p>
          {!editando ? (
            <p className="text-sm text-blue-100 leading-relaxed bg-blue-950/40 border-l-2 border-blue-500 rounded-r pl-3 pr-3 py-2">
              {hallazgo.cambio_propuesto}
            </p>
          ) : (
            <textarea
              value={textoEditado}
              onChange={(e) => setTextoEditado(e.target.value)}
              rows={4}
              className="w-full text-sm text-gray-100 bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:border-blue-500 focus:outline-none resize-vertical"
            />
          )}
        </div>
      </div>

      {!yaDecidido && !editando && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onChange({ estado: 'aprobado', texto_editado: undefined })}
            className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
          >
            Aprobar y aplicar
          </button>
          <button
            onClick={() => setEditando(true)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm py-2 px-3 rounded transition-colors"
          >
            Editar antes de aplicar
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
            className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm font-medium py-2 px-3 rounded transition-colors"
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
