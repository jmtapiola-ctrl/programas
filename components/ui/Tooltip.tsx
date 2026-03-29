'use client'
import { useState } from 'react'

export function Tooltip({ texto }: { texto: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-gray-600 text-gray-300 text-xs flex items-center justify-center hover:bg-gray-500 focus:outline-none cursor-help"
      >
        ?
      </button>
      {visible && (
        <span className="absolute left-6 top-0 z-50 w-72 p-3 text-xs text-gray-200 bg-gray-800 border border-gray-600 rounded-lg shadow-xl leading-relaxed">
          {texto}
        </span>
      )}
    </span>
  )
}
