export type Rol = 'Ejecutivo' | 'Operador' | 'Program Manager'

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
  situacion?: string
  descripcion?: string
  proposito?: string
  objetivoMayor?: string
  estado: EstadoPrograma
  responsableIds: string[]
  aprobadorId?: string
  fechaInicio?: string
  fechaObjetivo?: string
  notas?: string
  objetivoIds: string[]
  resumenEjecutivo?: string
}

export type TipoObjetivo =
  | 'Primario'
  | 'Vital'
  | 'Condicional'
  | 'Operativo'
  | 'Producción'
  | 'Mayor'

export type EstadoObjetivo =
  | 'Asignado'
  | 'No iniciado'
  | 'En curso'
  | 'Completado pendiente'
  | 'Completado'
  | 'Rechazado'
  | 'Cancelado'
  | 'Modificación solicitada'
  | 'Incumplido'

export interface Objetivo {
  id: string
  nombre: string
  tipo: TipoObjetivo
  programaIds: string[]
  responsableId: string
  aprobadorId?: string
  estado: EstadoObjetivo
  fechaInicioReal?: string
  fechaCumplimientoReportado?: string
  fechaLimite?: string
  descripcionDoingness: string
  esRepetible: boolean
  esCondicional?: boolean
  modo?: 'Secuencial' | 'Paralelo'
  orden?: number
  notas?: string
  pbIds: string[]
  cumplimientoIds: string[]
  logIds: string[]
}

export interface Cumplimiento {
  id: string
  cumplimiento?: string
  objetivoIds: string[]
  reportadoPorId: string
  aprobadoPorId?: string
  fecha?: string
  rechazado: boolean
  motivoRechazo?: string
  descripcionCumplimiento?: string
  aprobado: boolean
}

export interface LogEvento {
  id: string
  nombre?: string
  objetivoIds: string[]
  tipoEvento: string
  usuarioId: string
  fechaYHora?: string
  notas?: string
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

export interface ObjetivoConDatos extends Objetivo {
  programa?: Programa
  responsable?: Usuario
  cumplimientos?: Cumplimiento[]
  log?: LogEvento[]
}

export interface ProgramaConDatos extends Programa {
  responsables?: Usuario[]
  aprobador?: Usuario
  objetivos?: Objetivo[]
}

export interface PBConDatos extends PlanDeBatalla {
  responsables?: Usuario[]
  objetivosIncluidos?: Objetivo[]
}

export const TIPO_ORDEN: Record<string, number> = {
  'Primario': 1,
  'Vital': 2,
  'Operativo': 3,
  'Producción': 4,
  'Mayor': 5,
  'Condicional': 6, // compatibilidad con registros existentes
}

export const TIPO_COLOR: Record<string, string> = {
  'Primario': 'bg-blue-900 text-blue-200 border-blue-700',
  'Vital': 'bg-red-900 text-red-200 border-red-700',
  'Condicional': 'bg-yellow-900 text-yellow-200 border-yellow-700',
  'Operativo': 'bg-orange-900 text-orange-200 border-orange-700',
  'Operativo Condicional': 'bg-orange-900/60 text-orange-200 border-orange-600 border-dashed',
  'Producción': 'bg-green-900 text-green-200 border-green-700',
  'Mayor': 'bg-purple-900 text-purple-200 border-purple-700',
}

export const ESTADO_COLOR: Record<string, string> = {
  'Asignado': 'bg-gray-700 text-gray-300 border-gray-600',
  'No iniciado': 'bg-gray-800 text-gray-400 border-gray-700',
  'En curso': 'bg-blue-900 text-blue-200 border-blue-700',
  'Completado pendiente': 'bg-yellow-900 text-yellow-200 border-yellow-700',
  'Completado': 'bg-green-900 text-green-200 border-green-700',
  'Rechazado': 'bg-orange-900 text-orange-200 border-orange-700',
  'Cancelado': 'bg-red-950 text-red-300 border-red-800',
  'Modificación solicitada': 'bg-purple-900 text-purple-200 border-purple-700',
  'Incumplido': 'bg-red-900 text-red-200 border-red-700',
}

export const TOOLTIP_TIPOS: Record<string, string> = {
  'Primario': 'Objetivos de organización, personas y comunicaciones. Son la base estructural del programa — si se abandonan, todo lo demás se cae.',
  'Vital': 'Lo mínimo indispensable para que el programa funcione. Si estos objetivos no se cumplen, el resto no puede avanzar.',
  'Condicional': 'Objetivos de verificación o investigación previos a la acción. Sirven para confirmar que el enfoque es correcto antes de comprometer recursos.',
  'Operativo': 'Acciones concretas con dirección, secuencia y fechas. Pueden marcarse como condicionales si dependen de una condición previa.',
  'Producción': 'Objetivos que establecen cantidades o resultados medibles. Son los indicadores de avance del programa.',
  'Mayor': 'La aspiración general del programa — amplia y de largo plazo. Define hacia dónde va todo.',
}

export const TOOLTIP_CAMPOS: Record<string, string> = {
  'Proposito': 'El motor del programa. Por qué tiene que existir y qué moviliza al equipo a ejecutarlo.',
  'Objetivo Mayor': 'La aspiración general que se logra cuando el programa está completo. Amplio, de largo plazo.',
  'Plan de Batalla': 'Lista de objetivos para el período inmediato que convierte el plan estratégico en acciones concretas y ejecutables.',
  'Descripcion Doingness': '¿Cuándo está HECHO este objetivo? Describí la acción concreta y el resultado verificable.',
}

export const CAUSAS_DESATORAMIENTO = [
  'Objetivo entregado al responsable inapropiado',
  'No hay nadie para llevarlo a cabo',
  'El objetivo se desatendió por el responsable',
  'El objetivo no era factible tal y como está expresado',
] as const

export function puedeVerTodo(rol: Rol): boolean {
  return rol === 'Ejecutivo' || rol === 'Program Manager'
}

export function puedeCrearProgramas(rol: Rol): boolean {
  return rol === 'Ejecutivo'
}

export function esOficialDelPrograma(usuarioId: string, programa: Programa): boolean {
  return programa.responsableIds.includes(usuarioId)
}

export function sortObjetivos(objetivos: Objetivo[]): Objetivo[] {
  return [...objetivos].sort((a, b) => {
    const ordenTipo = (TIPO_ORDEN[a.tipo] ?? 99) - (TIPO_ORDEN[b.tipo] ?? 99)
    if (ordenTipo !== 0) return ordenTipo
    return (a.orden ?? 0) - (b.orden ?? 0)
  })
}

export function getAprobadorEfectivo(
  objetivo: Objetivo,
  programa: Programa
): string | undefined {
  return objetivo.aprobadorId ?? programa.aprobadorId
}

export function isVencido(objetivo: Objetivo): boolean {
  if (!objetivo.fechaLimite) return false
  const estadosFinales: EstadoObjetivo[] = ['Completado', 'Cancelado', 'Incumplido']
  if (estadosFinales.includes(objetivo.estado)) return false
  return new Date(objetivo.fechaLimite) < new Date()
}

export function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function esObjetivoEjecutable(tipo: string): boolean {
  return tipo !== 'Vital'
}

export function esObjetivoContable(tipo: string): boolean {
  return tipo !== 'Vital'
}
