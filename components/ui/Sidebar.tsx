'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState } from 'react'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/programas',
    label: 'Programas',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: '/plan-de-batalla',
    label: 'Plan de Batalla',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
]

const informesItem = {
  href: '/informes',
  label: 'Informes',
  icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
}

const adminItems = [
  {
    href: '/admin/usuarios',
    label: 'Usuarios',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [collapsed, setCollapsed] = useState(false)
  const role = (session?.user as any)?.role as string | undefined
  const isEjecutivo = role === 'Ejecutivo'
  const isProgramManager = role === 'Program Manager'
  const puedeVerInformes = isEjecutivo || isProgramManager

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-20 lg:hidden ${collapsed ? 'hidden' : 'block'}`}
        onClick={() => setCollapsed(true)}
      />

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-full z-30
        bg-gray-900 border-r border-gray-800
        flex flex-col
        transition-all duration-200
        ${collapsed ? 'w-16' : 'w-56'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          {!collapsed && (
            <span className="font-bold text-white text-sm tracking-wide">PROGRAMAS</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-2 py-2 rounded-md transition-colors text-sm font-medium
                ${isActive(item.href)
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'}
              `}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}

          {puedeVerInformes && (
            <Link
              href={informesItem.href}
              className={`
                flex items-center gap-3 px-2 py-2 rounded-md transition-colors text-sm font-medium
                ${isActive(informesItem.href)
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'}
              `}
            >
              {informesItem.icon}
              {!collapsed && <span>{informesItem.label}</span>}
            </Link>
          )}

          {isEjecutivo && (
            <>
              <div className={`pt-4 pb-1 ${collapsed ? 'hidden' : ''}`}>
                <p className="px-2 text-xs font-medium text-gray-600 uppercase tracking-wider">Admin</p>
              </div>
              {adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-2 py-2 rounded-md transition-colors text-sm font-medium
                    ${isActive(item.href)
                      ? 'bg-blue-700 text-white'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'}
                  `}
                >
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-gray-800 p-3">
          {!collapsed && session?.user && (
            <div className="mb-2 px-1">
              <p className="text-sm font-medium text-gray-200 truncate">{session.user.name}</p>
              <p className="text-xs text-gray-500 truncate">{(session.user as any).role}</p>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 text-gray-400 hover:text-gray-200 transition-colors text-sm px-1 py-1 rounded w-full"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && <span>Salir</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
