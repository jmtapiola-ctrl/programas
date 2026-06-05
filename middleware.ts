// Middleware: inyecta el pathname de la request como header `x-pathname` para
// que los server components / layouts puedan leerlo de forma confiable.
//
// Motivo (Fase 6): el guard de password_temporal en app/(main)/layout.tsx
// necesita saber si la ruta actual ya es /admin/cambiar-password para NO
// redirigir en loop. En Next App Router los layouts NO reciben el pathname, y
// los headers internos (`x-invoke-path`, `next-url`) no lo traen de forma
// confiable en navegaciones de documento completo → causaba ERR_TOO_MANY_REDIRECTS
// cuando un usuario con password temporal logueaba. Este header lo resuelve.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', req.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

// Corre solo en rutas de páginas (excluye API y estáticos — solo los layouts
// necesitan el header x-pathname).
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
