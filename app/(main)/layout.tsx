import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { getInboxCount } from '@/lib/airtable'
import { Sidebar } from '@/components/ui/Sidebar'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const userId = (session.user as any)?.id as string | undefined
  const rol = (session.user as any)?.role as string | undefined
  const nombre = session.user?.name ?? ''

  const inboxCount = userId && rol ? await getInboxCount(userId, rol) : 0

  return (
    <div className="flex h-screen bg-background">
      <Sidebar inboxCount={inboxCount} />
      <div className="flex-1 flex flex-col ml-56 min-w-0">
        <header className="h-12 border-b border-border flex items-center justify-end px-6 gap-4 bg-background sticky top-0 z-10 flex-shrink-0">
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
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
