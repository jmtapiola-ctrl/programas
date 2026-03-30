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
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step6Vitales({ objetivos, onChange, usuarios, defaultFechaLimite, onNext, onBack, saving }: Props) {
  const [confirmSkip, setConfirmSkip] = useState(false)

  async function handleContinuar() {
    if (objetivos.length === 0 && !confirmSkip) {
      setConfirmSkip(true)
      return
    }
    await onNext()
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 6 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos Vitales</h2>
      </div>

      <blockquote className="border-l-2 border-red-500 pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Los Objetivos Vitales son LO QUE TENEMOS QUE HACER PARA FUNCIONAR EN LO MÁS MÍNIMO. Se encuentran
          aquellos puntos que detienen o amenazan los éxitos futuros. Son fáciles de omitir porque a veces parecen
          obvios o ya resueltos — pero si caen, bloquean todo el programa."
        </p>
        <p className="text-xs text-muted-foreground/60">— LRH, Serie de Objetivos Nº2</p>
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm text-foreground font-medium">¿Qué cosas, si no se hacen, hacen imposible todo lo demás?</p>
        <p className="text-xs text-muted-foreground">¿Qué está amenazando actualmente los resultados? ¿Qué sería catastrófico omitir?</p>
        <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
          <p>Ejemplos:</p>
          <p>· "Resolver el problema de acceso al sistema antes del lanzamiento"</p>
          <p>· "Confirmar que el presupuesto está aprobado y disponible"</p>
          <p>· "Asegurarse de que [persona crítica] está disponible y comprometida"</p>
        </div>
      </div>

      <TablaObjetivosWizard objetivos={objetivos} onChange={onChange} usuarios={usuarios} defaultFechaLimite={defaultFechaLimite} />

      {confirmSkip && objetivos.length === 0 && (
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
        {!(confirmSkip && objetivos.length === 0) && (
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
