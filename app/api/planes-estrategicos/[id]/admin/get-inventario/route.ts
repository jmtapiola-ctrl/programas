// GET /api/planes-estrategicos/[id]/admin/get-inventario
//
// Devuelve el inventario del plan parseado. Útil para páginas admin que
// necesitan pre-poblar formularios con datos del inventario actual.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlanEstrategico } from '@/lib/airtable'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id: planId } = await params
  const plan = await getPlanEstrategico(planId).catch(() => null)
  if (!plan) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 })
  return NextResponse.json({
    ok: true,
    inventario: plan.plan?.inventario ?? null,
  })
}
