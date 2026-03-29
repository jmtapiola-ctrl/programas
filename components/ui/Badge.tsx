import { TIPO_COLOR, ESTADO_COLOR } from '@/lib/types'
import type { TipoObjetivo, EstadoObjetivo, EstadoPrograma, EstadoPB } from '@/lib/types'

export function BadgeTipo({ tipo }: { tipo: string }) {
  const cls = TIPO_COLOR[tipo] ?? 'bg-gray-700 text-gray-300 border-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {tipo}
    </span>
  )
}

export function BadgeEstado({ estado }: { estado: string }) {
  const cls = ESTADO_COLOR[estado] ?? 'bg-gray-700 text-gray-300 border-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {estado}
    </span>
  )
}

type BadgeVariant = 'primario' | 'vital' | 'condicional' | 'operativo' | 'produccion' | 'mayor' |
  'pendiente' | 'en-curso' | 'cumplido' | 'incumplido' |
  'asignado' | 'no-iniciado' | 'completado-pendiente' | 'rechazado' | 'cancelado' | 'modificacion' |
  'borrador' | 'activo' | 'completado' | 'archivado' | 'default'

const variantClasses: Record<BadgeVariant, string> = {
  primario:              'bg-blue-900 text-blue-200 border border-blue-700',
  vital:                 'bg-red-900/40 text-red-300 border border-red-700/40',
  condicional:           'bg-yellow-900 text-yellow-200 border border-yellow-700',
  operativo:             'bg-orange-900 text-orange-200 border border-orange-700',
  produccion:            'bg-green-900 text-green-200 border border-green-700',
  mayor:                 'bg-purple-900 text-purple-200 border border-purple-700',
  pendiente:             'bg-gray-800 text-gray-300 border border-gray-600',
  'en-curso':            'bg-blue-900 text-blue-200 border border-blue-700',
  cumplido:              'bg-green-900 text-green-200 border border-green-700',
  incumplido:            'bg-red-900 text-red-200 border border-red-700',
  asignado:              'bg-gray-700 text-gray-300 border border-gray-600',
  'no-iniciado':         'bg-gray-800 text-gray-400 border border-gray-700',
  'completado-pendiente':'bg-yellow-900 text-yellow-200 border border-yellow-700',
  rechazado:             'bg-orange-900 text-orange-200 border border-orange-700',
  cancelado:             'bg-red-950 text-red-300 border border-red-800',
  modificacion:          'bg-purple-900 text-purple-200 border border-purple-700',
  borrador:              'bg-gray-800 text-gray-300 border border-gray-600',
  activo:                'bg-blue-900 text-blue-200 border border-blue-700',
  completado:            'bg-green-900 text-green-200 border border-green-700',
  archivado:             'bg-gray-900 text-gray-400 border border-gray-700',
  default:               'bg-gray-800 text-gray-300 border border-gray-600',
}

function tipoToVariant(tipo: TipoObjetivo): BadgeVariant {
  const map: Record<TipoObjetivo, BadgeVariant> = {
    'Primario': 'primario',
    'Vital': 'vital',
    'Condicional': 'condicional',
    'Operativo': 'operativo',
    'Producción': 'produccion',
    'Mayor': 'mayor',
  }
  return map[tipo] ?? 'default'
}

function estadoObjetivoToVariant(estado: EstadoObjetivo): BadgeVariant {
  const map: Record<EstadoObjetivo, BadgeVariant> = {
    'Asignado': 'asignado',
    'No iniciado': 'no-iniciado',
    'En curso': 'en-curso',
    'Completado pendiente': 'completado-pendiente',
    'Completado': 'cumplido',
    'Rechazado': 'rechazado',
    'Cancelado': 'cancelado',
    'Modificación solicitada': 'modificacion',
    'Incumplido': 'incumplido',
  }
  return map[estado] ?? 'default'
}

function estadoProgramaToVariant(estado: EstadoPrograma): BadgeVariant {
  const map: Record<EstadoPrograma, BadgeVariant> = {
    'Borrador': 'borrador',
    'Activo': 'activo',
    'Completado': 'completado',
    'Archivado': 'archivado',
  }
  return map[estado] ?? 'default'
}

interface BadgeProps {
  tipo?: TipoObjetivo
  estadoObjetivo?: EstadoObjetivo
  estadoPrograma?: EstadoPrograma
  estadoPB?: EstadoPB
  variant?: BadgeVariant
  children?: React.ReactNode
  className?: string
}

export function Badge({ tipo, estadoObjetivo, estadoPrograma, estadoPB, variant, children, className = '' }: BadgeProps) {
  let v: BadgeVariant = variant ?? 'default'
  let label = children

  if (tipo) { v = tipoToVariant(tipo); label = label ?? tipo }
  else if (estadoObjetivo) { v = estadoObjetivoToVariant(estadoObjetivo); label = label ?? estadoObjetivo }
  else if (estadoPrograma) { v = estadoProgramaToVariant(estadoPrograma); label = label ?? estadoPrograma }
  else if (estadoPB) {
    const map: Record<EstadoPB, BadgeVariant> = { 'Borrador': 'borrador', 'Activo': 'activo', 'Completado': 'completado' }
    v = map[estadoPB] ?? 'default'
    label = label ?? estadoPB
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[v]} ${className}`}>
      {label}
    </span>
  )
}
