'use client'

// P4InlineFlow — versión "embebida en la columna de chat" del flow de
// secuenciación para P-4. Reemplaza el panel derecho clásico cuando la
// pregunta activa es secuenciacion: el user ve la pregunta del modelo,
// directo abajo el card de FasesCanvasP4 (balance + warnings + botón Abrir
// editor) y un botón "Confirmar selección" final.
//
// Diseñado para vivir en la columna izquierda (chat), justo arriba del
// input. Sin sidebar paralelo.

import { BTN_CTA } from '@/components/ui/button-styles'
import { useEffect, useState } from 'react'
import type { MovimientoPE, PalancaQAPE, EstresQAPE, RespuestaEstructurada, InventarioPE } from '@/lib/types'
import { FasesCanvasP4 } from './FasesCanvasP4'
import { buildRespuesta_secuenciacion } from './fichas/ModoSecuenciacion'

interface Props {
  pregunta: PalancaQAPE | EstresQAPE
  movimientos: MovimientoPE[]
  planId: string
  duenosRevisadosSignature?: string
  saving?: boolean
  onConfirmar: (respuesta: RespuestaEstructurada) => void
  onInventarioUpdate?: (inv: InventarioPE) => void
  onVerDetalleMov?: (movId: string) => void
}

export function P4InlineFlow({
  pregunta,
  movimientos,
  planId,
  duenosRevisadosSignature,
  saving,
  onConfirmar,
  onInventarioUpdate,
  onVerDetalleMov,
}: Props) {
  // Hidratar fases desde respuesta_estructurada si ya hay; sino vacío.
  // FasesCanvasP4 actualiza este state via onChange con el cronograma CPM
  // computado deterministicamente — el user no tiene que mover nada manual
  // para que la respuesta esté "completa".
  const [fases, setFases] = useState<Array<{ fase: string; movimientos: string[] }>>(() => {
    const re = pregunta.respuesta_estructurada
    if (re?.modo === 'secuenciacion') return re.fases
    return []
  })

  // Reset cuando cambia la pregunta (el modelo emitió P-N+1).
  useEffect(() => {
    const re = pregunta.respuesta_estructurada
    setFases(re?.modo === 'secuenciacion' ? re.fases : [])
  }, [pregunta.id, pregunta.respuesta_estructurada])

  function handleConfirmar() {
    onConfirmar(buildRespuesta_secuenciacion(fases))
  }

  const yaConfirmado = !!pregunta.respuesta_estructurada

  return (
    <div className="mb-2 rounded-lg border border-sidebar-border bg-sidebar/30">
      <FasesCanvasP4
        movimientos={movimientos}
        fases={fases}
        onChange={setFases}
        planId={planId}
        pregunta={pregunta}
        duenosRevisadosSignature={duenosRevisadosSignature}
        onInventarioUpdate={onInventarioUpdate}
        onVerDetalleMov={onVerDetalleMov}
      />
      <div className="border-t border-sidebar-border px-3 py-2 flex items-center justify-between gap-3 bg-background/40">
        <p className="text-[12px] text-muted-foreground">
          {yaConfirmado
            ? '✓ Ya guardado · podés cambiar y re-confirmar'
            : 'El cronograma se calcula automáticamente. Revisalo en el editor y confirmá.'}
        </p>
        <button
          onClick={handleConfirmar}
          disabled={saving || fases.length === 0}
          className={`${BTN_CTA} flex-shrink-0`}
        >
          {saving
            ? 'Guardando…'
            : yaConfirmado
              ? 'Actualizar selección →'
              : 'Confirmar selección →'}
        </button>
      </div>
    </div>
  )
}
