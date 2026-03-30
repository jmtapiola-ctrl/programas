'use client'

import { useRef } from 'react'
import { Trash2, CheckCircle2, XCircle, Lightbulb, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ObjetivoWizard } from '@/app/(main)/programas/nuevo/wizard/types'
import type { Usuario } from '@/lib/types'

interface Props {
  objetivos: ObjetivoWizard[]
  onChange: (obs: ObjetivoWizard[]) => void
  usuarios: Usuario[]
  defaultFechaLimite?: string
}

function ValidationIcon({ v }: { v?: ObjetivoWizard['validacionGemini'] }) {
  if (!v) return null
  if (!v.valido) return (
    <span title={v.errores.map(e => e.descripcion).join(' · ')}>
      <XCircle className="h-3.5 w-3.5 text-red-400" />
    </span>
  )
  if (v.sugerencia) return (
    <span title={`Sugerencia: ${v.sugerencia}`}>
      <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
    </span>
  )
  return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
}

export function TablaObjetivosWizard({ objetivos, onChange, usuarios, defaultFechaLimite }: Props) {
  const validatingRef = useRef<Set<string>>(new Set())

  function update(tempId: string, partial: Partial<ObjetivoWizard>) {
    onChange(objetivos.map(o => o.tempId === tempId ? { ...o, ...partial } : o))
  }

  function addRow() {
    onChange([...objetivos, {
      tempId: Math.random().toString(36).slice(2),
      nombre: '',
      descripcionDoingness: '',
      responsableId: '',
      aprobadorId: '',
      fechaLimite: defaultFechaLimite ?? '',
      esRepetible: false,
    }])
  }

  function removeRow(tempId: string) {
    onChange(objetivos.filter(o => o.tempId !== tempId))
  }

  async function validateDoingness(obj: ObjetivoWizard) {
    if (!obj.descripcionDoingness.trim() || !obj.nombre.trim()) return
    if (validatingRef.current.has(obj.tempId)) return
    validatingRef.current.add(obj.tempId)
    update(obj.tempId, { validacionGemini: undefined })
    try {
      const res = await fetch('/api/validar-objetivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: obj.nombre, descripcionDoingness: obj.descripcionDoingness, tipo: 'Operativo' }),
      })
      const data = await res.json()
      update(obj.tempId, { validacionGemini: data })
    } catch {}
    validatingRef.current.delete(obj.tempId)
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
        responsableId: responsable?.id ?? '',
        aprobadorId: '',
        fechaLimite: fecha.trim() || (defaultFechaLimite ?? ''),
        esRepetible: false,
      }
    }).filter(r => r.nombre)
    if (newRows.length > 0) onChange([...objetivos, ...newRows])
  }

  function handleKeyDown(e: React.KeyboardEvent, tempId: string, isLastField: boolean) {
    if (e.key === 'Enter' && isLastField) {
      e.preventDefault()
      addRow()
    }
  }

  const inputCls = "w-full bg-transparent text-foreground text-sm placeholder:text-muted-foreground/40 outline-none focus:bg-accent/30 rounded px-1 py-0.5 transition-colors"

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm" onPaste={handlePaste}>
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="w-8 py-2 px-3 text-left text-xs font-medium text-muted-foreground">#</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Nombre del objetivo</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Doingness</th>
            <th className="w-36 py-2 px-3 text-left text-xs font-medium text-muted-foreground">Responsable</th>
            <th className="w-32 py-2 px-3 text-left text-xs font-medium text-muted-foreground">Fecha límite</th>
            <th className="w-10 py-2 px-1 text-center text-xs font-medium text-muted-foreground">✓</th>
            <th className="w-8 py-2 px-1"></th>
          </tr>
        </thead>
        <tbody>
          {objetivos.map((obj, i) => {
            const isValidating = validatingRef.current.has(obj.tempId)
            return (
              <tr key={obj.tempId} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                <td className="py-1.5 px-3 text-muted-foreground text-xs">{i + 1}</td>
                <td className="py-1.5 px-2">
                  <input
                    className={inputCls}
                    placeholder="Nombre del objetivo..."
                    value={obj.nombre}
                    onChange={e => update(obj.tempId, { nombre: e.target.value })}
                  />
                </td>
                <td className="py-1.5 px-2">
                  <input
                    className={inputCls}
                    placeholder="¿Cuándo está hecho?"
                    value={obj.descripcionDoingness}
                    onChange={e => update(obj.tempId, { descripcionDoingness: e.target.value, validacionGemini: undefined })}
                    onBlur={() => validateDoingness(obj)}
                  />
                </td>
                <td className="py-1.5 px-2">
                  <select
                    className={cn(inputCls, "cursor-pointer")}
                    value={obj.responsableId}
                    onChange={e => update(obj.tempId, { responsableId: e.target.value })}
                  >
                    <option value="">Sin asignar</option>
                    {usuarios.map(u => (
                      <option key={u.id} value={u.id}>{u.nombre}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 px-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={obj.fechaLimite}
                    onChange={e => update(obj.tempId, { fechaLimite: e.target.value })}
                    onKeyDown={e => handleKeyDown(e, obj.tempId, true)}
                  />
                </td>
                <td className="py-1.5 px-1 text-center">
                  {isValidating
                    ? <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin mx-auto" />
                    : <ValidationIcon v={obj.validacionGemini} />
                  }
                </td>
                <td className="py-1.5 px-1">
                  <button
                    type="button"
                    onClick={() => removeRow(obj.tempId)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
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
      {objetivos.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground/60">
          Hacé click en "+ Agregar objetivo" o pegá filas desde Excel (Nombre · Doingness · Responsable · Fecha)
        </div>
      )}
    </div>
  )
}
