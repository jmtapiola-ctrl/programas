'use client'

// Shell client del layout (main): maneja sidebar plegable + auto-colapso en
// rutas con panel interactivo (entrevista) + wrapper condicional del content
// (sin p-6/max-w-6xl en entrevista para que aproveche full width).
//
// Se monta desde app/(main)/layout.tsx (server component) que pasa el
// inboxCount y children. La auth ya fue verificada por el server.

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Sidebar } from './Sidebar'

const SIDEBAR_KEY = 'sidebar-colapsado'
// Rutas donde el sidebar SE AUTO-COLAPSA al montar (full-width screens).
// Se respeta el override del user: si lo expandió manualmente, queda expandido
// hasta que cambie de ruta.
const RUTAS_AUTO_COLAPSO = ['/entrevista']

export function MainShell({
  children,
  inboxCount,
  nombre,
  rol,
}: {
  children: React.ReactNode
  inboxCount: number
  nombre: string
  rol: string | undefined
}) {
  const pathname = usePathname() ?? ''

  const esRutaAutoColapso = RUTAS_AUTO_COLAPSO.some(r => pathname.includes(r))

  // Estado del sidebar — inicia leyendo localStorage. SSR-safe (default false).
  const [colapsado, setColapsado] = useState(false)
  // Track si el user hizo un toggle manual en esta ruta — si sí, NO auto-colapsamos
  // al cambiar entre páginas dentro de la ruta.
  const [overrideManual, setOverrideManual] = useState(false)

  // Hidratar desde localStorage al montar
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored !== null) setColapsado(stored === '1')
  }, [])

  // Auto-colapso al entrar a ruta de entrevista, EXCEPTO si el user ya hizo
  // un override manual durante esta sesión de navegación.
  useEffect(() => {
    if (esRutaAutoColapso && !overrideManual) {
      setColapsado(true)
    } else if (!esRutaAutoColapso) {
      // Reset del override al salir — la próxima vez que entre a auto-colapso,
      // el comportamiento default vuelve a aplicar.
      setOverrideManual(false)
    }
    // No persistir auto-colapso a localStorage — solo el toggle manual persiste
  }, [esRutaAutoColapso, overrideManual])

  function handleToggle() {
    setColapsado(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      setOverrideManual(true)
      return next
    })
  }

  // Wrapper condicional del content:
  // - Entrevista: sin p-6, sin max-w (full bleed para el split chat + panel fichas).
  // - Resto: padding y max-w como antes.
  const esEntrevista = pathname.includes('/entrevista')

  return (
    <div className="app-shell flex h-screen bg-background">
      <Sidebar inboxCount={inboxCount} colapsado={colapsado} onToggle={handleToggle} />
      <div
        className="app-shell-frame flex-1 flex flex-col min-w-0 transition-[margin-left] duration-200"
        style={{ marginLeft: colapsado ? 48 : 224 }}
      >
        {/* Header oculto en entrevista — la entrevista tiene su propio header
            del plan + botón Pausar. Mostrar el header global ahí come 48px más
            de altura que duele en notebooks 15". */}
        {!esEntrevista && (
          <header className="app-shell-header h-12 border-b border-border flex items-center justify-end px-6 gap-4 bg-background sticky top-0 z-10 flex-shrink-0">
            <Link href="/inbox" className="relative">
              <Bell
                className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors"
                strokeWidth={1.75}
              />
              {inboxCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {inboxCount > 9 ? '9+' : inboxCount}
                </span>
              )}
            </Link>
            <span className="text-sm text-muted-foreground">
              {nombre}
              {rol ? ` · ${rol}` : ''}
            </span>
          </header>
        )}
        <main className="app-shell-main flex-1 overflow-y-auto">
          {esEntrevista
            ? children
            : <div className="app-shell-page p-6 max-w-6xl mx-auto">{children}</div>
          }
        </main>
      </div>
    </div>
  )
}
