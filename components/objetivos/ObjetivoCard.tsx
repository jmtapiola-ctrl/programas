'use client'

import Link from 'next/link'
import { Calendar, RefreshCw, AlertTriangle } from 'lucide-react'
import type { Objetivo, Usuario } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'

interface ObjetivoCardProps {
  objetivo: Objetivo
  responsable?: Usuario
  onCumplir?: (id: string) => void
  showPrograma?: boolean
  showTipo?: boolean
  compact?: boolean
  cumplimientosRecientes?: number
}

export function ObjetivoCard({
  objetivo,
  responsable,
  onCumplir,
  compact,
  cumplimientosRecientes,
  showTipo = true,
}: ObjetivoCardProps) {
  const isIncumplido = objetivo.estado === 'Incumplido'
  const isCriticoIncumplido =
    (objetivo.tipo === 'Primario' || objetivo.tipo === 'Vital') && isIncumplido

  let sinMovimiento = false
  if (
    (objetivo.estado === 'No iniciado' ||
      objetivo.estado === 'Asignado' ||
      objetivo.estado === 'En curso') &&
    (cumplimientosRecientes ?? 1) === 0 &&
    objetivo.fechaLimite != null
  ) {
    const hoy = new Date()
    const limite = new Date(objetivo.fechaLimite + 'T00:00:00')
    const diasRestantes = Math.ceil(
      (limite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
    )
    sinMovimiento = diasRestantes <= 7
  }

  return (
    <div
      className={`group rounded-lg border px-4 py-3 transition-colors ${
        isCriticoIncumplido
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-border bg-card hover:border-border/80 hover:bg-accent/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {showTipo && <Badge tipo={objetivo.tipo} />}
            {showTipo && objetivo.tipo === 'Operativo' && objetivo.esCondicional && (
              <span className="inline-flex items-center rounded-full border border-dashed border-orange-600/60 bg-orange-900/30 px-2 py-0.5 text-[11px] font-medium text-orange-300">
                Condicional
              </span>
            )}
            <Badge estadoObjetivo={objetivo.estado} />
            {sinMovimiento && (
              <span className="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">
                Sin movimiento
              </span>
            )}
            {objetivo.esRepetible && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <RefreshCw className="h-3 w-3" strokeWidth={1.75} />
                Repetible
              </span>
            )}
          </div>

          {/* Title */}
          <Link
            href={`/objetivos/${objetivo.id}`}
            className="text-[13px] font-medium text-foreground hover:text-primary transition-colors line-clamp-2"
          >
            {objetivo.nombre}
          </Link>

          {/* Doingness */}
          {!compact && objetivo.descripcionDoingness && (
            <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">
              {objetivo.descripcionDoingness}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            {objetivo.fechaLimite && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" strokeWidth={1.75} />
                {objetivo.fechaLimite}
              </span>
            )}
            {responsable && <span>{responsable.nombre}</span>}
          </div>
        </div>

        {/* Cumplir button */}
        {onCumplir && objetivo.estado !== 'Completado' && (
          <button
            onClick={() => onCumplir(objetivo.id)}
            className="flex-shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            Cumplir
          </button>
        )}
      </div>

      {/* Critical warning */}
      {isCriticoIncumplido && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-400">
          <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
          Objetivo {objetivo.tipo} Incumplido — rompe la cadena
        </div>
      )}
    </div>
  )
}
