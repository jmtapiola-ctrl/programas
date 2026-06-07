// Overlay "Creando el plan final" — se muestra mientras corre POST /audit/.../apply.
//
// El apply integra las decisiones del usuario con una llamada a la IA (Opus) que
// reescribe el plan curado; puede tardar varios minutos. Sin este overlay, el
// flow ponía flow='procesando' (que NO tenía branch de render) → la pantalla
// quedaba en blanco y el usuario podía pensar que se rompió.
//
// Mismo patrón visual que AuditoriaEnProcesoModal: portal a document.body (para
// escapar del CSS de la Vista de prestigio), sin cierre accidental.

'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function formatElapsed(s: number): string {
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function AplicandoCambiosModal({ paso }: { paso: number }) {
  const [mounted, setMounted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    setMounted(true)
    const start = Date.now()
    startRef.current = start
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className="font-sans text-white fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-800 border border-gray-600 rounded-lg shadow-2xl w-full max-w-md p-8 ring-1 ring-white/5">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <svg className="animate-spin w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">
              Aplicando tus decisiones y creando el plan final del Paso {paso}
            </h2>
            <p className="text-sm text-gray-400">
              La IA está integrando los cambios que aprobaste al plan. Esto puede tardar
              varios minutos — normalmente 1 a 3, y a veces hasta 5. Es esperable; dejá la ventana abierta.
            </p>
          </div>
          <div className="bg-gray-900/60 rounded px-4 py-3 font-mono text-sm text-gray-300">
            Tiempo: <span className="text-white font-semibold">{formatElapsed(elapsed)}</span> · procesando...
          </div>
          <p className="text-[12px] text-gray-500">No cierres esta ventana — el progreso se pierde.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
