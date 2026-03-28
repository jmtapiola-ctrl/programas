'use client'

import Link from 'next/link'
import type { Objetivo, Usuario } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'

interface ObjetivoCardProps {
  objetivo: Objetivo
  responsables?: Usuario[]
  onCumplir?: (id: string) => void
  showPrograma?: boolean
  compact?: boolean
}

const TIPO_ORDEN: Record<string, number> = {
  'Primario': 1,
  'Condicional': 2,
  'Operativo': 3,
  'Producción': 4,
  'Mayor': 5,
}

export function ObjetivoCard({ objetivo, responsables, onCumplir, compact }: ObjetivoCardProps) {
  const isIncumplido = objetivo.estado === 'Incumplido'
  const isPrimarioIncumplido = objetivo.tipo === 'Primario' && isIncumplido

  return (
    <div className={`
      bg-gray-800 border rounded-lg p-4 transition-all
      ${isPrimarioIncumplido ? 'border-red-700 bg-red-950/20' : 'border-gray-700 hover:border-gray-600'}
    `}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge tipo={objetivo.tipo} />
            <Badge estadoObjetivo={objetivo.estado} />
            {objetivo.esRepetible && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Repetible
              </span>
            )}
          </div>
          <Link href={`/objetivos/${objetivo.id}`} className="text-gray-100 font-medium hover:text-blue-400 transition-colors line-clamp-2">
            {objetivo.nombre}
          </Link>
          {!compact && objetivo.descripcionDoingness && (
            <p className="text-gray-400 text-sm mt-1 line-clamp-2">{objetivo.descripcionDoingness}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {objetivo.fechaLimite && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {objetivo.fechaLimite}
              </span>
            )}
            {responsables && responsables.length > 0 && (
              <span>{responsables.map(r => r.nombre).join(', ')}</span>
            )}
          </div>
        </div>
        {onCumplir && objetivo.estado !== 'Cumplido' && (
          <button
            onClick={() => onCumplir(objetivo.id)}
            className="flex-shrink-0 px-3 py-1.5 text-xs bg-green-800 hover:bg-green-700 text-green-200 border border-green-700 rounded-md transition-colors"
          >
            Cumplir
          </button>
        )}
      </div>
      {isPrimarioIncumplido && (
        <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Objetivo Primario Incumplido — rompe la cadena
        </div>
      )}
    </div>
  )
}

export function sortObjetivos(objetivos: Objetivo[]): Objetivo[] {
  return [...objetivos].sort((a, b) => {
    const ordenTipo = (TIPO_ORDEN[a.tipo] ?? 99) - (TIPO_ORDEN[b.tipo] ?? 99)
    if (ordenTipo !== 0) return ordenTipo
    return (a.orden ?? 0) - (b.orden ?? 0)
  })
}
