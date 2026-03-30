import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateObjetivo } from '@/lib/airtable'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { actualizaciones } = await req.json()
  // actualizaciones: Array<{ id: string, orden: number }>

  await Promise.all(
    actualizaciones.map(({ id, orden }: { id: string; orden: number }) =>
      updateObjetivo(id, { orden })
    )
  )

  return NextResponse.json({ ok: true })
}
