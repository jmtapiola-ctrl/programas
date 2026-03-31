'use client'

import { TablaObjetivosWizard } from '@/components/programas/TablaObjetivosWizard'
import type { ObjetivoWizard } from '../types'
import type { Usuario } from '@/lib/types'

interface Props {
  operativos: ObjetivoWizard[]
  produccion: ObjetivoWizard[]
  onChangeOperativos: (obs: ObjetivoWizard[]) => void
  onChangeProduccion: (obs: ObjetivoWizard[]) => void
  usuarios: Usuario[]
  defaultFechaLimite?: string
  defaultResponsableId?: string
  defaultAprobadorId?: string
  onNext: () => Promise<void>
  onBack: () => void
  saving?: boolean
}

export function Step7OperativosProduccion({ operativos, produccion, onChangeOperativos, onChangeProduccion, usuarios, defaultFechaLimite, defaultResponsableId, defaultAprobadorId, onNext, onBack, saving }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Paso 7 de 8</p>
        <h2 className="text-xl font-bold text-foreground">Objetivos Operativos y de Producción</h2>
      </div>

      {/* Sección A: Operativos */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Operativos</h3>
          <blockquote className="border-l-2 border-orange-500 pl-4 mt-2 space-y-1">
            <p className="text-sm text-muted-foreground italic">
              "Los Objetivos Operativos establecen direcciones y acciones o un calendario de eventos e itinerario.
              Normalmente incluyen una FECHA en la cual deben completarse para encajar con otros objetivos."
            </p>
            <p className="text-xs text-muted-foreground/60">— LRH, Serie de Objetivos Nº2</p>
          </blockquote>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-foreground font-medium">¿Qué acciones concretas necesitás ejecutar? ¿Cuál es el itinerario?</p>
          <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
            <p>Ejemplos:</p>
            <p>· "Contactar a los 20 prospectos de la lista antes del viernes 10"</p>
            <p>· "Capacitar a todo el equipo en el nuevo proceso antes del lunes"</p>
            <p>· "Presentar el informe de avance al directorio el día 15"</p>
          </div>
        </div>
        <TablaObjetivosWizard tipo="Operativo" objetivos={operativos} onChange={onChangeOperativos} usuarios={usuarios} programaFechaObjetivo={defaultFechaLimite} defaultResponsableId={defaultResponsableId} defaultAprobadorId={defaultAprobadorId} />
      </div>

      {/* Sección B: Producción */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Producción</h3>
          <blockquote className="border-l-2 border-green-600 pl-4 mt-2 space-y-1">
            <p className="text-sm text-muted-foreground italic">
              "Los Objetivos de Producción establecen cantidades como estadísticas. DEBÉS inspeccionar y establecer
              Objetivos Operativos y Primarios ANTES de poder establecer Objetivos de Producción. Organizaciones que
              solo tienen Objetivos de Producción ven caer sus estadísticas."
            </p>
            <p className="text-xs text-muted-foreground/60">— LRH, Serie de Objetivos Nº2</p>
          </blockquote>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-foreground font-medium">¿Qué cantidades o estadísticas esperás producir?</p>
          <div className="text-xs text-muted-foreground/60 space-y-1 bg-muted/30 rounded-md px-3 py-2">
            <p>Ejemplos:</p>
            <p>· "Cerrar 10 ventas nuevas durante el mes de abril"</p>
            <p>· "Lograr que 50 prospectos reciban la propuesta comercial"</p>
            <p>· "Alcanzar $X de facturación para el 30 de junio"</p>
          </div>
        </div>
        <TablaObjetivosWizard tipo="Producción" objetivos={produccion} onChange={onChangeProduccion} usuarios={usuarios} programaFechaObjetivo={defaultFechaLimite} defaultResponsableId={defaultResponsableId} defaultAprobadorId={defaultAprobadorId} />
      </div>

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
