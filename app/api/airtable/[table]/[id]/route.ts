import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const BASE_URL = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}`

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { table, id } = await params
  const res = await fetch(`${BASE_URL}/${table}/${id}`, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    cache: 'no-store',
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { table, id } = await params
  const body = await req.json()
  const res = await fetch(`${BASE_URL}/${table}/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ table: string; id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { table, id } = await params
  const res = await fetch(`${BASE_URL}/${table}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
