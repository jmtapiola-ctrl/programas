import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getUsuarios } from '@/lib/airtable'
import type { Usuario } from '@/lib/types'

export default async function AdminUsuariosPage() {
  const session = await getServerSession(authOptions)
  const isEjecutivo = (session?.user as any)?.role === 'Ejecutivo'
  if (!isEjecutivo) redirect('/')

  let usuarios: Usuario[] = []
  let error = ''

  try {
    usuarios = await getUsuarios()
  } catch (e: any) {
    error = e.message
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-1">{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrados</p>
        </div>
        <a
          href="https://airtable.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent text-foreground border border-border rounded-md text-sm font-medium transition-colors"
        >
          Gestionar en Airtable ↗
        </a>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Nombre</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Email</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Rol</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3 text-foreground font-medium">{u.nombre}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                    u.rol === 'Ejecutivo'
                      ? 'bg-purple-900 text-purple-200 border-purple-700'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                    u.activo
                      ? 'bg-green-900 text-green-200 border-green-700'
                      : 'bg-card text-muted-foreground border-border'
                  }`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {usuarios.length === 0 && !error && (
          <div className="text-center py-12 text-muted-foreground">
            No hay usuarios registrados.
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="font-semibold text-foreground mb-2">Agregar usuarios</h2>
        <p className="text-muted-foreground text-sm">
          Los usuarios se administran directamente desde la base Airtable.
          Para agregar un nuevo usuario, accedé a la tabla <strong className="text-foreground">Usuarios</strong> en Airtable
          y completá los campos: Nombre, Email, Rol y marcá como Activo.
        </p>
        <p className="text-muted-foreground text-xs mt-2">
          El email ingresado en Airtable será el que el usuario use para iniciar sesión.
        </p>
      </div>
    </div>
  )
}
