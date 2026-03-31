'use client'

import { useState } from 'react'

interface Props {
  programaId: string
  resumenInicial?: string
}

export function ResumenEjecutivo({ programaId, resumenInicial }: Props) {
  const [resumen, setResumen] = useState(resumenInicial ?? '')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

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
      }
    } catch {
      setError('Error de conexión al generar el resumen.')
    } finally {
      setCargando(false)
    }
  }

  if (!resumen && !cargando) {
    return (
      <div className="border border-dashed border-border rounded-lg p-6 text-center space-y-3">
        <div className="text-2xl">✦</div>
        <div>
          <p className="text-sm font-medium text-foreground">Generar resumen ejecutivo</p>
          <p className="text-xs text-muted-foreground mt-1">
            Análisis automático del estado y estructura del programa
          </p>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={generar}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-700/50 rounded-md text-sm font-medium transition-colors"
        >
          Generar resumen
        </button>
      </div>
    )
  }

  if (cargando) {
    return (
      <div className="border border-purple-800/40 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2">
          <svg className="animate-spin w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-purple-300">Analizando programa...</span>
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-5/6" />
          <div className="h-3 bg-muted rounded w-4/5" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-3/4" />
        </div>
      </div>
    )
  }

  return (
    <div className="border-l-4 border-purple-600 bg-purple-900/10 rounded-r-lg p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-xs text-purple-400 font-medium uppercase tracking-wider">
          Resumen Ejecutivo
        </p>
        <button
          onClick={generar}
          disabled={cargando}
          title="Regenerar resumen"
          className="text-xs text-muted-foreground hover:text-purple-300 transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Regenerar
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <div className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{resumen}</div>
    </div>
  )
}
