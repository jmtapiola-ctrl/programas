'use client'

import { useState } from 'react'
import type { Usuario } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Props {
  situacion: string
  proposito: string
  nombre: string
  nombreSugerido?: string
  responsableId: string
  aprobadorId: string
  fechaInicio: string
  fechaObjetivo: string
  usuarios: Usuario[]
  onChange: (partial: Record<string, string>) => void
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

const inputCls = "w-full bg-transparent border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"

export function Step3Organizacion({
  situacion, proposito, nombre, nombreSugerido,
  responsableId, aprobadorId, fechaInicio, fechaObjetivo,
  usuarios, onChange, onNext, onBack, saving,
}: Props) {
  const [validating, setValidating] = useState(false)
  const [observaciones, setObservaciones] = useState<string | null>(null)
  const [didValidate, setDidValidate] = useState(false)
  const activos = usuarios.filter(u => u.activo)

  const esSugerido = !!nombreSugerido && nombre === nombreSugerido

  async function handleContinuar() {
    if (!nombre.trim() || !responsableId) return
    if (didValidate) {
      await onNext()
      return
    }
    setValidating(true)
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paso: 3,
          contenido: { nombre },
          contexto: { situacion, proposito },
        }),
      })
      const data = await res.json()
      if (data.observaciones) {
        setObservaciones(data.observaciones)
        setDidValidate(true)
      } else {
        await onNext()
      }
    } catch {
      await onNext()
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 3 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Nombre y Organización</h2>
      </div>

      <blockquote className="border-l-2 border-primary pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Sin responsabilidad clara, ningún programa avanza.
          Definir quién está a cargo y quién aprueba es la base
          que hace posible todo lo demás."
        </p>
      </blockquote>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Nombre del programa *</label>
          <div className="relative">
            <input
              className={inputCls}
              placeholder="Ej: Expansión de Ventas Q2 2026"
              value={nombre}
              onChange={e => {
                onChange({ nombre: e.target.value })
                setObservaciones(null)
                setDidValidate(false)
              }}
            />
            {esSugerido && (
              <span className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary border border-primary/30 pointer-events-none">
                ✨ Sugerido
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Responsable del programa *</label>
            <Select value={responsableId} onValueChange={v => onChange({ responsableId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {activos.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Aprobador (opcional)</label>
            <Select value={aprobadorId || '_none'} onValueChange={v => onChange({ aprobadorId: v === '_none' ? '' : v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sin asignar</SelectItem>
                {activos.filter(u => u.rol === 'Ejecutivo').map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Fecha de inicio</label>
            <input type="date" className={inputCls} value={fechaInicio} onChange={e => onChange({ fechaInicio: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Fecha de completación esperada</label>
            <input type="date" className={inputCls} value={fechaObjetivo} onChange={e => onChange({ fechaObjetivo: e.target.value })} />
          </div>
        </div>
      </div>

      {observaciones && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Observación</p>
          <p className="text-sm text-yellow-200/80">{observaciones}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Atrás
        </button>
        <button
          type="button"
          onClick={handleContinuar}
          disabled={!nombre.trim() || !responsableId || validating || saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {validating ? 'Validando...' : saving ? 'Creando programa...' : didValidate ? 'Continuar de todas formas →' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
