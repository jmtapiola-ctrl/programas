'use client'

// Página /admin/cambiar-password
//
// Form simple: password actual + password nuevo + confirmación.
// POST a /api/auth/cambiar-password.
//
// Casos de uso:
//   - User Jr recién invitado con password temporal: el login marca su sesión
//     con password_temporal=true. El layout o el middleware lo redirige acá
//     hasta que cambie el password. Al cambiarlo, el flag se limpia.
//   - User común que quiere rotar password voluntariamente.
//
// Si el user NO tiene password_hash todavía (legacy sin pass), no se pide
// password_actual — el endpoint detecta el caso y setea el primer password.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'

export default function CambiarPasswordPage() {
  const router = useRouter()
  const { data: session, update: refreshSession } = useSession()
  const esTemporal = !!(session?.user as any)?.password_temporal

  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNuevo, setPasswordNuevo] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (passwordNuevo.length < 8) {
      setError('El password nuevo tiene que tener al menos 8 caracteres.')
      return
    }
    if (passwordNuevo !== confirmar) {
      setError('El password nuevo y la confirmación no coinciden.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/auth/cambiar-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password_actual: passwordActual || undefined,
          password_nuevo: passwordNuevo,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`)
        setSaving(false)
        return
      }
      setOk(true)
      // Refrescar la session para que se limpie el flag password_temporal.
      // Después de un momento, redirigir al home (o forzar re-login para
      // que el token JWT se renueve con el flag actualizado).
      setTimeout(async () => {
        // Forzamos signOut + redirect a /login para que el JWT se renueve
        // con password_temporal=false (NextAuth no re-evalúa authorize en
        // refreshSession sin re-login).
        await signOut({ redirect: false })
        router.push('/login?info=password_actualizado')
      }, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-md mx-auto space-y-5">
        <header>
          <h1 className="text-[20px] font-bold text-foreground">Cambiar password</h1>
          {esTemporal && (
            <p className="mt-2 text-[13px] text-amber-300 leading-relaxed">
              Tu password es <strong>temporal</strong>. Cambialo antes de continuar.
            </p>
          )}
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-foreground mb-1">
              Password actual <span className="text-muted-foreground font-normal">(dejá vacío si nunca seteaste uno)</span>
            </label>
            <input
              type="password"
              value={passwordActual}
              onChange={e => setPasswordActual(e.target.value)}
              disabled={saving || ok}
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-foreground mb-1">
              Password nuevo <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={passwordNuevo}
              onChange={e => setPasswordNuevo(e.target.value)}
              disabled={saving || ok}
              autoFocus={esTemporal}
              required
              minLength={8}
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Mínimo 8 caracteres.</p>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-foreground mb-1">
              Confirmar password nuevo <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              disabled={saving || ok}
              required
              className="w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-400">{error}</p>
          )}
          {ok && (
            <p className="text-[12px] text-emerald-400">Password actualizado. Te redirigimos al login para refrescar tu sesión…</p>
          )}

          <button
            type="submit"
            disabled={saving || ok || !passwordNuevo || !confirmar}
            className="w-full rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Guardando…' : 'Cambiar password'}
          </button>
        </form>
      </div>
    </div>
  )
}
