'use client'

// P5InlineFlow — versión "embebida en la columna de chat" del flow de marcado
// de riesgo (P-5). Espejo de P4InlineFlow: card chico con contador + botón
// "Abrir editor de riesgos" + footer "Confirmar selección".
//
// El estado de marcado vive en `mov.riesgo_ejecucion_razonamiento` (presencia
// = marcado). La respuesta_estructurada {marcados: [ids]} se DERIVA del
// inventario al confirmar — no se duplica.

import { BTN_CTA } from '@/components/ui/button-styles'
import { useState } from 'react'
import type { MovimientoPE, PalancaQAPE, EstresQAPE, RespuestaEstructurada, InventarioPE } from '@/lib/types'
import { RiesgoEjecucionModal } from './RiesgoEjecucionModal'

interface Props {
  pregunta: PalancaQAPE | EstresQAPE
  movimientos: MovimientoPE[]
  planId: string
  saving?: boolean
  onConfirmar: (respuesta: RespuestaEstructurada) => void
  onInventarioUpdate: (inv: InventarioPE) => void
}

export function P5InlineFlow({
  pregunta,
  movimientos,
  planId,
  saving,
  onConfirmar,
  onInventarioUpdate,
}: Props) {
  const [modalAbierto, setModalAbierto] = useState(false)

  const movsActivos = movimientos.filter(m => m.estado_usuario !== 'quitado')
  const marcados = movsActivos.filter(m => !!m.riesgo_ejecucion_razonamiento)
  const marcadosIds = marcados.map(m => m.id)

  function handleConfirmar() {
    const resp: RespuestaEstructurada = { modo: 'marcado_simple', marcados: marcadosIds }
    onConfirmar(resp)
  }

  const yaConfirmado = !!pregunta.respuesta_estructurada

  return (
    <div className="mb-2 rounded-lg border border-sidebar-border bg-sidebar/30">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-red-400/90">
              P-5 · Riesgo de ejecución
            </p>
            <p className="mt-0.5 text-[14px] text-foreground/90">
              Marcá los movs donde más temés que la ejecución salga mal
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {marcados.length === 0
                ? `Ninguno marcado de ${movsActivos.length} (= "happy path")`
                : <><strong className="text-red-300">{marcados.length}</strong> marcado{marcados.length === 1 ? '' : 's'} de {movsActivos.length}</>
              }
            </p>
          </div>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-md hover:bg-red-500 transition-colors"
        >
          🎯 Abrir editor de riesgos →
        </button>
      </div>
      <div className="border-t border-sidebar-border px-3 py-2 flex items-center justify-between gap-3 bg-background/40">
        <p className="text-[12px] text-muted-foreground">
          {yaConfirmado
            ? '✓ Ya guardado · podés cambiar y re-confirmar'
            : 'Marcá lo que veas riesgoso (puede ser 0). Si marcás, escribís el porqué por mov.'}
        </p>
        <button
          onClick={handleConfirmar}
          disabled={saving}
          className={`${BTN_CTA} flex-shrink-0`}
        >
          {saving
            ? 'Guardando…'
            : yaConfirmado
              ? 'Actualizar selección →'
              : 'Confirmar selección →'}
        </button>
      </div>
      {modalAbierto && (
        <RiesgoEjecucionModal
          movimientos={movsActivos}
          planId={planId}
          preguntaTexto={pregunta.pregunta}
          onInventarioUpdate={onInventarioUpdate}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </div>
  )
}
