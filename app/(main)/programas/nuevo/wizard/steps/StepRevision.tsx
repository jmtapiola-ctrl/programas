'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { WizardState, ObjetivoWizard } from '../types'
import type { Usuario } from '@/lib/types'

interface Props {
  state: WizardState
  usuarios: Usuario[]
  onFinalize: (estado: 'Borrador' | 'Activo') => Promise<void>
  onBack: () => void
  saving?: boolean
}

function ObjetivoRow({ obj, usuarios }: { obj: ObjetivoWizard; usuarios: Usuario[] }) {
  const resp = usuarios.find(u => u.id === obj.responsableId)
  const v = obj.validacionGemini
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{obj.nombre || <span className="text-muted-foreground italic">Sin nombre</span>}</p>
        {obj.descripcionDoingness && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{obj.descripcionDoingness}</p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
        {resp && <span>{resp.nombre}</span>}
        {obj.fechaLimite && <span>{obj.fechaLimite}</span>}
        {v && (
          v.valido
            ? v.sugerencia
              ? <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />
              : <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            : <XCircle className="h-3.5 w-3.5 text-red-400" />
        )}
      </div>
    </div>
  )
}

function TipoSection({ tipo, objetivos, usuarios }: { tipo: string; objetivos: ObjetivoWizard[]; usuarios: Usuario[] }) {
  const validos = objetivos.filter(o => o.nombre.trim())
  if (validos.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Badge tipo={tipo as any} />
        <span className="text-xs text-muted-foreground">({validos.length})</span>
      </div>
      <div className="pl-2">
        {validos.map(obj => <ObjetivoRow key={obj.tempId} obj={obj} usuarios={usuarios} />)}
      </div>
    </div>
  )
}

export function StepRevision({ state, usuarios, onFinalize, onBack, saving }: Props) {
  const [activarError, setActivarError] = useState('')

  const allObjetivos = [
    ...state.objetivosPrimarios,
    ...state.objetivosVitales,
    ...state.objetivosOperativos,
    ...state.objetivosProduccion,
    ...state.objetivosMayores,
  ]
  const totalObjetivos = allObjetivos.filter(o => o.nombre.trim()).length

  const scoreItems = [
    { label: 'Tiene Situación definida', ok: !!state.situacion.trim() },
    { label: 'Tiene Propósito definido', ok: !!state.proposito.trim() },
    { label: 'Tiene Objetivo Mayor', ok: !!state.objetivoMayor.trim() },
    { label: 'Tiene Responsable asignado', ok: !!state.responsableId },
    { label: 'Tiene al menos un Primario', ok: state.objetivosPrimarios.filter(o => o.nombre.trim()).length > 0 },
    { label: 'Tiene al menos un Vital', ok: state.objetivosVitales.filter(o => o.nombre.trim()).length > 0 },
  ]
  const score = scoreItems.filter(i => i.ok).length
  const scoreColor = score === 6 ? 'text-green-400' : score >= 4 ? 'text-yellow-400' : 'text-red-400'

  async function handleActivar() {
    if (!state.proposito.trim()) {
      setActivarError('El programa necesita un Propósito para ser activado.')
      return
    }
    if (state.objetivosPrimarios.filter(o => o.nombre.trim()).length === 0) {
      setActivarError('El programa necesita al menos un Objetivo Primario para ser activado.')
      return
    }
    setActivarError('')
    await onFinalize('Activo')
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 8 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Revisión — Tu programa completo</h2>
      </div>

      <blockquote className="border-l-2 border-primary pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Los programas fallan solo porque los diversos tipos de objetivos no se ejecutan o no se mantienen en vigor.
          Podés conseguir que se haga casi cualquier cosa que quieras hacer si los tipos de objetivos se comprenden,
          se establecen con realidad, se mantienen en vigor o se completan."
        </p>
      </blockquote>

      {/* Score */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-foreground">Calidad del programa</p>
          <span className={`text-sm font-bold ${scoreColor}`}>{score}/6</span>
        </div>
        <div className="space-y-1.5">
          {scoreItems.map((item, i) => (
            <p key={i} className={`flex items-center gap-2 text-xs ${item.ok ? 'text-green-400' : 'text-muted-foreground'}`}>
              <span>{item.ok ? '✓' : '✗'}</span> {item.label}
            </p>
          ))}
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{state.nombre}</h3>
        {state.situacion && (
          <div>
            <p className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-1">Situación</p>
            <p className="text-sm text-muted-foreground">{state.situacion}</p>
          </div>
        )}
        {state.proposito && (
          <div>
            <p className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-1">Propósito</p>
            <p className="text-sm text-muted-foreground">{state.proposito}</p>
          </div>
        )}
        {state.objetivoMayor && (
          <div>
            <p className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-1">Objetivo Mayor</p>
            <p className="text-sm text-muted-foreground">{state.objetivoMayor}</p>
          </div>
        )}
      </div>

      {/* Objetivos */}
      {totalObjetivos > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <p className="text-sm font-medium text-foreground">{totalObjetivos} objetivo{totalObjetivos !== 1 ? 's' : ''}</p>
          <TipoSection tipo="Primario" objetivos={state.objetivosPrimarios} usuarios={usuarios} />
          <TipoSection tipo="Vital" objetivos={state.objetivosVitales} usuarios={usuarios} />
          <TipoSection tipo="Operativo" objetivos={state.objetivosOperativos} usuarios={usuarios} />
          <TipoSection tipo="Producción" objetivos={state.objetivosProduccion} usuarios={usuarios} />
          <TipoSection tipo="Mayor" objetivos={state.objetivosMayores} usuarios={usuarios} />
        </div>
      )}

      {activarError && (
        <div className="rounded-md border border-red-500/30 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-300">{activarError}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Atrás
        </button>
        <button
          type="button"
          onClick={() => onFinalize('Borrador')}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-muted hover:bg-accent text-foreground border border-border rounded-md transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar como Borrador'}
        </button>
        <button
          type="button"
          onClick={handleActivar}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-green-700 hover:bg-green-600 text-white rounded-md transition-colors disabled:opacity-50"
        >
          {saving ? 'Activando...' : 'Activar programa →'}
        </button>
      </div>
    </div>
  )
}
