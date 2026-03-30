'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  ClipboardList,
  Swords,
  BarChart2,
  Users,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/programas', label: 'Programas', icon: ClipboardList },
  { href: '/plan-de-batalla', label: 'Plan de Batalla', icon: Swords },
]

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
      {label}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const nombre = session?.user?.name ?? ''
  const isEjecutivo = role === 'Ejecutivo'
  const puedeVerInformes = isEjecutivo || role === 'Program Manager'

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col border-r border-sidebar-border bg-sidebar z-40">
      {/* Workspace header */}
      <div className="flex h-11 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/20 flex-shrink-0">
          <span className="text-[10px] font-bold text-primary">P</span>
        </div>
        <span className="text-[13px] font-semibold text-foreground tracking-tight">Programas</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {mainNav.map(({ href, label, icon, exact }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={isActive(href, exact)}
          />
        ))}

        {puedeVerInformes && (
          <NavItem
            href="/informes"
            label="Informes"
            icon={BarChart2}
            active={isActive('/informes')}
          />
        )}

        {isEjecutivo && (
          <>
            <div className="pt-4 pb-1 px-2.5">
              <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                Admin
              </p>
            </div>
            <NavItem
              href="/admin/usuarios"
              label="Usuarios"
              icon={Users}
              active={isActive('/admin')}
            />
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
            <span className="text-[11px] font-semibold text-primary">
              {nombre[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground truncate">{nombre}</p>
            <p className="text-[11px] text-muted-foreground truncate">{role}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  )
}
