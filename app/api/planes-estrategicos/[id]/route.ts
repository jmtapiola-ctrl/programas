import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updatePlanEstrategico, deletePlanEstrategico } from '@/lib/airtable'
import { checkPlanAccess } from '@/lib/auth-ownership'

// Código de seguridad para borrar planes — operación irreversible. Hardcoded
// server-side a propósito: NO debe vivir en el frontend (cualquiera vería el
// source). Si en el futuro hay más users, mover a env var DELETE_PLAN_CODE.
const DELETE_PLAN_CODE = '1495Amenabar$'

// Helper para extraer el SessionUser shape del session.user de NextAuth.
// Se usa en los 3 handlers de esta ruta + el código se replica en otros
// endpoints (mantener consistente).
function getSessionUser(session: any) {
  if (!session?.user) return null
  return {
    id: (session.user as any).id as string,
    email: (session.user as any).email as string | undefined,
    role: (session.user as any).role as string | undefined,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = getSessionUser(session)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const access = await checkPlanAccess(user, id)
  if (!access.allowed) {
    return NextResponse.json({ error: access.error ?? 'No autorizado' }, { status: access.status ?? 403 })
  }
  return NextResponse.json({ plan: access.plan })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = getSessionUser(session)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const access = await checkPlanAccess(user, id)
  if (!access.allowed) {
    return NextResponse.json({ error: access.error ?? 'No autorizado' }, { status: access.status ?? 403 })
  }
  const body = await req.json()
  await updatePlanEstrategico(id, body)
  return NextResponse.json({ ok: true })
}

// DELETE — borrado IRREVERSIBLE del plan + entrevista + turnos. Requiere
// código de seguridad en el body (no en query params para que no quede en
// logs del servidor). El frontend pide al user que tipee el código en un modal.
// Solo Plan Sr o Admin pueden borrar — Plan Jr no debería borrar nada.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = getSessionUser(session)
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // Restricción adicional: solo roles con acceso global o el Sr propietario pueden borrar.
  // Plan Jr NO puede borrar nada (ni su propio Jr — eso lo hace el Sr/Admin).
  if (user.role === 'Plan Jr') {
    return NextResponse.json({ error: 'Los usuarios Plan Jr no pueden eliminar planes.' }, { status: 403 })
  }
  const { id } = await params
  const access = await checkPlanAccess(user, id)
  if (!access.allowed) {
    return NextResponse.json({ error: access.error ?? 'No autorizado' }, { status: access.status ?? 403 })
  }
  const body = await req.json().catch(() => null) as { codigo?: string } | null
  if (!body?.codigo || typeof body.codigo !== 'string') {
    return NextResponse.json({ error: 'Código de seguridad requerido.' }, { status: 400 })
  }
  if (body.codigo !== DELETE_PLAN_CODE) {
    return NextResponse.json({ error: 'Código incorrecto.' }, { status: 403 })
  }
  try {
    await deletePlanEstrategico(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const errAny = e as any
    console.error('[plan DELETE]', errAny?.message, errAny?.stack)
    return NextResponse.json({
      error: `Error borrando: ${errAny?.message ?? String(e)}`,
    }, { status: 500 })
  }
}
