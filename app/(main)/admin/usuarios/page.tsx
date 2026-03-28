import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getUsuarios } from '@/lib/airtable'
import Link from 'next/link'
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
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-gray-400 text-sm mt-1">{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrados</p>
        </div>
        <a
          href="https://airtable.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 rounded-md text-sm font-medium transition-colors"
        >
          Gestionar en Airtable ↗
        </a>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900/50">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Rol</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {usuarios.map(u => (
              <tr key={u.id} className="hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 text-gray-200 font-medium">{u.nombre}</td>
                <td className="px-4 py-3 text-gray-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                    u.rol === 'Ejecutivo'
                      ? 'bg-purple-900 text-purple-200 border-purple-700'
                      : 'bg-gray-700 text-gray-300 border-gray-600'
                  }`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                    u.activo
                      ? 'bg-green-900 text-green-200 border-green-700'
                      : 'bg-gray-800 text-gray-500 border-gray-700'
                  }`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {usuarios.length === 0 && !error && (
          <div className="text-center py-12 text-gray-500">
            No hay usuarios registrados.
          </div>
        )}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <h2 className="font-semibold text-gray-100 mb-2">Agregar usuarios</h2>
        <p className="text-gray-400 text-sm">
          Los usuarios se administran directamente desde la base Airtable.
          Para agregar un nuevo usuario, accedé a la tabla <strong className="text-gray-300">Usuarios</strong> en Airtable
          y completá los campos: Nombre, Email, Rol y marcá como Activo.
        </p>
        <p className="text-gray-500 text-xs mt-2">
          El email ingresado en Airtable será el que el usuario use para iniciar sesión.
        </p>
      </div>
    </div>
  )
}
