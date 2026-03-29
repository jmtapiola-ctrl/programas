export type Rol = 'Ejecutivo' | 'Staff'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
}

export type EstadoPrograma = 'Borrador' | 'Activo' | 'Completado' | 'Archivado'

export interface Programa {
  id: string
  nombre: string
  proposito?: string
  descripcion?: string
  objetivoMayor?: string
  estado: EstadoPrograma
  responsableIds: string[]
  fechaInicio?: string
  fechaObjetivo?: string
  notas?: string
  objetivoIds: string[]
}

export type TipoObjetivo = 'Mayor' | 'Primario' | 'Vital' | 'Condicional' | 'Operativo' | 'Producción'
export type EstadoObjetivo = 'Pendiente' | 'En curso' | 'Cumplido' | 'Incumplido'

export interface Objetivo {
  id: string
  nombre: string
  tipo: TipoObjetivo
  programaIds: string[]
  responsableId: string
  estado: EstadoObjetivo
  fechaLimite?: string
  descripcionDoingness?: string
  esRepetible: boolean
  orden?: number
  notas?: string
  pbIds: string[]
  cumplimientoIds: string[]
}

export interface Cumplimiento {
  id: string
  cumplimiento?: string
  objetivoIds: string[]
  reportadoPorIds: string[]
  fecha?: string
  descripcionCumplimiento?: string
  aprobado: boolean
}

export type PeriodoPB = 'Día' | 'Semana'
export type EstadoPB = 'Borrador' | 'Activo' | 'Completado'

export interface PlanDeBatalla {
  id: string
  titulo: string
  responsableIds: string[]
  periodo: PeriodoPB
  fecha?: string
  estado: EstadoPB
  objetivosIncluidosIds: string[]
  notas?: string
}

// Con datos populados
export interface ObjetivoConDatos extends Objetivo {
  programa?: Programa
  responsable?: Usuario
  cumplimientos?: Cumplimiento[]
}

export interface ProgramaConDatos extends Programa {
  responsables?: Usuario[]
  objetivos?: Objetivo[]
}

export interface PBConDatos extends PlanDeBatalla {
  responsables?: Usuario[]
  objetivosIncluidos?: Objetivo[]
}

const TIPO_ORDEN: Record<string, number> = {
  'Primario': 1,
  'Vital': 2,
  'Condicional': 3,
  'Operativo': 4,
  'Producción': 5,
  'Mayor': 6,
}

export function sortObjetivos(objetivos: Objetivo[]): Objetivo[] {
  return [...objetivos].sort((a, b) => {
    const ordenTipo = (TIPO_ORDEN[a.tipo] ?? 99) - (TIPO_ORDEN[b.tipo] ?? 99)
    if (ordenTipo !== 0) return ordenTipo
    return (a.orden ?? 0) - (b.orden ?? 0)
  })
}
