import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPrograma, getObjetivos } from '@/lib/airtable'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const programaId = searchParams.get('programaId')
  if (!programaId) return NextResponse.json({ error: 'programaId requerido' }, { status: 400 })

  const [programa, objetivos] = await Promise.all([
    getPrograma(programaId),
    getObjetivos(programaId),
  ])

  return NextResponse.json({ programa, objetivos })
}
