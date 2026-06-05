'use client'

// Wrapper que añade un botón "Expandir a pantalla completa" en la esquina
// superior derecha del child. Cuando se clickea, el child se renderea como
// overlay fijo cubriendo todo el viewport, con un botón "Cerrar" para volver
// al estado normal. Útil para gráficos densos (DAG, Gantt) que necesitan más
// espacio del que tiene el documento.
//
// Detalles:
//  - Soporta Escape para salir de fullscreen.
//  - El child recibe la altura efectiva: cuando está fullscreen ocupa 100vh
//    menos un margen para el botón; en modo normal ocupa lo que define el
//    parent con la prop `defaultHeight`.

import { useEffect, useState, type ReactNode } from 'react'

interface Props {
  defaultHeight: string  // alto del contenedor en modo normal (ej: '600px')
  children: (height: string) => ReactNode
  // Texto opcional del label del botón. Default "Expandir".
  expandLabel?: string
}

export function FullscreenWrapper({ defaultHeight, children, expandLabel = 'Expandir' }: Props) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    // Bloquear scroll del body cuando estamos en fullscreen.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen])

  const containerStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#ffffff',
        padding: '8px',
      }
    : {
        position: 'relative',
      }

  const childHeight = fullscreen ? 'calc(100vh - 16px)' : defaultHeight

  return (
    <div style={containerStyle}>
      <button
        type="button"
        onClick={() => setFullscreen(!fullscreen)}
        style={{
          position: 'absolute',
          top: fullscreen ? 16 : 8,
          right: fullscreen ? 16 : 8,
          zIndex: 110,
          padding: '6px 10px',
          fontSize: '12px',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
          fontWeight: 600,
          color: '#1a1a1a',
          background: '#ffffff',
          border: '1px solid #d4d4cf',
          borderRadius: 4,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
        title={fullscreen ? 'Cerrar pantalla completa (Esc)' : 'Expandir a pantalla completa'}
      >
        {fullscreen ? '✕ Cerrar' : `⛶ ${expandLabel}`}
      </button>
      {children(childHeight)}
    </div>
  )
}
