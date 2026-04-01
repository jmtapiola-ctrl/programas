'use client'

import { useState } from 'react'
import { TablaObjetivosWizard } from '@/components/programas/TablaObjetivosWizard'
import type { ObjetivoWizard } from '../types'
import type { Usuario } from '@/lib/types'

interface Props {
  objetivos: ObjetivoWizard[]
  onChange: (obs: ObjetivoWizard[]) => void
  usuarios: Usuario[]
  defaultFechaLimite?: string
  defaultResponsableId?: string
  defaultAprobadorId?: string
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step5Primarios({ objetivos, onChange, usuarios, defaultFechaLimite, defaultResponsableId, defaultAprobadorId, onNext, onBack, saving }: Props) {
  const [error, setError] = useState('')

  async function handleContinuar() {
    const validos = objetivos.filter(o => o.nombre.trim())
    if (validos.length === 0) {
      setError('Los Objetivos Primarios no son opcionales — sin ellos el programa no tiene estructura. Agregá al menos uno.')
      return
    }
    setError('')
    await onNext()
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 4 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos Primarios</h2>
      </div>

      <blockquote className="border-l-2 border-blue-500 pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Los básicos para que el programa pueda operar.
          ¿Quién es el responsable? ¿Quién hace qué? ¿Todos
          leyeron el programa? Sin estos, nada de lo que viene
          después puede funcionar."
        </p>
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm text-foreground font-medium">¿Qué estructura organizativa y de comunicaciones necesita este programa?</p>
        <p className="text-xs text-muted-foreground">¿Quién está a cargo de qué? ¿Qué roles necesitan existir o reestablecerse?</p>
        <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
          <p>Ejemplos:</p>
          <p>· "Designar a [nombre] como responsable del programa"</p>
          <p>· "Que todo el equipo lea y confirme haber leído el programa"</p>
          <p>· "Establecer reunión semanal de seguimiento"</p>
        </div>
      </div>

      <TablaObjetivosWizard tipo="Primario" objetivos={objetivos} onChange={v => { onChange(v); setError('') }} usuarios={usuarios} programaFechaObjetivo={defaultFechaLimite} defaultResponsableId={defaultResponsableId} defaultAprobadorId={defaultAprobadorId} />

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Atrás
        </button>
        <button
          type="button"
          onClick={handleContinuar}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
