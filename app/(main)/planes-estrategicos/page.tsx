import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { getPlanesEstrategicos } from '@/lib/airtable'
import type { PlanEstrategico } from '@/lib/types'

const ESTADO_COLOR: Record<string, string> = {
  'Borrador': 'bg-gray-700 text-gray-300 border-gray-600',
  'En entrevista': 'bg-blue-900 text-blue-200 border-blue-700',
  'Completado': 'bg-green-900 text-green-200 border-green-700',
  'Archivado': 'bg-gray-800 text-gray-400 border-gray-700',
}

export default async function PlanesEstrategicosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const userId = (session.user as any).id as string
  const rol = (session.user as any).role as string

  let planes: PlanEstrategico[] = []
  try {
    planes = await getPlanesEstrategicos(userId, rol)
  } catch {
    // tabla no configurada aún — mostrar estado vacío
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Planes Estratégicos</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Construí tu plan estratégico anual con asistencia de IA
          </p>
        </div>
        <Link
          href="/planes-estrategicos/nuevo"
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Nuevo plan
        </Link>
      </div>

      {planes.length === 0 ? (
        <div className="rounded-xl border border-sidebar-border bg-sidebar/30 p-12 text-center">
          <p className="text-[14px] font-medium text-foreground mb-1">No hay planes estratégicos todavía</p>
          <p className="text-[13px] text-muted-foreground mb-6">
            Comenzá creando el plan estratégico de tu área o de toda la organización
          </p>
          <Link
            href="/planes-estrategicos/nuevo"
            className="inline-flex rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Crear primer plan
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {planes.map(plan => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanCard({ plan }: { plan: PlanEstrategico }) {
  const color = ESTADO_COLOR[plan.estado] ?? ESTADO_COLOR['Borrador']
  const enEntrevista = plan.estado === 'En entrevista'

  return (
    <div className="flex items-center justify-between rounded-xl border border-sidebar-border bg-sidebar/50 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${
            plan.tipo === 'Sr'
              ? 'bg-purple-900 text-purple-200 border-purple-700'
              : 'bg-blue-900 text-blue-200 border-blue-700'
          }`}>
            Plan {plan.tipo}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${color}`}>
            {plan.estado}
          </span>
        </div>
        <p className="text-[14px] font-medium text-foreground truncate">{plan.nombre}</p>
        {plan.area && (
          <p className="text-[12px] text-muted-foreground">{plan.area}</p>
        )}
      </div>

      <div className="flex-shrink-0 ml-4">
        {enEntrevista ? (
          <Link
            href={`/planes-estrategicos/${plan.id}/entrevista`}
            className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Continuar
          </Link>
        ) : (
          <Link
            href={`/planes-estrategicos/${plan.id}/entrevista`}
            className="rounded-lg border border-sidebar-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          >
            Ver
          </Link>
        )}
      </div>
    </div>
  )
}
