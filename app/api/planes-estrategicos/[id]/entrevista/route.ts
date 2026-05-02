import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEntrevistaPE, updateEntrevistaPE } from '@/lib/airtable'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const entrevista = await getEntrevistaPE(id)
  return NextResponse.json({ entrevista })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const entrevista = await getEntrevistaPE(id)
  if (!entrevista) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  await updateEntrevistaPE(entrevista.id, body)
  return NextResponse.json({ ok: true })
}
