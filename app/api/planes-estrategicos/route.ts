import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getPlanesEstrategicos,
  createPlanEstrategico,
  createEntrevistaPE,
} from '@/lib/airtable'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const userId = (session.user as any).id as string
  const rol = (session.user as any).role as string
  const planes = await getPlanesEstrategicos(userId, rol)
  return NextResponse.json({ planes })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const userId = (session.user as any).id as string

  const body = await req.json()
  const { tipo, plan_sr_id, plan_sr_nombre } = body

  if (!tipo || !['Sr', 'Jr'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }
  if (tipo === 'Jr' && !plan_sr_id) {
    return NextResponse.json({ error: 'Plan Sr requerido para plan Jr' }, { status: 400 })
  }

  const plan = await createPlanEstrategico({
    nombre: 'Plan en redacción',
    tipo,
    plan_sr_id,
    plan_sr_nombre,
    responsable_id: userId,
  })

  await createEntrevistaPE(plan.id)

  return NextResponse.json({ plan })
}
