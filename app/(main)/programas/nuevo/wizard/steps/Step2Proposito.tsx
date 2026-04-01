'use client'

import { useState, useRef } from 'react'

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
  objetivoMayor: string
  onChange: (v: string) => void
  onChangeObjetivoMayor: (v: string) => void
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

const textareaCls = 'w-full bg-transparent border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 resize-none'

export function Step2Proposito({
  situacion, proposito, objetivoMayor,
  onChange, onChangeObjetivoMayor,
  onNext, onBack, saving,
}: Props) {
  const [estadoProposito, setEstadoProposito] = useState<'idle' | 'validando' | 'valido' | 'invalido'>('idle')
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [generandoObjetivoMayor, setGenerandoObjetivoMayor] = useState(false)
  const [esSugerido, setEsSugerido] = useState(false)
  const [validandoContinuar, setValidandoContinuar] = useState(false)
  const [errorObjetivoMayor, setErrorObjetivoMayor] = useState<string | null>(null)
  const objetivoMayorRef = useRef<HTMLTextAreaElement>(null)

  async function handleSugerirObjetivoMayor() {
    if (!proposito.trim()) return

    // PASO A: validar propósito
    setEstadoProposito('validando')
    let resultado: Analisis
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: 2, contenido: proposito, contexto: { situacion } }),
      })
      resultado = await res.json()
      setAnalisis(resultado)
    } catch {
      setEstadoProposito('idle')
      return
    }

    if (!resultado.fuerte) {
      setEstadoProposito('invalido')
      return
    }

    setEstadoProposito('valido')

    // PASO B: generar Objetivo Mayor
    setGenerandoObjetivoMayor(true)
    try {
      const res = await fetch('/api/wizard-validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: 'generar_objetivo_mayor', contenido: proposito, contexto: { situacion } }),
      })
      const data = await res.json()
      if (data.objetivoMayorSugerido) {
        onChangeObjetivoMayor(data.objetivoMayorSugerido)
        setEsSugerido(true)
        setTimeout(() => objetivoMayorRef.current?.focus(), 100)
      }
    } catch {
      // silencioso — el usuario puede escribir manualmente
    } finally {
      setGenerandoObjetivoMayor(false)
    }
  }

  async function handleContinuar() {
    if (!proposito.trim() || !objetivoMayor.trim()) return
    setValidandoContinuar(true)
    setErrorObjetivoMayor(null)

    try {
      // Validar propósito si aún no fue evaluado
      let propositoValido = estadoProposito === 'valido'

      if (estadoProposito === 'idle') {
        const res = await fetch('/api/wizard-validar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paso: 2, contenido: proposito, contexto: { situacion } }),
        })
        const a: Analisis = await res.json()
        setAnalisis(a)
        if (!a.fuerte) {
          setEstadoProposito('invalido')
          return
        }
        setEstadoProposito('valido')
        propositoValido = true
      }

      if (!propositoValido) return

      // Validar Objetivo Mayor
      const resObj = await fetch('/api/validar-objetivo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: objetivoMayor, tipo: 'Mayor', descripcionDoingness: objetivoMayor }),
      })
      const validacion = await resObj.json()
      if (!validacion.valido && validacion.problema) {
        setErrorObjetivoMayor(validacion.problema)
        return
      }

      await onNext()
    } catch {
      await onNext()
    } finally {
      setValidandoContinuar(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 2 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Propósito y Objetivo Mayor</h2>
      </div>

      {/* Situación — solo lectura */}
      {situacion && (
        <div className="border-l-2 border-primary/50 pl-4 py-2 bg-muted/30 rounded-r-md pr-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Situación</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{situacion}</p>
        </div>
      )}

      {/* Dos columnas */}
      <div className="grid grid-cols-2 gap-6">

        {/* ── Columna izquierda: Propósito ── */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-0.5">Propósito</label>
            <p className="text-xs text-muted-foreground">
              El motor del programa. ¿Por qué tiene que existir?
              Si there's a will, there's a way — el propósito pone el <em>WILL</em>.
            </p>
          </div>

          <textarea
            rows={5}
            className={textareaCls}
            placeholder={"Ej: Que el equipo de ventas tenga un sistema claro y repetible\npara generar ingresos consistentes."}
            value={proposito}
            onChange={e => {
              onChange(e.target.value)
              setEstadoProposito('idle')
              setAnalisis(null)
            }}
          />

          {/* Resultado de validación */}
          {estadoProposito === 'validando' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-3 h-3 border border-muted-foreground/40 border-t-primary rounded-full animate-spin" />
              Analizando...
            </div>
          )}
          {(estadoProposito === 'valido' || estadoProposito === 'invalido') && analisis && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(analisis.dimensiones) as [string, boolean][]).map(([key, valor]) => (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
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
              {analisis.observacion && (
                <div className="rounded-md border border-yellow-600/40 bg-yellow-900/15 px-3 py-2">
                  <p className="text-xs text-yellow-200/90">⚠ {analisis.observacion}</p>
                </div>
              )}
            </div>
          )}

          {/* Botón principal */}
          <button
            type="button"
            onClick={handleSugerirObjetivoMayor}
            disabled={!proposito.trim() || estadoProposito === 'validando' || generandoObjetivoMayor}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-primary/50 text-primary hover:bg-primary/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>✨</span>
            {estadoProposito === 'validando'
              ? 'Validando propósito...'
              : generandoObjetivoMayor
              ? 'Generando...'
              : 'Sugerir Objetivo Mayor'}
          </button>
        </div>

        {/* ── Columna derecha: Objetivo Mayor ── */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-0.5">Objetivo Mayor</label>
            <p className="text-xs text-muted-foreground">
              El resultado concreto y verificable. ¿Qué logramos cuando el programa esté completo?
              Algo que podás mirar y decir "esto está hecho".
            </p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Propósito → el <em>POR QUÉ</em> &nbsp;·&nbsp; Objetivo Mayor → el <em>QUÉ</em> concreto y medible
            </p>
          </div>

          {generandoObjetivoMayor ? (
            <div className="animate-pulse border border-input rounded-md px-3 py-3 h-[122px] space-y-2.5">
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-4/5" />
              <div className="h-3 bg-muted rounded w-3/5" />
            </div>
          ) : (
            <div className="relative">
              <textarea
                ref={objetivoMayorRef}
                rows={5}
                className={textareaCls}
                placeholder={"Se completará automáticamente al verificar el propósito,\no podés escribirlo directamente."}
                value={objetivoMayor}
                onChange={e => {
                  onChangeObjetivoMayor(e.target.value)
                  setEsSugerido(false)
                  setErrorObjetivoMayor(null)
                }}
              />
              {esSugerido && (
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary border border-primary/30 pointer-events-none">
                  ✨ Sugerido
                </span>
              )}
            </div>
          )}

          {errorObjetivoMayor && (
            <div className="rounded-md border border-red-600/40 bg-red-900/15 px-3 py-2">
              <p className="text-xs text-red-300">⚠ {errorObjetivoMayor}</p>
            </div>
          )}
        </div>
      </div>

      {/* Botones de navegación */}
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
          disabled={!proposito.trim() || !objetivoMayor.trim() || validandoContinuar || saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {validandoContinuar ? 'Validando...' : saving ? 'Guardando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
