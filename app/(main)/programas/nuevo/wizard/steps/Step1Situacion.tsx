'use client'

import { useState } from 'react'

interface Props {
  situacion: string
  onChange: (v: string) => void
  onNext: () => Promise<void>
  saving?: boolean
}

export function Step1Situacion({ situacion, onChange, onNext, saving }: Props) {
  const [validating, setValidating] = useState(false)
  const [observaciones, setObservaciones] = useState<string | null>(null)
  const [didValidate, setDidValidate] = useState(false)

  async function handleContinuar() {
    if (!situacion.trim()) return
    if (didValidate) {
      await onNext()
      return
    }
    setValidating(true)
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: 1, contenido: situacion }),
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 1 de 8</p>
        <h2 className="text-xl font-bold text-foreground">La Situación</h2>
      </div>

      <blockquote className="border-l-2 border-primary pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Todo programa válido nace de una situación real.
          Sin un problema concreto que resolver, el programa
          no tiene razón de existir y difícilmente se ejecute."
        </p>
      </blockquote>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          ¿Qué situación real está justificando este programa?
        </label>
        <p className="text-xs text-muted-foreground">
          Describí concretamente qué está pasando que necesita resolverse.
        </p>
        <textarea
          rows={8}
          className="w-full bg-transparent border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 resize-none"
          placeholder={"Ej: Las ventas del equipo cayeron un 30% en los últimos 3 meses.\nEl equipo no tiene un proceso claro de seguimiento de prospectos\ny los clientes actuales no están siendo contactados regularmente.\nEsta situación está reduciendo directamente el ingreso mensual."}
          value={situacion}
          onChange={e => { onChange(e.target.value); setObservaciones(null); setDidValidate(false) }}
        />
      </div>

      {observaciones && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Observación de Gemini</p>
          <p className="text-sm text-yellow-200/80">{observaciones}</p>
          <p className="text-xs text-muted-foreground">Podés ajustarla o continuar de todas formas.</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleContinuar}
          disabled={!situacion.trim() || validating || saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {validating ? 'Validando...' : saving ? 'Guardando...' : didValidate ? 'Continuar de todas formas →' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
