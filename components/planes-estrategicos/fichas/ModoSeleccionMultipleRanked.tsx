'use client'

import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { MovimientoPE, CampoFichaMovimiento, RespuestaEstructurada } from '@/lib/types'
import { FichaMovimiento, type EstadoFicha } from './FichaMovimiento'

// ranking[] preserva el orden: posicion = índice + 1
interface Props {
  movimientos: MovimientoPE[]
  campos: CampoFichaMovimiento[]
  ranking: string[]                    // ids ordenados (posición 1, 2, 3...)
  onChange: (ranking: string[]) => void
  restriccionMinima?: number
  restriccionMaxima?: number
}

export function ModoSeleccionMultipleRanked({ movimientos, campos, ranking, onChange, restriccionMaxima }: Props) {
  const movsRanked = ranking.map(id => movimientos.find(m => m.id === id)).filter((m): m is MovimientoPE => !!m)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ranking.indexOf(String(active.id))
    const newIndex = ranking.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(ranking, oldIndex, newIndex))
  }

  function toggleMovimiento(id: string) {
    if (ranking.includes(id)) {
      // ya marcado — desmarcar
      onChange(ranking.filter(r => r !== id))
    } else {
      // si hay restriccion_maxima, no permitir más
      if (restriccionMaxima && ranking.length >= restriccionMaxima) return
      onChange([...ranking, id])
    }
  }

  return (
    <div className="space-y-3">
      {/* Lista ranked (drag-to-reorder) — solo si hay marcados */}
      {ranking.length > 0 && (
        <div className="rounded-lg border border-blue-700/40 bg-blue-950/10 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-300">
            Tu ranking ({ranking.length}{restriccionMaxima ? `/${restriccionMaxima}` : ''}) — arrastrá para reordenar
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ranking} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {movsRanked.map((m, idx) => (
                  <SortableRow key={m.id} movimiento={m} campos={campos} posicion={idx + 1} onQuitar={() => toggleMovimiento(m.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Grid de fichas para marcar/desmarcar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {movimientos.map(m => {
          const idx = ranking.indexOf(m.id)
          const estado: EstadoFicha = idx >= 0
            ? { tipo: 'marcado-numero', numero: idx + 1 }
            : { tipo: 'normal' }
          return (
            <FichaMovimiento
              key={m.id}
              movimiento={m}
              campos={campos}
              estado={estado}
              onClick={() => toggleMovimiento(m.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

// Fila draggable de un movimiento ya marcado
function SortableRow({ movimiento, campos: _campos, posicion, onQuitar }: { movimiento: MovimientoPE; campos: CampoFichaMovimiento[]; posicion: number; onQuitar: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: movimiento.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md bg-background/40 border border-blue-800/30 px-2 py-1.5">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1" aria-label="Arrastrar para reordenar">
        ⋮⋮
      </button>
      <span className="h-6 w-6 rounded-full bg-blue-500 text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
        {posicion}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground/70">{movimiento.id}</span>
      <span className="flex-1 text-[12px] text-foreground truncate">{movimiento.nombre}</span>
      <button onClick={onQuitar} className="text-muted-foreground hover:text-red-400 text-[14px] px-1" aria-label="Quitar del ranking">
        ✕
      </button>
    </div>
  )
}

export function buildRespuesta_seleccionRanked(ranking: string[]): RespuestaEstructurada | null {
  if (ranking.length === 0) return null
  return {
    modo: 'seleccion_multiple_ranked',
    ranking: ranking.map((id, idx) => ({ movimiento_id: id, posicion: idx + 1 })),
  }
}

export function isCompleto_seleccionRanked(ranking: string[], min?: number, max?: number): boolean {
  if (min !== undefined && ranking.length < min) return false
  if (max !== undefined && ranking.length > max) return false
  return ranking.length > 0
}
