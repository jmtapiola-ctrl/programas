import type { TipoObjetivo } from '@/lib/types'

export interface ObjetivoWizard {
  tempId: string
  airtableId?: string
  nombre: string
  descripcionDoingness: string
  responsableId: string
  aprobadorId: string
  fechaLimite: string
  esRepetible: boolean
  notas?: string
  validacionGemini?: {
    valido: boolean
    problema: string | null
    reescritura: string | null
    sugerencia: string | null
  }
}

export interface WizardState {
  programaId: string | null
  paso: number
  situacion: string
  proposito: string
  nombre: string
  objetivoMayor: string
  responsableId: string
  aprobadorId: string
  fechaInicio: string
  fechaObjetivo: string
  objetivosCondicionales: ObjetivoWizard[]
  objetivosPrimarios: ObjetivoWizard[]
  objetivosVitales: ObjetivoWizard[]
  objetivosOperativos: ObjetivoWizard[]
  objetivosProduccion: ObjetivoWizard[]
  objetivosMayores: ObjetivoWizard[]
}

export const WIZARD_INITIAL_STATE: WizardState = {
  programaId: null,
  paso: 1,
  situacion: '',
  proposito: '',
  nombre: '',
  objetivoMayor: '',
  responsableId: '',
  aprobadorId: '',
  fechaInicio: '',
  fechaObjetivo: '',
  objetivosCondicionales: [],
  objetivosPrimarios: [],
  objetivosVitales: [],
  objetivosOperativos: [],
  objetivosProduccion: [],
  objetivosMayores: [],
}

export function newObjetivoWizard(): ObjetivoWizard {
  return {
    tempId: Math.random().toString(36).slice(2),
    nombre: '',
    descripcionDoingness: '',
    responsableId: '',
    aprobadorId: '',
    fechaLimite: '',
    esRepetible: false,
  }
}
