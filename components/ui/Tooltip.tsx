'use client'
import { useState } from 'react'

interface TooltipProps {
  texto: string
}

export function Tooltip({ texto }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-gray-600 text-gray-300 text-xs flex items-center justify-center hover:bg-gray-500 flex-shrink-0"
        aria-label="Información"
      >
        ?
      </button>
      {visible && (
        <span className="absolute left-6 top-0 z-50 w-72 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 shadow-xl whitespace-pre-wrap">
          {texto}
        </span>
      )}
    </span>
  )
}
