// Modal de "Comentar" — desde Pantalla 4. Loop de hasta 3 iteraciones de
// ajuste del resumen vía Opus.
//
// Renderizado con createPortal para escapar del CSS scope del page (mismo
// motivo que los modales de P2/P3).

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  planId: string
  paso: number
  onClose: () => void
  onApplied: () => void  // se llama tras un PATCH exitoso → caller refresca la página
}

const MAX_ITERACIONES = 3

export function ComentarFeedbackModal({ planId, paso, onClose, onApplied }: Props) {
  const [comentario, setComentario] = useState('')
  const [iteracion, setIteracion] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxAlcanzado, setMaxAlcanzado] = useState(false)

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  async function handleEnviar() {
    if (enviando) return
    if (comentario.trim().length === 0) {
      setError('El comentario no puede estar vacío.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/planes-estrategicos/${planId}/comentar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso, comentario: comentario.trim(), iteracion }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        if (data?.max_alcanzado) setMaxAlcanzado(true)
        setEnviando(false)
        return
      }
      setIteracion(data.iteracion_actual)
      setComentario('')
      setEnviando(false)
      // Si fue la última iteración permitida, deshabilitamos para próximos envíos.
      if (data.iteracion_actual >= MAX_ITERACIONES) setMaxAlcanzado(true)
      // Notificar al caller para que refresque la página y muestre el resumen actualizado.
      onApplied()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEnviando(false)
    }
  }

  if (!mounted) return null

  const iteracionesRestantes = MAX_ITERACIONES - iteracion

  return createPortal(
    <div className="font-sans text-white fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-600 rounded-lg shadow-2xl w-full max-w-xl p-6 ring-1 ring-white/5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Comentar el resumen</h2>
            <p className="text-[12px] text-gray-300 mt-1">
              Iteración {iteracion} de {MAX_ITERACIONES}. {iteracionesRestantes > 0
                ? `Quedan ${iteracionesRestantes} ajuste${iteracionesRestantes === 1 ? '' : 's'}.`
                : 'Es el máximo de iteraciones — aceptá o re-auditá.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {iteracion >= MAX_ITERACIONES - 1 && iteracion < MAX_ITERACIONES && (
          <div className="bg-amber-900/30 border border-amber-700 rounded px-3 py-2 text-[12px] text-amber-100">
            <strong className="font-semibold">Último ajuste disponible.</strong> Después de este comentario tenés que aceptar el resumen o re-auditar (no más comentarios).
          </div>
        )}

        {maxAlcanzado && (
          <div className="bg-red-900/30 border border-red-700 rounded px-3 py-2 text-[12px] text-red-100">
            Ya alcanzaste las {MAX_ITERACIONES} iteraciones de comentario para este Paso. Cerrá el modal y aceptá el resumen, o re-auditá.
          </div>
        )}

        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej: 'En métricas, agregá baseline para volumen. La métrica de productividad cambiala a 1.5x en vez de 2x.'"
          rows={5}
          disabled={enviando || maxAlcanzado}
          className="w-full text-sm text-gray-100 bg-gray-950 border border-gray-600 rounded px-3 py-2 focus:border-blue-500 focus:outline-none resize-vertical placeholder:text-gray-400 placeholder:italic disabled:opacity-50"
        />

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded px-3 py-2 text-[12px] text-red-100">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm py-2 px-4 rounded transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando || maxAlcanzado || comentario.trim().length === 0}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            {enviando ? 'Aplicando...' : 'Aplicar comentario'}
          </button>
        </div>

        <p className="text-[12px] text-gray-500 text-center pt-1">
          Cada iteración llama a Claude Opus 4.7 (~$0.30-0.50 USD por iteración).
        </p>
      </div>
    </div>,
    document.body,
  )
}
