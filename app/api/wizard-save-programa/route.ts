import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createPrograma, updatePrograma } from '@/lib/airtable'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const data = await req.json()
    const programa = await createPrograma(data)
    return NextResponse.json(programa)
  } catch (e: any) {
    console.error('[wizard-save-programa POST]', e)
    return NextResponse.json({ error: e.message, detail: e?.cause ?? null }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  try {
    const data = await req.json()
    const programa = await updatePrograma(id, data)
    return NextResponse.json(programa)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
