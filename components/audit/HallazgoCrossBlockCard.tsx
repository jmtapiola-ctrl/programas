// Card de un cross-block change del reviewer en Pantalla 3.
//
// Para Bloque 1 SIEMPRE está vacío (validateReviewerReport lo enforza).
// Para Bloque 2+: misma lógica que HallazgoErrorCard pero referenciando el
// bloque afectado y la sección.

'use client'

import { useState } from 'react'
import type { ReviewerCrossBlock } from '@/lib/types'
import type { DecisionLocal } from './hooks/useAuditDecisiones'
import { expandirCodigosMov } from '@/lib/expandir-codigos-mov'

interface Props {
  hallazgo: ReviewerCrossBlock
  decision: DecisionLocal
  onChange: (update: Partial<DecisionLocal>) => void
  movNombres?: Record<string, string>
}

const SEVERIDAD_BG: Record<string, string> = {
  Alta: 'bg-red-900/40 border-red-700 text-red-200',
  Media: 'bg-yellow-900/40 border-yellow-700 text-yellow-200',
  Baja: 'bg-blue-900/40 border-blue-700 text-blue-200',
}

export function HallazgoCrossBlockCard({ hallazgo, decision, onChange, movNombres }: Props) {
  const exp = (t: string) => expandirCodigosMov(t, movNombres ?? {})
  // Arrancar en modo NO editando: si la decisión ya tiene texto_editado, el
  // render del párrafo muestra esa versión (con label "editado por vos") y los
  // botones de re-edit permiten reabrir la edición a demanda. Antes este state
  // inicial era `decision.estado === 'aprobado_con_cambios'`, que combinado con
  // yaDecidido dejaba el textarea visible sin ningún botón (no había branch
  // de render para yaDecidido && editando).
  const [editando, setEditando] = useState(false)
  const [textoEditado, setTextoEditado] = useState(decision.texto_editado ?? hallazgo.cambio_propuesto)

  const yaDecidido = decision.estado !== 'pending'
  const isAprobado = decision.estado === 'aprobado' || decision.estado === 'aprobado_con_cambios'

  return (
    <div
      id={`hallazgo-${hallazgo.id}`}
      data-pending={!yaDecidido}
      className={`rounded-lg p-4 space-y-3 ${
        !yaDecidido
          ? 'bg-purple-950/20 border-2 border-yellow-600/60 ring-1 ring-yellow-500/30'
          : 'bg-purple-950/20 border border-purple-800/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[12px] font-bold uppercase px-2 py-0.5 rounded ${SEVERIDAD_BG[hallazgo.severidad]}`}>
            {hallazgo.severidad}
          </span>
          <span className="text-[12px] text-purple-300 uppercase font-semibold">
            Bloque {hallazgo.bloque_afectado} · {hallazgo.seccion_afectada}
          </span>
          <span className="text-[12px] text-gray-600 font-mono">{hallazgo.id}</span>
        </div>
        {yaDecidido && (
          <span className={`text-[12px] font-semibold ${isAprobado ? 'text-green-400' : 'text-gray-500'}`}>
            {decision.estado === 'aprobado' && '✓ aprobado'}
            {decision.estado === 'aprobado_con_cambios' && '✓ aprobado (editado)'}
            {decision.estado === 'ignorado' && '✗ ignorado'}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[12px] text-gray-200 uppercase tracking-wide font-medium mb-1.5">Qué dice actualmente el Bloque {hallazgo.bloque_afectado}</p>
          <blockquote className="text-[13px] text-gray-100 leading-relaxed bg-gray-900/60 border-l-2 border-gray-500 rounded-r pl-3 pr-3 py-2">
            {exp(hallazgo.que_dice_actualmente)}
          </blockquote>
        </div>
        <div>
          <p className="text-[12px] text-gray-200 uppercase tracking-wide font-medium mb-1.5">
            Qué se declaró que lo modifica <span className="text-gray-400 normal-case">(turno {hallazgo.turno_referencia})</span>
          </p>
          <blockquote className="text-sm text-gray-100 leading-relaxed italic bg-gray-900/60 border-l-2 border-amber-600/60 rounded-r pl-3 pr-3 py-2">
            {exp(hallazgo.que_se_declaro_que_lo_modifica)}
          </blockquote>
        </div>
        <div>
          <p className="text-[12px] text-gray-200 uppercase tracking-wide font-medium mb-1.5">
            Cambio propuesto
            {decision.estado === 'aprobado_con_cambios' && (
              <span className="ml-2 text-[11px] text-purple-300 normal-case font-normal italic">(editado por vos)</span>
            )}
          </p>
          {!editando ? (
            <p className="text-[13px] text-purple-100 leading-relaxed bg-purple-950/40 border-l-2 border-purple-500 rounded-r pl-3 pr-3 py-2 whitespace-pre-wrap">
              {/* Si ya aprobaste con edición, mostrá tu versión. Si no, el original
                  del reviewer. Antes este render siempre mostraba el original y
                  parecía que la edición se perdía (era solo visual: la decisión
                  guardada con texto_editado sí se persiste correctamente). */}
              {exp(decision.texto_editado ?? hallazgo.cambio_propuesto)}
            </p>
          ) : (
            <textarea
              value={textoEditado}
              onChange={(e) => setTextoEditado(e.target.value)}
              rows={4}
              className="w-full text-[13px] text-gray-100 bg-gray-900 border border-gray-600 rounded px-3 py-2 focus:border-purple-500 focus:outline-none resize-vertical"
            />
          )}
        </div>
      </div>

      {!yaDecidido && !editando && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onChange({ estado: 'aprobado', texto_editado: undefined })}
            className="flex-1 bg-purple-700 hover:bg-purple-600 text-white text-[13px] font-medium py-2 px-3 rounded transition-colors"
          >
            Aprobar y aplicar al Bloque {hallazgo.bloque_afectado}
          </button>
          <button
            onClick={() => setEditando(true)}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-[13px] py-2 px-3 rounded transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() => onChange({ estado: 'ignorado' })}
            className="bg-gray-700 hover:bg-gray-600 text-gray-400 text-[13px] py-2 px-3 rounded transition-colors"
          >
            Ignorar
          </button>
        </div>
      )}

      {/* Cuando ya está decidido, permitir revertir o re-editar. Útil cuando el
          user aprobó con edición pero después quiere ajustar más, o se equivocó
          y quiere ignorar. */}
      {yaDecidido && !editando && (
        <div className="flex gap-2 pt-1 flex-wrap">
          <button
            onClick={() => {
              setTextoEditado(decision.texto_editado ?? hallazgo.cambio_propuesto)
              setEditando(true)
            }}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs py-1.5 px-3 rounded transition-colors"
          >
            {decision.estado === 'aprobado_con_cambios' ? 'Modificar mi edición' : 'Editar y reaprobar'}
          </button>
          {decision.estado !== 'ignorado' && (
            <button
              onClick={() => onChange({ estado: 'ignorado', texto_editado: undefined })}
              className="bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs py-1.5 px-3 rounded transition-colors"
            >
              Cambiar a ignorado
            </button>
          )}
          {decision.estado === 'ignorado' && (
            <button
              onClick={() => onChange({ estado: 'aprobado', texto_editado: undefined })}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs py-1.5 px-3 rounded transition-colors"
            >
              Cambiar a aprobado
            </button>
          )}
          <button
            onClick={() => onChange({ estado: 'pending', texto_editado: undefined })}
            className="bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs py-1.5 px-3 rounded transition-colors"
          >
            Volver a pendiente
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
            className="flex-1 bg-purple-700 hover:bg-purple-600 text-white text-[13px] font-medium py-2 px-3 rounded transition-colors"
          >
            Aprobar versión editada
          </button>
          <button
            onClick={() => { setEditando(false); setTextoEditado(hallazgo.cambio_propuesto) }}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-[13px] py-2 px-3 rounded transition-colors"
          >
            Cancelar edición
          </button>
        </div>
      )}

      {/* Re-edición de una decisión ya tomada: el user entró acá via "Modificar
          mi edición" o "Editar y reaprobar". Tiene su propio par de botones —
          sin esto el textarea queda visible sin manera de guardar. */}
      {yaDecidido && editando && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              onChange({ estado: 'aprobado_con_cambios', texto_editado: textoEditado })
              setEditando(false)
            }}
            className="flex-1 bg-purple-700 hover:bg-purple-600 text-white text-[13px] font-medium py-2 px-3 rounded transition-colors"
          >
            Guardar edición modificada
          </button>
          <button
            onClick={() => {
              setEditando(false)
              setTextoEditado(decision.texto_editado ?? hallazgo.cambio_propuesto)
            }}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-[13px] py-2 px-3 rounded transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
