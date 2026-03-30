'use client'

import { useState, useEffect } from 'react'

const ESTADOS_TERMINALES = ['Completado', 'Cancelado', 'Incumplido']

function calcularDiff(desde: Date, hasta: Date) {
  const diff = hasta.getTime() - desde.getTime()
  const negativo = diff < 0
  const abs = Math.abs(diff)
  const d = Math.floor(abs / (1000 * 60 * 60 * 24))
  const h = Math.floor((abs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const m = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60))
  return { d, h, m, negativo }
}

function fmt({ d, h, m }: { d: number; h: number; m: number }) {
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (parts.length < 2) parts.push(`${m}m`)
  return parts.join(' ') || '0m'
}

interface Props {
  fechaInicioReal?: string
  fechaLimite?: string
  estado: string
}

export function Temporizadores({ fechaInicioReal, fechaLimite, estado }: Props) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const esTerminal = ESTADOS_TERMINALES.includes(estado)

  const transcurrido = fechaInicioReal
    ? calcularDiff(new Date(fechaInicioReal), now)
    : null

  const restante = fechaLimite && !esTerminal
    ? calcularDiff(now, new Date(fechaLimite + 'T23:59:59'))
    : null

  if (!transcurrido && !restante) return null

  return (
    <div className="flex flex-col items-end gap-1.5 text-xs flex-shrink-0">
      {transcurrido && (
        <div className="text-gray-400">
          <span className="opacity-70">En curso desde </span>
          <span className="font-mono font-medium">{fmt(transcurrido)}</span>
        </div>
      )}
      {restante && (
        <div className={
          restante.negativo
            ? 'text-red-400'
            : restante.d <= 2
            ? 'text-yellow-400'
            : 'text-green-400'
        }>
          <span className="opacity-70">{restante.negativo ? 'Vencido hace ' : 'Vence en '}</span>
          <span className="font-mono font-medium">{restante.negativo ? '-' : ''}{fmt(restante)}</span>
        </div>
      )}
    </div>
  )
}
