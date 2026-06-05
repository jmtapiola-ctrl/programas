'use client'

import { useState, Suspense } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// useSearchParams() requiere un boundary de Suspense para que Next pueda
// prerenderear la página en el build (sino el build falla con CSR bailout).
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const info = searchParams?.get('info')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (res?.error) {
      setError('Email no encontrado, usuario inactivo, o password incorrecto.')
    } else {
      // El callback de NextAuth setea session.user.password_temporal. La
      // página de destino (home) lee el flag y redirige a cambiar-password
      // si está activo. Acá solo redirigimos al home — el RootLayout o el
      // server component del home maneja la lógica de "forzar cambio".
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">PROGRAMAS</h1>
          <p className="text-muted-foreground text-sm mt-1">Sistema de Gestión de Programas</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground mb-4">Iniciar Sesión</h2>

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            required
            autoFocus
          />

          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Dejá vacío si no tenés contraseña asignada"
          />

          {info === 'password_actualizado' && (
            <div className="bg-emerald-900/30 border border-emerald-700 rounded p-3 text-sm text-emerald-300">
              Password actualizado. Inicia sesión con tu nuevo password.
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Ingresar
          </Button>
        </form>
      </div>
    </div>
  )
}
