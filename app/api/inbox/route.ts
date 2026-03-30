import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calcularInbox } from '@/lib/inbox'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const userId = (session.user as any).id as string
  const rol = (session.user as any).role as string

  const result = await calcularInbox(userId, rol)
  return NextResponse.json(result)
}
