'use client'

// Modo Secuenciación: 3 contenedores fase ("Fase 1 / Fase 2 / Fase 3" — labels
// vienen del modelo en instruccion_panel o fases default). Drag entre fases o
// reordenar dentro de la fase.
//
// Implementación con @dnd-kit: cada fase es un SortableContext con su lista,
// pero permite drag entre fases via DndContext cross-container. Esto requiere
// closestCorners + handle de arrastre del item entre listas.

import { useState } from 'react'
import { DndContext, closestCorners, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { MovimientoPE, CampoFichaMovimiento, RespuestaEstructurada } from '@/lib/types'
import type { GestionInventario } from './FichaMovimiento'

interface Props {
  movimientos: MovimientoPE[]
  campos: CampoFichaMovimiento[]
  fases: Array<{ fase: string; movimientos: string[] }>
  onChange: (fases: Array<{ fase: string; movimientos: string[] }>) => void
  // Labels de las fases — pueden venir del modelo via instruccion_panel
  // o usar defaults "Fase 1 / Fase 2 / Fase 3 / No clasificados".
  labelFases?: string[]
  // Mejora 2 — durante 3.B/3.C/3.D, las filas de fase muestran badge NUEVO/MOD.
  // Editar/Quitar NO se exponen acá (las filas son drag handles, conflicto UX);
  // si el user necesita modificar el inventario, usa el botón "+ Agregar" del
  // header del Panel o cambia de modo.
  gestion?: GestionInventario
}

const FASES_DEFAULT = ['Fase 1', 'Fase 2', 'Fase 3', 'No clasificados']

export function ModoSecuenciacion({ movimientos, campos, fases, onChange, labelFases, gestion }: Props) {
  const labels = labelFases && labelFases.length > 0 ? labelFases : FASES_DEFAULT

  // Asegurar que todas las fases existan en el state, incluso si vienen vacías
  const fasesNormalizadas = labels.map(l => {
    const existing = fases.find(f => f.fase === l)
    return existing ?? { fase: l, movimientos: [] }
  })

  // Movimientos no clasificados (no asignados a ninguna fase) van automáticamente
  // a la última fase (default "No clasificados") si no se categorizaron.
  const todosAsignados = new Set(fasesNormalizadas.flatMap(f => f.movimientos))
  const noClasificados = movimientos.filter(m => !todosAsignados.has(m.id)).map(m => m.id)
  const fasesConRestantes = fasesNormalizadas.map((f, idx) =>
    idx === fasesNormalizadas.length - 1 && f.fase === labels[labels.length - 1]
      ? { ...f, movimientos: [...f.movimientos, ...noClasificados] }
      : f
  )

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function findFase(id: string): string | null {
    return fasesConRestantes.find(f => f.movimientos.includes(id))?.fase ?? null
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeFase = findFase(String(active.id))
    const overFase = findFase(String(over.id)) ?? String(over.id)  // over puede ser el id de una fase si el container está vacío

    if (!activeFase || !overFase || activeFase === overFase) return
    // Mover entre fases
    const next = fasesConRestantes.map(f => ({ ...f, movimientos: [...f.movimientos] }))
    const fromFase = next.find(f => f.fase === activeFase)
    const toFase = next.find(f => f.fase === overFase)
    if (!fromFase || !toFase) return
    fromFase.movimientos = fromFase.movimientos.filter(id => id !== active.id)
    toFase.movimientos.push(String(active.id))
    onChange(next)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    // Reorder dentro de la misma fase
    const fase = findFase(String(active.id))
    if (!fase) return
    const next = fasesConRestantes.map(f => ({ ...f, movimientos: [...f.movimientos] }))
    const target = next.find(f => f.fase === fase)
    if (!target) return
    const oldIdx = target.movimientos.indexOf(String(active.id))
    const newIdx = target.movimientos.indexOf(String(over.id))
    if (oldIdx === -1 || newIdx === -1) return
    target.movimientos = arrayMove(target.movimientos, oldIdx, newIdx)
    onChange(next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={e => setActiveId(String(e.active.id))}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="space-y-3">
        {fasesConRestantes.map(f => (
          <FaseContainer
            key={f.fase}
            fase={f.fase}
            movimientoIds={f.movimientos}
            todosLosMovimientos={movimientos}
            campos={campos}
            activeId={activeId}
            gestion={gestion}
          />
        ))}
      </div>
    </DndContext>
  )
}

function FaseContainer({ fase, movimientoIds, todosLosMovimientos, campos: _campos, activeId, gestion }: {
  fase: string
  movimientoIds: string[]
  todosLosMovimientos: MovimientoPE[]
  campos: CampoFichaMovimiento[]
  activeId: string | null
  gestion?: GestionInventario
}) {
  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar/20 p-3">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-2">
        {fase} ({movimientoIds.length})
      </p>
      <SortableContext items={movimientoIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5 min-h-[40px]">
          {movimientoIds.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 italic px-2 py-2 border border-dashed border-sidebar-border rounded">
              Arrastrá movimientos acá
            </p>
          ) : (
            movimientoIds.map(id => {
              const m = todosLosMovimientos.find(mm => mm.id === id)
              if (!m) return null
              const cambio = gestion?.agregados.has(id) ? 'agregado' : gestion?.editados.has(id) ? 'editado' : undefined
              return <SortableRow key={id} movimiento={m} isActive={activeId === id} cambioReciente={cambio} />
            })
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableRow({ movimiento, isActive, cambioReciente }: { movimiento: MovimientoPE; isActive: boolean; cambioReciente?: 'agregado' | 'editado' }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: movimiento.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isActive ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="flex items-center gap-2 rounded-md bg-background/40 border border-sidebar-border px-2 py-1.5 cursor-grab active:cursor-grabbing">
      <span className="text-muted-foreground/60 text-[11px]">⋮⋮</span>
      <span className="font-mono text-[11px] text-muted-foreground/70">{movimiento.id}</span>
      <span className="flex-1 text-[12px] text-foreground truncate">{movimiento.nombre}</span>
      {cambioReciente && (
        <span className={`rounded px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider ${
          cambioReciente === 'agregado' ? 'bg-emerald-500 text-emerald-50' : 'bg-blue-500 text-blue-50'
        }`}>
          {cambioReciente === 'agregado' ? 'NUEVO' : 'MOD'}
        </span>
      )}
    </div>
  )
}

export function buildRespuesta_secuenciacion(fases: Array<{ fase: string; movimientos: string[] }>): RespuestaEstructurada {
  return { modo: 'secuenciacion', fases }
}

export function isCompleto_secuenciacion(fases: Array<{ fase: string; movimientos: string[] }>, todosLosMovimientos: MovimientoPE[]): boolean {
  // Todos los movimientos visibles deben estar en alguna fase
  const asignados = new Set(fases.flatMap(f => f.movimientos))
  return todosLosMovimientos.every(m => asignados.has(m.id))
}
