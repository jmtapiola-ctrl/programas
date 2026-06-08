// Vista de edición de un plan cerrado — lado a lado (plan editable + chat).
// Feature edición de planes cerrados (modelo chat-contra-borrador).

import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { EditorPlanSplit } from '@/components/planes-estrategicos/EditorPlanSplit'

export const metadata = { title: 'Editar plan — Plan Estratégico' }

export default async function EditarPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const access = await checkPlanAccess(session.user as any, id)
  if (!access.allowed || !access.plan) notFound()
  const plan = access.plan

  // Solo planes cerrados (con versión baseline) son editables.
  if (!plan.version_activa_label) {
    redirect(`/planes-estrategicos/${id}/vista`)
  }

  return (
    <EditorPlanSplit
      planId={id}
      planNombre={plan.nombre || '(plan sin nombre)'}
      versionActiva={plan.version_activa_label}
    />
  )
}
