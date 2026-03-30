'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { ObjetivoCard } from '@/components/objetivos/ObjetivoCard'
import { Badge } from '@/components/ui/Badge'
import type { Objetivo, Usuario, TipoObjetivo } from '@/lib/types'

const TIPO_GRUPOS: TipoObjetivo[] = [
  'Condicional',
  'Primario',
  'Vital',
  'Operativo',
  'Producción',
  'Mayor',
]

interface Props {
  objetivosIniciales: Objetivo[]
  usuariosMap: Record<string, Usuario>
  puedeReordenar: boolean
}

// ─── SortableObjetivoItem ─────────────────────────────────────────────────────

function SortableObjetivoItem({
  objetivo,
  responsable,
  puedeReordenar,
}: {
  objetivo: Objetivo
  responsable?: Usuario
  puedeReordenar: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: objetivo.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1">
      {puedeReordenar && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 flex items-center px-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
          tabIndex={-1}
          aria-label="Arrastrar para reordenar"
        >
          <GripVertical className="h-4 w-4" strokeWidth={1.5} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <ObjetivoCard
          objetivo={objetivo}
          responsable={responsable}
          cumplimientosRecientes={0}
          showTipo={false}
        />
      </div>
    </div>
  )
}

// ─── GrupoOrdenable ───────────────────────────────────────────────────────────

function GrupoOrdenable({
  tipo,
  objetivos,
  usuariosMap,
  puedeReordenar,
  onReorder,
}: {
  tipo: TipoObjetivo
  objetivos: Objetivo[]
  usuariosMap: Record<string, Usuario>
  puedeReordenar: boolean
  onReorder: (tipo: TipoObjetivo, oldIndex: number, newIndex: number) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = objetivos.findIndex((o) => o.id === active.id)
    const newIndex = objetivos.findIndex((o) => o.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(tipo, oldIndex, newIndex)
    }
  }

  if (objetivos.length === 0) return null

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Badge tipo={tipo} />
        <span>({objetivos.length})</span>
      </h2>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={objetivos.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {objetivos.map((obj) => (
              <SortableObjetivoItem
                key={obj.id}
                objetivo={obj}
                responsable={usuariosMap[obj.responsableId]}
                puedeReordenar={puedeReordenar}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ─── ObjetivosOrdenables (export) ─────────────────────────────────────────────

export function ObjetivosOrdenables({
  objetivosIniciales,
  usuariosMap,
  puedeReordenar,
}: Props) {
  const [objetivos, setObjetivos] = useState<Objetivo[]>(objetivosIniciales)
  const [error, setError] = useState<string | null>(null)

  const handleReorder = useCallback(
    async (tipo: TipoObjetivo, oldIndex: number, newIndex: number) => {
      // Get the current ordered list for this type
      const grupo = objetivos
        .filter((o) => o.tipo === tipo)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

      const nuevoGrupo = arrayMove(grupo, oldIndex, newIndex)

      // Optimistic update
      const prevObjetivos = objetivos
      setObjetivos((prev) => {
        const sinGrupo = prev.filter((o) => o.tipo !== tipo)
        const conOrden = nuevoGrupo.map((o, i) => ({ ...o, orden: i }))
        return [...sinGrupo, ...conOrden]
      })
      setError(null)

      // Persist to Airtable
      try {
        const actualizaciones = nuevoGrupo.map((o, i) => ({ id: o.id, orden: i }))
        const res = await fetch('/api/objetivos/reordenar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actualizaciones }),
        })
        if (!res.ok) throw new Error('Error al guardar el orden')
      } catch {
        // Revert on failure
        setObjetivos(prevObjetivos)
        setError('No se pudo guardar el nuevo orden. Intentá de nuevo.')
      }
    },
    [objetivos]
  )

  const objetivosPorTipo = (tipo: TipoObjetivo) =>
    objetivos
      .filter((o) => o.tipo === tipo)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}
      {TIPO_GRUPOS.map((tipo) => (
        <GrupoOrdenable
          key={tipo}
          tipo={tipo}
          objetivos={objetivosPorTipo(tipo)}
          usuariosMap={usuariosMap}
          puedeReordenar={puedeReordenar}
          onReorder={handleReorder}
        />
      ))}
    </div>
  )
}
