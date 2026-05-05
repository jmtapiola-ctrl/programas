'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Inbox,
  ClipboardList,
  Swords,
  BarChart2,
  Users,
  LogOut,
  Map,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainNav = [
  { href: '/planes-estrategicos', label: 'Planes Estratégicos', icon: Map },
]

const comingSoonNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/programas', label: 'Programas', icon: ClipboardList },
  { href: '/plan-de-batalla', label: 'Plan de Batalla', icon: Swords },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/informes', label: 'Informes', icon: BarChart2 },
]

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
  colapsado,
}: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  badge?: number
  colapsado?: boolean
}) {
  return (
    <Link
      href={href}
      title={colapsado ? label : undefined}
      className={cn(
        'flex items-center rounded-md text-[13px] font-medium transition-colors',
        colapsado ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-1.5',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
      {!colapsado && (
        <>
          <span className="flex-1">{label}</span>
          {badge != null && badge > 0 && (
            <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

function DisabledNavItem({
  label,
  icon: Icon,
  colapsado,
}: {
  label: string
  icon: React.ElementType
  colapsado?: boolean
}) {
  return (
    <span
      title={colapsado ? `${label} (próximamente)` : undefined}
      className={cn(
        'flex items-center rounded-md text-[13px] font-medium text-muted-foreground/35 cursor-not-allowed select-none',
        colapsado ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-1.5'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
      {!colapsado && (
        <span className="flex-1">{label} <span className="text-[11px]">(próximamente)</span></span>
      )}
    </span>
  )
}

export function Sidebar({
  inboxCount: _inboxCount = 0,
  colapsado = false,
  onToggle,
}: {
  inboxCount?: number
  colapsado?: boolean
  onToggle?: () => void
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const nombre = session?.user?.name ?? ''
  const isEjecutivo = role === 'Ejecutivo'

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href || pathname === '/'
    return pathname.startsWith(href)
  }

  const widthClass = colapsado ? 'w-12' : 'w-56'

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-screen flex flex-col border-r border-sidebar-border bg-sidebar z-40 transition-[width] duration-200',
      widthClass
    )}>
      {/* Workspace header */}
      <div className={cn(
        'flex h-11 items-center border-b border-sidebar-border',
        colapsado ? 'justify-center px-0' : 'gap-2.5 px-4'
      )}>
        <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/20 flex-shrink-0">
          <span className="text-[10px] font-bold text-primary">P</span>
        </div>
        {!colapsado && (
          <span className="text-[13px] font-semibold text-foreground tracking-tight">Plan Terravinci</span>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-3 space-y-0.5', colapsado ? 'px-1' : 'px-2')}>
        {mainNav.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={isActive(href)}
            colapsado={colapsado}
          />
        ))}

        {comingSoonNav.map(({ href, label, icon }) => (
          <DisabledNavItem key={href} label={label} icon={icon} colapsado={colapsado} />
        ))}

        {isEjecutivo && (
          <>
            {!colapsado && (
              <div className="pt-4 pb-1 px-2.5">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Admin
                </p>
              </div>
            )}
            {colapsado && <div className="pt-3" aria-hidden />}
            <NavItem
              href="/admin/usuarios"
              label="Usuarios"
              icon={Users}
              active={isActive('/admin')}
              colapsado={colapsado}
            />
          </>
        )}
      </nav>

      {/* Toggle button — siempre visible */}
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          className={cn(
            'flex items-center border-t border-sidebar-border text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors',
            colapsado ? 'justify-center py-2' : 'gap-2 px-3 py-2 text-[12px]'
          )}
        >
          {colapsado
            ? <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            : <><ChevronLeft className="h-4 w-4" strokeWidth={1.75} /><span>Colapsar menú</span></>
          }
        </button>
      )}

      {/* User footer */}
      <div className="border-t border-sidebar-border p-2">
        <div className={cn('flex items-center rounded-md', colapsado ? 'justify-center px-1 py-1.5' : 'gap-2.5 px-2 py-1.5')}>
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/15"
            title={colapsado ? `${nombre}${role ? ` · ${role}` : ''}` : undefined}
          >
            <span className="text-[11px] font-semibold text-primary">
              {nombre[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          {!colapsado && (
            <>
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
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
