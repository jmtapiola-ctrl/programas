'use client'

import type { PlanDeBatalla, Objetivo, Usuario } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'
import { ObjetivoCard } from '@/components/objetivos/ObjetivoCard'

interface PlanDeBatallaViewProps {
  pb: PlanDeBatalla
  objetivos: Objetivo[]
  responsables?: Usuario[]
  onCumplirObjetivo?: (objetivoId: string) => void
  onCambiarEstado?: (estado: PlanDeBatalla['estado']) => void
}

export function PlanDeBatallaView({
  pb,
  objetivos,
  responsables,
  onCumplirObjetivo,
  onCambiarEstado,
}: PlanDeBatallaViewProps) {
  const cumplidos = objetivos.filter(o => o.estado === 'Completado').length
  const total = objetivos.length
  const porcentaje = total > 0 ? Math.round((cumplidos / total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge estadoPB={pb.estado} />
              <span className="text-sm text-muted-foreground">
                {pb.periodo} · {pb.fecha ?? '—'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-foreground">{pb.titulo}</h2>
            {responsables && responsables.length > 0 && (
              <p className="text-muted-foreground text-sm mt-1">{responsables.map(r => r.nombre).join(', ')}</p>
            )}
          </div>
          {onCambiarEstado && (
            <div className="flex items-center gap-2">
              {pb.estado === 'Borrador' && (
                <button
                  onClick={() => onCambiarEstado('Activo')}
                  className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-md"
                >
                  Activar
                </button>
              )}
              {pb.estado === 'Activo' && (
                <button
                  onClick={() => onCambiarEstado('Completado')}
                  className="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 text-white rounded-md"
                >
                  Completar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progreso */}
        {total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-1.5">
              <span>Progreso</span>
              <span>{cumplidos}/{total} objetivos · {porcentaje}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-600 rounded-full transition-all"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
          </div>
        )}

        {pb.notas && (
          <p className="text-muted-foreground text-sm mt-3 border-t border-border pt-3">{pb.notas}</p>
        )}
      </div>

      {/* Objetivos */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">
          Objetivos del {pb.periodo} ({total})
        </h3>
        {objetivos.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No hay objetivos en este plan.</p>
        ) : (
          objetivos.map(obj => (
            <ObjetivoCard
              key={obj.id}
              objetivo={obj}
              onCumplir={pb.estado === 'Activo' ? onCumplirObjetivo : undefined}
              compact
            />
          ))
        )}
      </div>
    </div>
  )
}
