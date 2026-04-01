'use client'

import { useState } from 'react'
import type { ObjetivoWizard } from '../types'

interface Props {
  objetivos: ObjetivoWizard[]
  onChange: (obs: ObjetivoWizard[]) => void
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step6Vitales({ objetivos, onChange, onNext, onBack, saving }: Props) {
  const [confirmSkip, setConfirmSkip] = useState(false)

  function addVital() {
    onChange([...objetivos, {
      tempId: Math.random().toString(36).slice(2),
      nombre: '',
      descripcionDoingness: '',
      responsableId: '',
      aprobadorId: '',
      fechaLimite: '',
      esRepetible: false,
    }])
  }

  function updateNombre(tempId: string, nombre: string) {
    onChange(objetivos.map(o => o.tempId === tempId ? { ...o, nombre } : o))
  }

  function removeVital(tempId: string) {
    onChange(objetivos.filter(o => o.tempId !== tempId))
  }

  const conNombre = objetivos.filter(o => o.nombre.trim())

  async function handleContinuar() {
    if (conNombre.length === 0 && !confirmSkip) {
      setConfirmSkip(true)
      return
    }
    await onNext()
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 5 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos Vitales</h2>
      </div>

      <blockquote className="border-l-2 border-yellow-500 pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Las cosas que NO podés omitir sin que todo se caiga.
          Son casi políticas básicas de funcionamiento:
          si algo se atora, desatorarlo; no abandonar lo habitual
          mientras ejecutás este programa; mantener la comunicación
          activa. Si estos fallan, el programa muere."
        </p>
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm text-foreground font-medium">¿Qué condiciones son innegociables para este programa?</p>
        <p className="text-xs text-muted-foreground">Son principios permanentes, no tareas. No tienen responsable ni fecha — son del programa entero.</p>
        <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
          <p>Ejemplos:</p>
          <p>· "Si un objetivo se atora más de 3 días, escalar inmediatamente"</p>
          <p>· "No reducir las actividades habituales del equipo para ejecutar este programa"</p>
          <p>· "Mantener al menos una comunicación semanal con todos los responsables"</p>
        </div>
      </div>

      <div className="space-y-2">
        {objetivos.map((obj, i) => (
          <div key={obj.tempId} className="flex items-center gap-2">
            <span className="text-yellow-500 flex-shrink-0">◆</span>
            <input
              type="text"
              value={obj.nombre}
              onChange={e => updateNombre(obj.tempId, e.target.value)}
              placeholder={`Objetivo vital ${i + 1}`}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus={i === objetivos.length - 1 && !obj.nombre}
            />
            <button
              type="button"
              onClick={() => removeVital(obj.tempId)}
              className="text-muted-foreground hover:text-red-400 transition-colors p-1"
              aria-label="Eliminar"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addVital}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 mt-1"
        >
          <span className="text-yellow-500">◆</span> + Agregar objetivo vital
        </button>
      </div>

      {confirmSkip && conNombre.length === 0 && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 space-y-3">
          <p className="text-sm text-yellow-200/80">
            ¿Seguro? Los Vitales son los que más frecuentemente se omiten y los que más frecuentemente causan que el programa se caiga.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onNext()} className="px-3 py-1.5 text-xs bg-muted hover:bg-accent text-foreground rounded-md transition-colors">
              Sí, continuar sin vitales
            </button>
            <button type="button" onClick={() => setConfirmSkip(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Agregar al menos uno
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Atrás
        </button>
        {!(confirmSkip && conNombre.length === 0) && (
          <button
            type="button"
            onClick={handleContinuar}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Continuar →'}
          </button>
        )}
      </div>
    </div>
  )
}
