import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calcularInbox } from '@/lib/inbox'
import Link from 'next/link'
import {
  UserCheck,
  CheckCircle2,
  MessageCircle,
  MessageSquare,
  MessageCircleCheck,
  GitBranch,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Clock,
  CheckCheck,
} from 'lucide-react'
import type { InboxItem } from '@/lib/inbox'

const TIPO_ICON: Record<InboxItem['tipo'], React.ElementType> = {
  asignacion_pendiente: UserCheck,
  cumplimiento_pendiente: CheckCircle2,
  cumplimiento_rechazado: XCircle,
  clarificacion_solicitada: MessageCircle,
  clarificacion_respondida: MessageCircleCheck,
  modificacion_pendiente: GitBranch,
  modificacion_rechazada: GitBranch,
  modificacion_aprobada: GitBranch,
  rechazo_pendiente: XCircle,
  rechazo_rechazado: RotateCcw,
  primario_caido: AlertTriangle,
  vencido: Clock,
  sin_movimiento: Clock,
}

const TIPO_LABEL: Record<InboxItem['tipo'], string> = {
  asignacion_pendiente: 'Asignación pendiente',
  cumplimiento_pendiente: 'Cumplimiento pendiente',
  cumplimiento_rechazado: 'Cumplimiento rechazado',
  clarificacion_solicitada: 'Clarificación solicitada',
  clarificacion_respondida: 'Clarificación respondida',
  modificacion_pendiente: 'Modificación pendiente',
  modificacion_rechazada: 'Modificación rechazada',
  modificacion_aprobada: 'Modificación aprobada',
  rechazo_pendiente: 'Rechazo pendiente',
  rechazo_rechazado: 'Rechazo rechazado',
  primario_caido: 'Primario caído',
  vencido: 'Vencido',
  sin_movimiento: 'Sin movimiento',
}

const TIPO_COLOR_ICON: Record<InboxItem['tipo'], string> = {
  asignacion_pendiente: 'text-red-400',
  cumplimiento_pendiente: 'text-yellow-400',
  cumplimiento_rechazado: 'text-red-400',
  clarificacion_solicitada: 'text-red-400',
  clarificacion_respondida: 'text-blue-400',
  modificacion_pendiente: 'text-yellow-400',
  modificacion_rechazada: 'text-red-400',
  modificacion_aprobada: 'text-green-400',
  rechazo_pendiente: 'text-red-400',
  rechazo_rechazado: 'text-orange-400',
  primario_caido: 'text-yellow-400',
  vencido: 'text-muted-foreground',
  sin_movimiento: 'text-muted-foreground',
}

const TIPO_COLOR: Record<InboxItem['prioridad'], string> = {
  alta: 'text-red-400',
  media: 'text-yellow-400',
  baja: 'text-muted-foreground',
}

function formatFecha(fecha?: string): string {
  if (!fecha) return ''
  try {
    const d = new Date(fecha)
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return fecha
  }
}

function InboxCard({ item }: { item: InboxItem }) {
  const Icon = TIPO_ICON[item.tipo]
  const iconColor = TIPO_COLOR_ICON[item.tipo]
  const labelColor = TIPO_COLOR[item.prioridad]

  return (
    <div className="bg-card border border-border rounded-lg p-4 hover:border-border/80 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${iconColor}`} strokeWidth={1.75} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}>
                {TIPO_LABEL[item.tipo]}
              </span>
            </div>
            <p className="text-sm font-medium text-foreground truncate">{item.objetivoNombre}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Programa: {item.programaNombre}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{item.descripcion}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {item.fechaEvento && (
            <span className="text-[11px] text-muted-foreground">{formatFecha(item.fechaEvento)}</span>
          )}
          <Link
            href={item.accionUrl}
            className="text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap transition-colors"
          >
            Ir al objetivo →
          </Link>
        </div>
      </div>
    </div>
  )
}

function RadarCard({ item }: { item: InboxItem }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-4 bg-card border border-border rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate">{item.objetivoNombre}</p>
          <p className="text-xs text-muted-foreground">{item.programaNombre}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {item.fechaEvento && (
          <span className="text-[11px] text-muted-foreground">{formatFecha(item.fechaEvento)}</span>
        )}
        <Link
          href={item.accionUrl}
          className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Ver →
        </Link>
      </div>
    </div>
  )
}

export default async function InboxPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string
  const rol = (session?.user as any)?.role as string

  const { items } = await calcularInbox(userId, rol)

  const accion = items.filter((i) => i.prioridad === 'alta' || i.prioridad === 'media')
  const radar = items.filter((i) => i.prioridad === 'baja')

  if (items.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-foreground mb-6">Inbox</h1>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCheck className="h-12 w-12 text-muted-foreground/40 mb-4" strokeWidth={1.25} />
          <p className="text-foreground font-medium">Todo al día</p>
          <p className="text-muted-foreground text-sm mt-1">No tenés novedades pendientes.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {items.length} {items.length === 1 ? 'novedad' : 'novedades'}
        </p>
      </div>

      {accion.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Requieren tu acción
          </h2>
          <div className="space-y-2">
            {accion.map((item) => (
              <InboxCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {radar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            En radar
          </h2>
          <div className="space-y-1.5">
            {radar.map((item) => (
              <RadarCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
