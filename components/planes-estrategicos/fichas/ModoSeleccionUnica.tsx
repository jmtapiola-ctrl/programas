'use client'

import type { MovimientoPE, CampoFichaMovimiento, RespuestaEstructurada } from '@/lib/types'
import { FichaMovimiento, type EstadoFicha, type GestionInventario } from './FichaMovimiento'

interface Props {
  movimientos: MovimientoPE[]
  campos: CampoFichaMovimiento[]
  seleccionado: string | null
  onChange: (movimientoId: string | null) => void
  gestion?: GestionInventario
}

export function ModoSeleccionUnica({ movimientos, campos, seleccionado, onChange, gestion }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {movimientos.map(m => {
        const estado: EstadoFicha = !seleccionado
          ? { tipo: 'normal' }
          : seleccionado === m.id
            ? { tipo: 'resaltado', color: 'verde' }
            : { tipo: 'atenuado' }
        return (
          <FichaMovimiento
            key={m.id}
            movimiento={m}
            campos={campos}
            estado={estado}
            onClick={() => onChange(seleccionado === m.id ? null : m.id)}
            cambioReciente={gestion?.agregados.has(m.id) ? 'agregado' : gestion?.editados.has(m.id) ? 'editado' : undefined}
            onEditar={gestion ? () => gestion.onEditar(m.id) : undefined}
            onQuitar={gestion ? () => gestion.onQuitar(m.id) : undefined}
          />
        )
      })}
    </div>
  )
}

// Helper: serializar el state local a RespuestaEstructurada antes de PATCH
export function buildRespuesta_seleccionUnica(seleccionado: string | null): RespuestaEstructurada | null {
  if (!seleccionado) return null
  return { modo: 'seleccion_unica', movimiento_id: seleccionado }
}

// Helper: validar restricciones (Ajuste 2 — restriccion_minima/maxima)
export function isCompleto_seleccionUnica(seleccionado: string | null): boolean {
  return seleccionado !== null
}
