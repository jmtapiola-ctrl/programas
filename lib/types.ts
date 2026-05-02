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

// Devuelve la fecha de hoy en zona horaria de Argentina (UTC-3),
// formato ISO YYYY-MM-DD. No depende de la TZ del runtime (Vercel = UTC).
export function getTodayArg(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Descripción del momento actual en Argentina, lista para inyectar al system prompt.
// Ej: "jueves 30 de abril de 2026 (Q2 2026)"
export function getContextoTemporalArg(): string {
  const ahora = new Date()
  const tz = 'America/Argentina/Buenos_Aires'
  const dia = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long' }).format(ahora)
  const fecha = new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(ahora)
  const mesNum = parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit' }).format(ahora), 10)
  const año = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric' }).format(ahora)
  const trimestre = Math.ceil(mesNum / 3)
  return `${dia} ${fecha} (Q${trimestre} ${año})`
}

export function esObjetivoEjecutable(tipo: string): boolean {
  return tipo !== 'Vital'
}

export function esObjetivoContable(tipo: string): boolean {
  return tipo !== 'Vital'
}

// ─── Planes Estratégicos ──────────────────────────────────────────────────────

export type TipoPlanEstrategico = 'Sr' | 'Jr'
export type EstadoPlanEstrategico = 'Borrador' | 'En entrevista' | 'Completado' | 'Archivado'
export type AlineacionSr = 'Verde' | 'Amarillo' | 'Rojo'

export interface MetricaPE { metrica: string; valor_objetivo: string; valor_actual: string }
export interface FueraDeScopePE { item: string; razon: string }
export interface DesvioSecundarioPE { descripcion: string; datos: string }
export interface ResistenciaPE {
  actor: string         // QUIÉN o QUÉ resiste (frase corta)
  descripcion: string   // POR QUÉ es resistencia (párrafo explicativo)
  mitigacion: string    // CÓMO se maneja (vacío si no se definió)
  tipo: string          // "Interna" / "Externa" / "Riesgo crítico precondicional"
  criticidad: 'Alta' | 'Media' | 'Baja'
}

export interface PropositorPE {
  escena: string
  metricas: MetricaPE[]
  fuera: FueraDeScopePE[]
  horizonte: string
  estabilidad: string
  alineacion_sr?: AlineacionSr
}

export interface SituacionPE {
  desvio_principal: string
  desvio_cuantificado: string
  desvios_secundarios: DesvioSecundarioPE[]
  causa_raiz: string
  consecuencia_6m: string
  consecuencia_12m: string
  recursos_actuales: string
  recursos_faltantes: string
  intentos_previos: string
  resistencias: ResistenciaPE[]
}

export interface PanelUpdatePE {
  paso_actual: number
  sub_bloque_actual: string
  proposito: PropositorPE
  situacion: SituacionPE
  datos_faltantes: string[]
}

export interface PlanEstrategico {
  id: string
  nombre: string
  area: string
  tipo: TipoPlanEstrategico
  plan_sr_id?: string
  plan_sr_nombre?: string
  estado: EstadoPlanEstrategico
  version: number
  responsable_id: string
  horizonte?: string
  proposito?: PropositorPE
  situacion?: SituacionPE
  datos_faltantes: string[]
}

export interface TurnoPE {
  rol: 'model' | 'user'
  contenido: string
  timestamp: string
  paso: number
}

export interface EntrevistaPE {
  id: string
  plan_id: string
  estado: 'En curso' | 'Pausada' | 'Completada'
  paso_actual: number
  sub_bloque_actual: string
  historial: TurnoPE[]
  ultima_actividad: string
  // Tracking de salud del PANEL_UPDATE (Fase 2 instrumentación)
  ultimo_panel_update_ok?: string                  // ISO datetime, último turno donde el PANEL_UPDATE se procesó OK
  turnos_sin_panel_consecutivos?: number           // contador; >=3 dispara panel_unhealthy
  retries_panel_update_acumulados?: number         // telemetría: total de retries para esta entrevista
}
