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

export function Step4Condicionales({ objetivos, onChange, usuarios, defaultFechaLimite, defaultResponsableId, defaultAprobadorId, onNext, onBack, saving }: Props) {
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 4 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos Condicionales</h2>
      </div>

      <blockquote className="border-l-2 border-yellow-600 pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Antes de actuar, verificar. Los objetivos condicionales
          son las preguntas que hay que responder antes de
          comprometer recursos. Sin ellos, el programa puede
          arrancar en la dirección equivocada."
        </p>
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm text-foreground font-medium">¿Qué información o verificación necesitás antes de que el programa pueda avanzar?</p>
        <p className="text-xs text-muted-foreground">¿Hay algo que todavía no sabés que podría cambiar todo el enfoque?</p>
        <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
          <p>Ejemplos:</p>
          <p>· "Verificar si [recurso o capacidad] es factible antes de comprometer el equipo"</p>
          <p>· "Investigar si [acción] es lo que realmente se necesita"</p>
          <p>· "Confirmar con [persona clave] que [condición] está dada"</p>
        </div>
      </div>

      <TablaObjetivosWizard tipo="Condicional" objetivos={objetivos} onChange={onChange} usuarios={usuarios} programaFechaObjetivo={defaultFechaLimite} defaultResponsableId={defaultResponsableId} defaultAprobadorId={defaultAprobadorId} />

      {confirmSkip && objetivos.length === 0 && (
        <div className="rounded-md border border-yellow-600/40 bg-yellow-900/20 px-4 py-3 space-y-3">
          <p className="text-sm text-yellow-200/80">
            La Serie indica que sin Objetivos Condicionales el programa puede arrancar sin la información necesaria.
            ¿Querés continuar de todas formas?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onNext()} className="px-3 py-1.5 text-xs bg-muted hover:bg-accent text-foreground rounded-md transition-colors">
              Sí, continuar sin condicionales
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
