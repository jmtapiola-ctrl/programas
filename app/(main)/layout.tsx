import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getInboxCount } from '@/lib/airtable'
import { MainShell } from '@/components/ui/MainShell'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const userId = (session.user as any)?.id as string | undefined
  const rol = (session.user as any)?.role as string | undefined
  const nombre = session.user?.name ?? ''

  const inboxCount = userId && rol ? await getInboxCount(userId, rol) : 0

  return (
    <MainShell inboxCount={inboxCount} nombre={nombre} rol={rol}>
      {children}
    </MainShell>
  )
}
