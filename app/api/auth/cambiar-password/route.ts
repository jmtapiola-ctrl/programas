// POST /api/auth/cambiar-password
//
// Permite al user autenticado cambiar su password. Casos de uso:
//   - User Jr recién creado con password temporal — viene forzado a cambiarlo
//     antes de poder navegar (el frontend redirige).
//   - User común que quiere rotar su password.
//
// Body: { password_actual?: string, password_nuevo: string }
//
// Reglas:
//   - Si el user tiene `password_hash` poblado: se requiere `password_actual` y
//     se valida con bcrypt.compare. Si no matchea → 403.
//   - Si el user NO tiene `password_hash` (legacy sin password): se permite
//     setear el primer password sin validar password_actual.
//   - El password nuevo se hashea con bcrypt (salt rounds = 10) y se persiste.
//   - Se clear el flag `password_temporal` si estaba activo.
//   - Validaciones del password nuevo: mínimo 8 chars.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import { getUsuario, updateUsuario } from '@/lib/airtable'

const SALT_ROUNDS = 10
const MIN_PASSWORD_LENGTH = 8

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const userId = (session.user as any).id as string

    const body = await req.json().catch(() => null) as {
      password_actual?: string
      password_nuevo?: string
    } | null
    if (!body?.password_nuevo || typeof body.password_nuevo !== 'string') {
      return NextResponse.json({ error: 'Falta password_nuevo.' }, { status: 400 })
    }
    if (body.password_nuevo.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({
        error: `El password nuevo tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      }, { status: 400 })
    }

    const usuario = await getUsuario(userId).catch(() => null)
    if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 })

    // Si el user ya tiene un hash poblado, requerimos password actual.
    if (usuario.password_hash) {
      if (!body.password_actual) {
        return NextResponse.json({ error: 'Falta password_actual.' }, { status: 400 })
      }
      const valid = await bcrypt.compare(body.password_actual, usuario.password_hash)
      if (!valid) {
        return NextResponse.json({ error: 'Password actual incorrecto.' }, { status: 403 })
      }
    }

    const nuevoHash = await bcrypt.hash(body.password_nuevo, SALT_ROUNDS)
    await updateUsuario(userId, {
      password_hash: nuevoHash,
      password_temporal: false,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const errAny = err as any
    console.error('[cambiar-password] UNCAUGHT:', errAny?.message, errAny?.stack)
    return NextResponse.json({
      error: `Error interno: ${errAny?.message ?? String(err)}`,
    }, { status: 500 })
  }
}
