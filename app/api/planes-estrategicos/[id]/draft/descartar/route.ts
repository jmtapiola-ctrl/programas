// POST /api/planes-estrategicos/[id]/draft/descartar
//
// Descarta el borrador (copia de trabajo) sin tocar el plan vivo. Sale del modo
// edición. Response: { ok }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkPlanAccess } from '@/lib/auth-ownership'
import { clearPlanDraft, updatePlanEstrategico } from '@/lib/airtable'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: planId } = await params
  const access = await checkPlanAccess(session.user as any, planId)
  if (!access.allowed) return NextResponse.json({ error: access.error ?? 'Sin acceso' }, { status: access.status ?? 403 })

  await clearPlanDraft(planId)
  await updatePlanEstrategico(planId, { editable: false })
  return NextResponse.json({ ok: true })
}
