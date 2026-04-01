'use client'

import { useState } from 'react'

interface Props {
  situacion: string
  proposito: string
  onChange: (v: string) => void
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step2Proposito({ situacion, proposito, onChange, onNext, onBack, saving }: Props) {
  const [validating, setValidating] = useState(false)
  const [observaciones, setObservaciones] = useState<string | null>(null)
  const [didValidate, setDidValidate] = useState(false)

  async function handleContinuar() {
    if (!proposito.trim()) return
    if (didValidate) {
      await onNext()
      return
    }
    setValidating(true)
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: 2, contenido: proposito, contexto: situacion }),
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 2 de 8</p>
        <h2 className="text-xl font-bold text-foreground">El Propósito</h2>
      </div>

      <blockquote className="border-l-2 border-primary pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "El propósito es el motor del programa. Tiene que ser
          algo que genuinamente valga la pena hacer — si al
          leerlo no sentís que moviliza al equipo, no va a
          ejecutarse."
        </p>
      </blockquote>

      {situacion && (
        <div className="rounded-md border border-orange-800/40 bg-orange-900/10 px-4 py-3">
          <p className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-1">Situación (paso 1)</p>
          <p className="text-sm text-muted-foreground">{situacion}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          ¿Cuál es el propósito de este programa?
        </label>
        <p className="text-xs text-muted-foreground">
          No el resultado — el motor. ¿Por qué tiene que existir este programa?
        </p>
        <p className="text-xs text-muted-foreground/60 italic">
          Si al leer el propósito no sentís que vale la pena hacerlo, no va a ejecutarse. Tiene que ser algo que movilice al equipo.
        </p>
        <textarea
          rows={5}
          className="w-full bg-transparent border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 resize-none"
          placeholder={"Ej: Que el equipo de ventas tenga un sistema claro y repetible\npara generar ingresos consistentes, y que cada vendedor sepa\nexactamente qué hacer cada día para lograrlo."}
          value={proposito}
          onChange={e => { onChange(e.target.value); setObservaciones(null); setDidValidate(false) }}
        />
      </div>

      {observaciones && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">Observación de Gemini</p>
          <p className="text-sm text-yellow-200/80">{observaciones}</p>
          <p className="text-xs text-muted-foreground">Podés ajustarlo o continuar de todas formas.</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Atrás
        </button>
        <button
          type="button"
          onClick={handleContinuar}
          disabled={!proposito.trim() || validating || saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {validating ? 'Validando...' : saving ? 'Guardando...' : didValidate ? 'Continuar de todas formas →' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
