'use client'

import { useState } from 'react'

interface Props {
  programaId: string
  resumenInicial?: string
  onResumenGenerado?: (resumen: string) => void
}

function renderMarkdown(texto: string): React.ReactNode[] {
  // Dividir por doble salto de línea para párrafos
  const parrafos = texto.split(/\n\n+/).filter(Boolean)
  return parrafos.map((parrafo, pi) => {
    // Dentro de cada párrafo, procesar **negritas**
    const partes = parrafo.split(/(\*\*[^*]+\*\*)/)
    const contenido = partes.map((parte, i) => {
      if (parte.startsWith('**') && parte.endsWith('**')) {
        return <strong key={i}>{parte.slice(2, -2)}</strong>
      }
      // Preservar saltos de línea simples
      return parte.split('\n').reduce<React.ReactNode[]>((acc, line, li) => {
        if (li > 0) acc.push(<br key={`br-${li}`} />)
        acc.push(line)
        return acc
      }, [])
    })
    return (
      <p key={pi} className="text-sm text-foreground leading-relaxed mb-4 last:mb-0">
        {contenido}
      </p>
    )
  })
}

export function ModalResumenEjecutivo({ programaId, resumenInicial, onResumenGenerado }: Props) {
  const [open, setOpen] = useState(false)
  const [resumen, setResumen] = useState(resumenInicial ?? '')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  function handleClose() {
    setOpen(false)
  }

  async function generar() {
    setCargando(true)
    setError('')
    try {
      const res = await fetch(`/api/programas/${programaId}/resumen`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al generar el resumen.')
      } else {
        setResumen(data.resumen)
        onResumenGenerado?.(data.resumen)
      }
    } catch {
      setError('Error de conexión al generar el resumen.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      {/* Botón trigger */}
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium bg-purple-700 hover:bg-purple-600 text-white rounded-md transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        Resumen Ejecutivo
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={handleClose} />
          <div className="relative bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header del modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <h2 className="text-base font-semibold text-white">Resumen Ejecutivo</h2>
              </div>
              <div className="flex items-center gap-3">
                {resumen && !cargando && (
                  <button
                    onClick={generar}
                    className="text-xs text-muted-foreground hover:text-purple-300 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerar
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 overflow-y-auto px-6 py-5 max-h-[60vh]">
              {error && (
                <p className="text-xs text-red-400 mb-4">{error}</p>
              )}

              {cargando ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-3 bg-gray-700 rounded w-full" />
                  <div className="h-3 bg-gray-700 rounded w-5/6" />
                  <div className="h-3 bg-gray-700 rounded w-4/5" />
                  <div className="h-3 bg-gray-700 rounded w-full" />
                  <div className="h-3 bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-700 rounded mt-4 w-full" />
                  <div className="h-3 bg-gray-700 rounded w-5/6" />
                  <div className="h-3 bg-gray-700 rounded w-4/6" />
                  <p className="text-xs text-muted-foreground text-center pt-2">Analizando el programa...</p>
                </div>
              ) : resumen ? (
                <div className="border-l-4 border-purple-600 pl-4">
                  {renderMarkdown(resumen)}
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <svg className="w-10 h-10 text-purple-400/60 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-foreground">No hay resumen generado todavía.</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      El análisis examina la estructura del programa, sus objetivos y el estado de avance
                      para generar un resumen ejecutivo completo.
                    </p>
                  </div>
                  <button
                    onClick={generar}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-700 hover:bg-purple-600 text-white rounded-md text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    Generar resumen ejecutivo
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-700 flex-shrink-0">
              <p className="text-xs text-muted-foreground">
                El resumen se guarda automáticamente y persiste entre sesiones.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
