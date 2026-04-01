'use client'

import { useState } from 'react'

interface Analisis {
  fuerte: boolean
  dimensiones: {
    concreto: boolean
    energico: boolean
    vale_la_pena: boolean
    movilizador: boolean
  }
  observacion: string | null
  sugerencia: string | null
}

interface Props {
  situacion: string
  proposito: string
  onChange: (v: string) => void
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

const DIMENSIONES_LABELS: Record<string, string> = {
  concreto: 'Concreto',
  energico: 'Enérgico',
  vale_la_pena: 'Vale la pena',
  movilizador: 'Movilizador',
}

export function Step2Proposito({ situacion, proposito, onChange, onNext, onBack, saving }: Props) {
  const [momento, setMomento] = useState<'edicion' | 'confirmacion'>('edicion')
  const [validando, setValidando] = useState(false)
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [sugerenciaEditable, setSugerenciaEditable] = useState('')

  async function handleContinuar() {
    if (!proposito.trim()) return
    setValidando(true)
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: 2, contenido: proposito, contexto: { situacion } }),
      })
      const data: Analisis = await res.json()
      setAnalisis(data)
      setSugerenciaEditable(data.sugerencia ?? '')
      setMomento('confirmacion')
    } catch {
      await onNext()
    } finally {
      setValidando(false)
    }
  }

  function handleUsarSugerencia() {
    onChange(sugerenciaEditable)
    setMomento('edicion')
    setAnalisis(null)
  }

  // ── MOMENTO 2: CONFIRMACIÓN ──────────────────────────────────────────
  if (momento === 'confirmacion' && analisis) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 2 de 8</p>
          <h2 className="text-xl font-bold text-foreground">¿Este propósito va a mover a tu equipo?</h2>
        </div>

        {/* Propósito destacado */}
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-6 py-5 text-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Tu propósito</p>
          <p className="text-base text-foreground italic leading-relaxed">"{proposito}"</p>
        </div>

        {/* 4 dimensiones */}
        <div className="flex flex-wrap gap-2">
          {(Object.entries(analisis.dimensiones) as [string, boolean][]).map(([key, valor]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                valor
                  ? 'bg-green-900/40 text-green-300 border-green-700/50'
                  : 'bg-red-900/40 text-red-300 border-red-700/50'
              }`}
            >
              <span>{valor ? '✓' : '✗'}</span>
              {DIMENSIONES_LABELS[key] ?? key}
            </span>
          ))}
        </div>

        {/* Observación y sugerencia si no es fuerte */}
        {analisis.observacion && (
          <div className="rounded-md border border-yellow-600/40 bg-yellow-900/15 px-4 py-4 space-y-3">
            <p className="text-sm text-yellow-200/90">
              <span className="font-semibold">⚠ </span>{analisis.observacion}
            </p>
            {analisis.sugerencia && (
              <div className="space-y-2 pt-1 border-t border-yellow-700/30">
                <p className="text-xs font-medium text-muted-foreground pt-2">¿Qué te parece esta versión?</p>
                <textarea
                  rows={4}
                  className="w-full bg-transparent border border-yellow-600/40 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 resize-none"
                  value={sugerenciaEditable}
                  onChange={e => setSugerenciaEditable(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleUsarSugerencia}
                  className="text-xs font-medium text-yellow-400 hover:text-yellow-300 transition-colors border border-yellow-600/40 rounded px-3 py-1.5"
                >
                  Usar esta versión
                </button>
              </div>
            )}
          </div>
        )}

        {/* Pregunta central */}
        <div className="border-t border-b border-border py-4 text-center">
          <p className="text-sm text-foreground">
            ¿Este propósito va a hacer que las personas involucradas{' '}
            <strong className="text-foreground">quieran ejecutar el programa</strong>?
          </p>
        </div>

        {/* Botones */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setMomento('edicion')}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Quiero mejorarlo
          </button>
          <button
            type="button"
            onClick={() => onNext()}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving
              ? 'Guardando...'
              : analisis.fuerte
              ? 'Sí, es sólido → Continuar'
              : 'Continuar de todas formas →'}
          </button>
        </div>
      </div>
    )
  }

  // ── MOMENTO 1: EDICIÓN ───────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 2 de 8</p>
        <h2 className="text-xl font-bold text-foreground">El Propósito</h2>
      </div>

      <blockquote className="border-l-2 border-primary pl-4 space-y-2">
        <p className="text-sm text-muted-foreground italic">
          "El propósito es el motor del programa. Tiene que ser algo que genuinamente valga la pena hacer — si al
          leerlo no sentís que moviliza al equipo, no va a ejecutarse."
        </p>
        <p className="text-xs text-muted-foreground/70">
          Como dicen los ingleses: "If there's a will, there's a way." El propósito pone el <em>WILL</em> — la voluntad.
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
          onChange={e => { onChange(e.target.value); setAnalisis(null) }}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={handleContinuar}
          disabled={!proposito.trim() || validando || saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {validando ? 'Analizando...' : saving ? 'Guardando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
