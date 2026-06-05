import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { getPlanesEstrategicos, getEntrevistaPE } from '@/lib/airtable'
import type { PlanEstrategico } from '@/lib/types'
import { PlanCard } from './PlanCard'

export default async function PlanesEstrategicosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const userId = (session.user as any).id as string
  const rol = (session.user as any).role as string
  const userEmail = (session.user as any).email as string

  let planes: PlanEstrategico[] = []
  try {
    planes = await getPlanesEstrategicos(userId, rol, userEmail)
  } catch {
    // tabla no configurada aún — mostrar estado vacío
  }

  // Cargar el paso_actual de cada plan para decidir si "Continuar" o "Ver plan".
  // Paso 3 cerrado (paso_actual >= 4) = completado. Se hace en paralelo.
  const pasosPorPlan = new Map<string, number>()
  await Promise.all(planes.map(async (p) => {
    try {
      const ent = await getEntrevistaPE(p.id)
      pasosPorPlan.set(p.id, ent?.paso_actual ?? 0)
    } catch {
      pasosPorPlan.set(p.id, 0)
    }
  }))

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
        <ListadoConIndentacion
          planes={planes}
          pasosPorPlan={pasosPorPlan}
          esJrViewer={rol === 'Plan Jr'}
          userEmail={userEmail}
        />
      )}
    </div>
  )
}

// Renderiza el listado agrupando cada Plan Sr con sus Plans Jr derivados
// indentados visualmente debajo. Sistema Sr→Jr:
//   - Plans Sr aparecen a nivel 0.
//   - Plans Jr de cada Sr aparecen a nivel 1 con conector visual "└─" + margen.
//   - Plans Jr huérfanos (sin Sr accesible) aparecen al final también a nivel 0.
//   - Para Plan Jr viewer: el Sr aparece como header read-only, los Jr hermanos
//     también como header read-only, y SU Jr propio con acciones completas.
function ListadoConIndentacion({
  planes,
  pasosPorPlan,
  esJrViewer,
  userEmail,
}: {
  planes: PlanEstrategico[]
  pasosPorPlan: Map<string, number>
  esJrViewer: boolean
  userEmail: string
}) {
  const planesSr = planes.filter(p => p.tipo === 'Sr')
  const planesJrPorSr = new Map<string, PlanEstrategico[]>()
  const planesJrHuerfanos: PlanEstrategico[] = []
  for (const p of planes.filter(p => p.tipo === 'Jr')) {
    if (p.plan_sr_id && planesSr.some(sr => sr.id === p.plan_sr_id)) {
      const arr = planesJrPorSr.get(p.plan_sr_id) ?? []
      arr.push(p)
      planesJrPorSr.set(p.plan_sr_id, arr)
    } else {
      planesJrHuerfanos.push(p)
    }
  }

  return (
    <div className="space-y-3">
      {planesSr.map(sr => {
        const jrs = planesJrPorSr.get(sr.id) ?? []
        // Para Plan Jr viewer: el Sr es read-only header. Su Jr es el único que puede abrir.
        const srEsLectura = esJrViewer
        return (
          <div key={sr.id}>
            <PlanCard
              plan={sr}
              pasoActual={pasosPorPlan.get(sr.id) ?? 0}
              soloLectura={srEsLectura}
            />
            {jrs.length > 0 && (
              <div className="mt-2 ml-6 space-y-2 border-l-2 border-sidebar-border/60 pl-4">
                {jrs.map(jr => {
                  // Para Plan Jr viewer: solo SU Jr (match por email) puede abrir.
                  // Los otros Jr (hermanos) se muestran como read-only.
                  const esMioJr = !esJrViewer || jr.dueno_jr_email === userEmail
                  return (
                    <PlanCard
                      key={jr.id}
                      plan={jr}
                      pasoActual={pasosPorPlan.get(jr.id) ?? 0}
                      soloLectura={!esMioJr}
                      vistaDuenoJr={esJrViewer && esMioJr}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {planesJrHuerfanos.length > 0 && (
        <>
          {planesJrHuerfanos.map(jr => (
            <PlanCard
              key={jr.id}
              plan={jr}
              pasoActual={pasosPorPlan.get(jr.id) ?? 0}
            />
          ))}
        </>
      )}
    </div>
  )
}
