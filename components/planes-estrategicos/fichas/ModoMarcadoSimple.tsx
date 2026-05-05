'use client'

import type { MovimientoPE, CampoFichaMovimiento, RespuestaEstructurada } from '@/lib/types'
import { FichaMovimiento, type EstadoFicha } from './FichaMovimiento'

interface Props {
  movimientos: MovimientoPE[]
  campos: CampoFichaMovimiento[]
  marcados: string[]
  onChange: (marcados: string[]) => void
  restriccionMaxima?: number
}

export function ModoMarcadoSimple({ movimientos, campos, marcados, onChange, restriccionMaxima }: Props) {
  function toggle(id: string) {
    if (marcados.includes(id)) {
      onChange(marcados.filter(m => m !== id))
    } else {
      if (restriccionMaxima && marcados.length >= restriccionMaxima) return
      onChange([...marcados, id])
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground italic">
        {marcados.length} marcado{marcados.length === 1 ? '' : 's'}
        {restriccionMaxima ? ` (máx ${restriccionMaxima})` : ''}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {movimientos.map(m => {
          const estado: EstadoFicha = marcados.includes(m.id)
            ? { tipo: 'flag' }
            : { tipo: 'normal' }
          return (
            <FichaMovimiento
              key={m.id}
              movimiento={m}
              campos={campos}
              estado={estado}
              onClick={() => toggle(m.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

export function buildRespuesta_marcadoSimple(marcados: string[]): RespuestaEstructurada {
  return { modo: 'marcado_simple', marcados }
}

export function isCompleto_marcadoSimple(marcados: string[], min?: number, max?: number): boolean {
  // marcado_simple permite respuesta válida con 0 (= "ninguno tiene X riesgo"),
  // a menos que el modelo emita restriccion_minima > 0
  const minReal = min ?? 0
  if (marcados.length < minReal) return false
  if (max !== undefined && marcados.length > max) return false
  return true
}
