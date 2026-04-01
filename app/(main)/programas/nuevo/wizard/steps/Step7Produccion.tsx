'use client'

import { TablaObjetivosWizard } from '@/components/programas/TablaObjetivosWizard'
import type { ObjetivoWizard } from '../types'
import type { Usuario } from '@/lib/types'

interface Props {
  produccion: ObjetivoWizard[]
  onChange: (obs: ObjetivoWizard[]) => void
  usuarios: Usuario[]
  defaultFechaLimite?: string
  defaultResponsableId?: string
  defaultAprobadorId?: string
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step7Produccion({ produccion, onChange, usuarios, defaultFechaLimite, defaultResponsableId, defaultAprobadorId, onNext, onBack, saving }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 7 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos de Producción</h2>
      </div>

      <blockquote className="border-l-2 border-green-600 pl-4 space-y-1">
        <p className="text-sm text-muted-foreground italic">
          "Los resultados medibles del programa. Solo tienen
          sentido si los objetivos de organización y acción
          están resueltos primero."
        </p>
      </blockquote>

      <div className="space-y-2">
        <p className="text-sm text-foreground font-medium">¿Qué cantidades o estadísticas esperás producir?</p>
        <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
          <p>Ejemplos:</p>
          <p>· "Cerrar 10 ventas nuevas durante el mes de abril"</p>
          <p>· "Lograr que 50 prospectos reciban la propuesta comercial"</p>
          <p>· "Alcanzar $X de facturación para el 30 de junio"</p>
        </div>
      </div>

      <TablaObjetivosWizard
        tipo="Producción"
        objetivos={produccion}
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
          {saving ? 'Guardando...' : 'Ver revisión final →'}
        </button>
      </div>
    </div>
  )
}
