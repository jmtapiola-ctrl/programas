'use client'

import { TablaObjetivosWizard } from '@/components/programas/TablaObjetivosWizard'
import type { ObjetivoWizard } from '../types'
import type { Usuario } from '@/lib/types'

interface Props {
  operativos: ObjetivoWizard[]
  onChange: (obs: ObjetivoWizard[]) => void
  usuarios: Usuario[]
  defaultFechaLimite?: string
  defaultResponsableId?: string
  defaultAprobadorId?: string
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step6Operativos({ operativos, onChange, usuarios, defaultFechaLimite, defaultResponsableId, defaultAprobadorId, onNext, onBack, saving }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 6 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos Operativos</h2>
      </div>

      <blockquote className="border-l-2 border-orange-500 pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Las acciones concretas con dirección y fechas.
          Si alguna depende de una condición previa
          ('si no encontrás X, hacé Y'), marcala como
          condicional con el checkbox."
        </p>
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm text-foreground font-medium">¿Qué acciones concretas necesitás ejecutar? ¿Cuál es el itinerario?</p>
        <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
          <p>Ejemplos:</p>
          <p>· "Encontrar la pescadería más cercana" <span className="text-muted-foreground">(no condicional)</span></p>
          <p>· "Si no hay pescaderías a 5 cuadras, encontrar la carnicería más cercana" <span className="text-muted-foreground">(condicional ✓)</span></p>
          <p>· "Capacitar a todo el equipo en el nuevo proceso antes del lunes"</p>
        </div>
      </div>

      <TablaObjetivosWizard
        tipo="Operativo"
        objetivos={operativos}
        onChange={onChange}
        usuarios={usuarios}
        programaFechaObjetivo={defaultFechaLimite}
        defaultResponsableId={defaultResponsableId}
        defaultAprobadorId={defaultAprobadorId}
      />

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}
