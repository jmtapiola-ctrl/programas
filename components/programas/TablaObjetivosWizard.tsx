'use client'

import React from 'react'
import { useState, useRef } from 'react'
import { Trash2, CheckCircle2, XCircle, Lightbulb, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ObjetivoWizard } from '@/app/(main)/programas/nuevo/wizard/types'
import type { TipoObjetivo, Usuario } from '@/lib/types'

interface Props {
  tipo: TipoObjetivo
  objetivos: ObjetivoWizard[]
  usuarios: Usuario[]
  programaFechaObjetivo?: string
  defaultResponsableId?: string
  defaultAprobadorId?: string
  onChange: (objetivos: ObjetivoWizard[]) => void
}

function manana(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

interface PanelProps {
  obj: ObjetivoWizard
  index: number
  tipo: TipoObjetivo
  usuarios: Usuario[]
  validating: boolean
  sugerenciaIgnorada: boolean
  inline?: boolean
  generatingNombre: boolean
  nombreEsSugerido: boolean
  onIgnorarSugerencia: () => void
  onAplicarTexto: (texto: string) => void
  onChange: (cambios: Partial<ObjetivoWizard>) => void
  onValidate: () => void
  onGenerateNombre: () => void
  onNombreManualEdit: () => void
  onClose: () => void
}

function GeminiIcon({ v, validating }: { v?: ObjetivoWizard['validacionGemini']; validating?: boolean }) {
  if (validating) return <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
  if (!v) return <span className="text-muted-foreground/30 text-base leading-none select-none">·</span>
  if (!v.valido) {
    return <span title={v.problema ?? ''}><XCircle className="h-3.5 w-3.5 text-red-400" /></span>
  }
  if (v.sugerencia) {
    return <span title={`Sugerencia: ${v.sugerencia}`}><Lightbulb className="h-3.5 w-3.5 text-yellow-400" /></span>
  }
  return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
}

function PanelDetalle({
  obj, index, tipo, usuarios,
  validating, sugerenciaIgnorada, inline,
  generatingNombre, nombreEsSugerido,
  onIgnorarSugerencia, onAplicarTexto,
  onChange, onValidate, onGenerateNombre, onNombreManualEdit, onClose,
}: PanelProps) {
  const tieneError = obj.validacionGemini && !obj.validacionGemini.valido
  const mostrarSugerencia = !!(obj.validacionGemini?.valido && obj.validacionGemini.sugerencia && !sugerenciaIgnorada)

  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'
  const inputCls = 'w-full bg-muted/20 border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors'
  const selectCls = `${inputCls} bg-background [&>option]:bg-background [&>option]:text-foreground`

  return (
    <div className={inline ? '' : 'flex flex-col h-full min-h-0'}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <span className="text-sm font-semibold text-foreground">Objetivo {index + 1}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div className={cn(
        'px-4 py-4 space-y-4',
        !inline && 'flex-1 overflow-y-auto'
      )}>

        {/* 1. Doingness — first, triggers name generation */}
        <div>
          <label className={labelCls}>
            ¿Cómo se hace? ¿Cuándo está hecho? <span className="text-red-400">*</span>
          </label>
          <textarea
            className={cn(inputCls, 'resize-none')}
            rows={4}
            placeholder="Describí la acción concreta y el resultado verificable. Ej: Enviar el informe de ventas del mes a todo el equipo antes del viernes 5 y recibir confirmación de lectura de cada uno."
            value={obj.descripcionDoingness}
            onChange={e => onChange({ descripcionDoingness: e.target.value, validacionGemini: undefined })}
            onBlur={() => {
              onValidate()
              onGenerateNombre()
            }}
          />
          {validating && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Validando con IA...</span>
            </div>
          )}
        </div>

        {/* Gemini: error */}
        {tieneError && obj.validacionGemini!.problema && (
          <div className="rounded-md border border-red-500/30 bg-red-900/10 px-3 py-2.5 space-y-2">
            <p className="text-xs text-red-300 flex items-start gap-1.5">
              <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              {obj.validacionGemini!.problema}
            </p>
            {obj.validacionGemini!.reescritura && (
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground italic">
                  "{obj.validacionGemini!.reescritura}"
                </p>
                <button
                  type="button"
                  onClick={() => onAplicarTexto(obj.validacionGemini!.reescritura!)}
                  className="text-xs font-medium text-red-300 hover:text-red-200 whitespace-nowrap transition-colors flex-shrink-0"
                >
                  Usar →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Gemini: suggestion */}
        {mostrarSugerencia && (
          <div className="rounded-md border border-yellow-600/30 bg-yellow-900/10 px-3 py-2.5 space-y-2">
            <p className="text-xs text-yellow-300 flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 flex-shrink-0" />
              Se puede mejorar:
            </p>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground italic">
                "{obj.validacionGemini!.sugerencia}"
              </p>
              <button
                type="button"
                onClick={() => {
                  onAplicarTexto(obj.validacionGemini!.sugerencia!)
                  onIgnorarSugerencia()
                }}
                className="text-xs font-medium text-yellow-300 hover:text-yellow-200 whitespace-nowrap transition-colors flex-shrink-0"
              >
                Usar →
              </button>
            </div>
            <button
              type="button"
              onClick={onIgnorarSugerencia}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Ignorar
            </button>
          </div>
        )}

        {/* 2. Nombre — second, with ✨ badge when AI-suggested */}
        <div>
          <label className={labelCls}>
            Nombre del objetivo <span className="text-red-400">*</span>
            {generatingNombre && (
              <span className="ml-2 text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> generando...
              </span>
            )}
            {!generatingNombre && nombreEsSugerido && (
              <span className="ml-2 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                ✨ Sugerido
              </span>
            )}
          </label>
          <input
            type="text"
            className={inputCls}
            placeholder="Nombre del objetivo..."
            value={obj.nombre}
            onChange={e => {
              onNombreManualEdit()
              onChange({ nombre: e.target.value })
            }}
          />
        </div>

        {/* 3. Responsable + Aprobador + Fecha en 3 columnas */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Responsable <span className="text-red-400">*</span></label>
            <select
              className={cn(selectCls, 'cursor-pointer')}
              value={obj.responsableId}
              onChange={e => onChange({ responsableId: e.target.value })}
            >
              <option value="">Sin asignar</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Aprobador</label>
            <select
              className={cn(selectCls, 'cursor-pointer')}
              value={obj.aprobadorId}
              onChange={e => onChange({ aprobadorId: e.target.value })}
            >
              <option value="">Sin aprobador</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fecha límite</label>
            <input
              type="date"
              className={inputCls}
              value={obj.fechaLimite}
              onChange={e => onChange({ fechaLimite: e.target.value })}
            />
          </div>
        </div>

        {/* 4. Checkboxes en fila horizontal */}
        <div className="flex items-center gap-6">
          {tipo === 'Operativo' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-orange-500"
                checked={obj.esCondicional ?? false}
                onChange={e => onChange({ esCondicional: e.target.checked, validacionGemini: undefined })}
              />
              Es condicional
            </label>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={obj.esRepetible}
              onChange={e => onChange({ esRepetible: e.target.checked })}
            />
            Objetivo repetible
          </label>
        </div>
        {tipo === 'Operativo' && obj.esCondicional && (
          <p className="text-xs text-muted-foreground -mt-2">
            El doingness debe empezar con "Si..." o describir la condición previa claramente.
          </p>
        )}

        {/* 5. Modo (Operativos desde el segundo) */}
        {tipo === 'Operativo' && index > 0 && (
          <div>
            <label className={labelCls}>Relación con el objetivo anterior</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => onChange({ modo: 'Secuencial' })}
                className={cn(
                  'flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors',
                  (!obj.modo || obj.modo === 'Secuencial')
                    ? 'bg-accent text-foreground border-border'
                    : 'bg-transparent text-muted-foreground border-border/50 hover:bg-accent/50'
                )}
              >
                → Secuencial
              </button>
              <button
                type="button"
                onClick={() => onChange({ modo: 'Paralelo' })}
                className={cn(
                  'flex-1 px-3 py-1.5 text-sm rounded-md border transition-colors',
                  obj.modo === 'Paralelo'
                    ? 'bg-blue-900 text-blue-200 border-blue-700'
                    : 'bg-transparent text-muted-foreground border-border/50 hover:bg-accent/50'
                )}
              >
                ≡ Paralelo
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {obj.modo === 'Paralelo'
                ? 'Este objetivo se puede ejecutar al mismo tiempo que el anterior'
                : 'Este objetivo empieza cuando el anterior esté completo'}
            </p>
          </div>
        )}

        {/* 6. Notas */}
        <div>
          <label className={labelCls}>Notas adicionales</label>
          <textarea
            className={cn(inputCls, 'resize-none')}
            rows={3}
            placeholder="Contexto, referencias, consideraciones especiales para quien ejecuta este objetivo..."
            value={obj.notas ?? ''}
            onChange={e => onChange({ notas: e.target.value })}
          />
        </div>
      </div>

      {/* Footer (side-panel mode only) */}
      {!inline && (
        <div className="px-4 py-3 border-t border-border flex-shrink-0">
          <p className="text-[11px] text-muted-foreground/50">
            Los cambios se guardan automáticamente en el programa al avanzar de paso.
          </p>
        </div>
      )}
    </div>
  )
}

export function TablaObjetivosWizard({ tipo, objetivos, usuarios, programaFechaObjetivo, defaultResponsableId, defaultAprobadorId, onChange }: Props) {
  const [selectedTempId, setSelectedTempId] = useState<string | null>(null)
  const [sugerenciaIgnorada, setSugerenciaIgnorada] = useState<Set<string>>(new Set())
  const [validatingIds, setValidatingIds] = useState<Set<string>>(new Set())
  const [generandoNombreIds, setGenerandoNombreIds] = useState<Set<string>>(new Set())
  const [nombresSugeridos, setNombresSugeridosState] = useState<Set<string>>(new Set())

  const validatingRef = useRef<Set<string>>(new Set())
  const nombresSugeridosRef = useRef<Set<string>>(new Set())

  // Always-fresh ref to avoid stale closures in async callbacks
  const objetivosRef = useRef(objetivos)
  objetivosRef.current = objetivos

  function syncNombresSugeridos(fn: (prev: Set<string>) => Set<string>) {
    setNombresSugeridosState(prev => {
      const next = fn(prev)
      nombresSugeridosRef.current = next
      return next
    })
  }

  const selectedObjetivo = objetivos.find(o => o.tempId === selectedTempId) ?? null

  function actualizarObjetivo(tempId: string, cambios: Partial<ObjetivoWizard>) {
    onChange(objetivosRef.current.map(o => o.tempId === tempId ? { ...o, ...cambios } : o))
  }

  function addRow() {
    const nuevo: ObjetivoWizard = {
      tempId: Math.random().toString(36).slice(2),
      nombre: '',
      descripcionDoingness: '',
      responsableId: defaultResponsableId ?? '',
      aprobadorId: defaultAprobadorId ?? '',
      fechaLimite: manana(),
      esRepetible: false,
      notas: '',
    }
    onChange([...objetivosRef.current, nuevo])
    setSelectedTempId(nuevo.tempId)
  }

  function removeRow(tempId: string) {
    onChange(objetivosRef.current.filter(o => o.tempId !== tempId))
    if (selectedTempId === tempId) setSelectedTempId(null)
    syncNombresSugeridos(prev => { const s = new Set(prev); s.delete(tempId); return s })
  }

  async function validateDoingness(tempId: string) {
    const obj = objetivosRef.current.find(o => o.tempId === tempId)
    if (!obj || !obj.descripcionDoingness.trim() || !obj.nombre.trim()) return
    if (validatingRef.current.has(tempId)) return
    validatingRef.current.add(tempId)
    setValidatingIds(prev => new Set([...prev, tempId]))
    actualizarObjetivo(tempId, { validacionGemini: undefined })
    try {
      const tipoParaValidar = tipo === 'Operativo' && obj.esCondicional ? 'Condicional' : tipo
      const res = await fetch('/api/validar-objetivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: obj.nombre,
          descripcionDoingness: obj.descripcionDoingness,
          tipo: tipoParaValidar,
        }),
      })
      const data = await res.json()
      actualizarObjetivo(tempId, { validacionGemini: data })
      if (data.sugerencia) {
        setSugerenciaIgnorada(prev => {
          const next = new Set(prev)
          next.delete(tempId)
          return next
        })
      }
    } catch {}
    validatingRef.current.delete(tempId)
    setValidatingIds(prev => {
      const next = new Set(prev)
      next.delete(tempId)
      return next
    })
  }

  async function generateNombreObj(tempId: string) {
    const obj = objetivosRef.current.find(o => o.tempId === tempId)
    if (!obj || !obj.descripcionDoingness.trim()) return
    // Only generate if nombre is empty or was previously AI-suggested
    if (obj.nombre.trim() && !nombresSugeridosRef.current.has(tempId)) return

    setGenerandoNombreIds(prev => new Set([...prev, tempId]))
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paso: 'generar_nombre_objetivo',
          contenido: obj.descripcionDoingness,
          contexto: { tipo },
        }),
      })
      const data = await res.json()
      const nombreSugerido: string = data.nombreSugerido ?? ''
      if (nombreSugerido) {
        const currentObj = objetivosRef.current.find(o => o.tempId === tempId)
        // Only apply if nombre is still empty or still the previous suggestion
        if (currentObj && (!currentObj.nombre.trim() || nombresSugeridosRef.current.has(tempId))) {
          actualizarObjetivo(tempId, { nombre: nombreSugerido })
          syncNombresSugeridos(prev => new Set([...prev, tempId]))
        }
      }
    } catch {}
    setGenerandoNombreIds(prev => {
      const next = new Set(prev)
      next.delete(tempId)
      return next
    })
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTableElement>) {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t')) return
    e.preventDefault()
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    const newRows: ObjetivoWizard[] = lines.map(line => {
      const cols = line.split('\t')
      const [nombre = '', doingness = '', respNombre = '', fecha = ''] = cols
      const responsable = usuarios.find(u =>
        u.nombre.toLowerCase().includes(respNombre.trim().toLowerCase())
      )
      return {
        tempId: Math.random().toString(36).slice(2),
        nombre: nombre.trim(),
        descripcionDoingness: doingness.trim(),
        responsableId: responsable?.id ?? (defaultResponsableId ?? ''),
        aprobadorId: defaultAprobadorId ?? '',
        fechaLimite: fecha.trim() || manana(),
        esRepetible: false,
        notas: '',
      }
    }).filter(r => r.nombre)
    if (newRows.length > 0) {
      onChange([...objetivosRef.current, ...newRows])
      setSelectedTempId(newRows[0].tempId)
    }
  }

  const inputCls = 'w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground/40 outline-none focus:bg-accent/30 rounded px-1 py-0.5 transition-colors'
  const selectCls = `${inputCls} bg-background [&>option]:bg-background [&>option]:text-foreground`

  // Number of table columns: # + Nombre + Responsable + Fecha + (Cond. if Operativo) + ✓ + Delete
  const colCount = tipo === 'Operativo' ? 7 : 6

  function getPanelProps(obj: ObjetivoWizard): PanelProps {
    return {
      obj,
      index: objetivos.indexOf(obj),
      tipo,
      usuarios,
      validating: validatingIds.has(obj.tempId),
      sugerenciaIgnorada: sugerenciaIgnorada.has(obj.tempId),
      generatingNombre: generandoNombreIds.has(obj.tempId),
      nombreEsSugerido: nombresSugeridos.has(obj.tempId),
      onIgnorarSugerencia: () => setSugerenciaIgnorada(prev => new Set([...prev, obj.tempId])),
      onAplicarTexto: (texto) => actualizarObjetivo(obj.tempId, { descripcionDoingness: texto, validacionGemini: undefined }),
      onChange: (cambios) => actualizarObjetivo(obj.tempId, cambios),
      onValidate: () => validateDoingness(obj.tempId),
      onGenerateNombre: () => generateNombreObj(obj.tempId),
      onNombreManualEdit: () => syncNombresSugeridos(prev => { const s = new Set(prev); s.delete(obj.tempId); return s }),
      onClose: () => setSelectedTempId(null),
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm" onPaste={handlePaste}>
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="w-8 py-2 px-3 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Nombre del objetivo</th>
            <th className="w-36 py-2 px-3 text-left text-xs font-medium text-muted-foreground">Responsable</th>
            <th className="w-32 py-2 px-3 text-left text-xs font-medium text-muted-foreground">Fecha límite</th>
            {tipo === 'Operativo' && (
              <th className="w-12 py-2 px-1 text-center text-xs font-medium text-muted-foreground" title="¿Es condicional?">Cond.</th>
            )}
            <th className="w-10 py-2 px-1 text-center text-xs font-medium text-muted-foreground">✓</th>
            <th className="w-8 py-2 px-1"></th>
          </tr>
        </thead>
        <tbody>
          {objetivos.length === 0 ? (
            <tr className="border-b border-border/30">
              <td className="py-2 px-3 text-muted-foreground/30 text-xs">1</td>
              <td className="py-2 px-2 text-muted-foreground/30 text-sm italic">Nombre del objetivo...</td>
              <td className="py-2 px-2 text-muted-foreground/30 text-sm italic">Sin asignar</td>
              <td className="py-2 px-2 text-muted-foreground/30 text-sm italic">—</td>
              <td /><td />
            </tr>
          ) : objetivos.map((obj, i) => {
            const isSelected = obj.tempId === selectedTempId
            const isValidating = validatingIds.has(obj.tempId)
            return (
              <React.Fragment key={obj.tempId}>
                {/* Modo connector (Operativos only) */}
                {i > 0 && tipo === 'Operativo' && (
                  <tr className="pointer-events-none select-none">
                    <td className="py-0 px-3 w-8">
                      <div className="flex flex-col items-center leading-none text-center" style={{ minHeight: '20px' }}>
                        {obj.modo === 'Paralelo' ? (
                          <span className="text-blue-400 font-mono text-sm leading-none">║</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground text-xs leading-none">│</span>
                            <span className="text-muted-foreground text-[9px] leading-none">▼</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td colSpan={colCount - 1} />
                  </tr>
                )}

                {/* Main row */}
                <tr
                  onClick={() => setSelectedTempId(isSelected ? null : obj.tempId)}
                  className={cn(
                    'border-b border-border/50 hover:bg-muted/20 transition-colors group cursor-pointer',
                    isSelected && 'bg-accent/20 border-l-4 border-l-primary',
                    tipo === 'Operativo' && obj.esCondicional && !isSelected && 'border-l-2 border-l-orange-500/50 border-l-dashed'
                  )}
                >
                  <td className="py-1.5 px-3 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
                    <input
                      className={inputCls}
                      placeholder="Nombre del objetivo..."
                      value={obj.nombre}
                      onChange={e => {
                        syncNombresSugeridos(prev => { const s = new Set(prev); s.delete(obj.tempId); return s })
                        actualizarObjetivo(obj.tempId, { nombre: e.target.value })
                      }}
                    />
                  </td>
                  <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
                    <select
                      className={cn(selectCls, 'cursor-pointer')}
                      value={obj.responsableId}
                      onChange={e => actualizarObjetivo(obj.tempId, { responsableId: e.target.value })}
                    >
                      <option value="">Sin asignar</option>
                      {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="date"
                      className={inputCls}
                      value={obj.fechaLimite}
                      onChange={e => actualizarObjetivo(obj.tempId, { fechaLimite: e.target.value })}
                    />
                  </td>
                  {tipo === 'Operativo' && (
                    <td className="py-1.5 px-1 text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-border accent-orange-500"
                        checked={obj.esCondicional ?? false}
                        onChange={e => actualizarObjetivo(obj.tempId, { esCondicional: e.target.checked, validacionGemini: undefined })}
                        title="Marcar como condicional"
                      />
                    </td>
                  )}
                  <td className="py-1.5 px-1 text-center" onClick={e => e.stopPropagation()}>
                    <GeminiIcon v={obj.validacionGemini} validating={isValidating} />
                  </td>
                  <td className="py-1.5 px-1" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => removeRow(obj.tempId)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>

                {/* Accordion: expanded detail below selected row */}
                {isSelected && (
                  <tr className="border-b border-border/50">
                    <td colSpan={colCount} className="p-0 bg-muted/5">
                      <PanelDetalle {...getPanelProps(obj)} inline />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-border/50">
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <span className="text-base leading-none">+</span> Agregar objetivo
        </button>
      </div>
    </div>
  )
}
