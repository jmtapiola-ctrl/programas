import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { getUsuarioByEmail } from './airtable'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credenciales',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null

        const usuario = await getUsuarioByEmail(credentials.email)
        if (!usuario || !usuario.activo) return null

        // Validación de password:
        //   - Si el usuario tiene `password_hash` poblado en Airtable, se
        //     valida el password ingresado contra el hash con bcrypt.compare.
        //   - Si NO tiene `password_hash` (users legacy pre-Sr→Jr), se permite
        //     loguear sin password. Backward-compat mientras se migran users.
        //   - Si tiene `password_hash` pero el password ingresado no matchea
        //     o no fue ingresado → 401.
        if (usuario.password_hash) {
          if (!credentials.password) return null
          const valid = await bcrypt.compare(credentials.password, usuario.password_hash)
          if (!valid) return null
        }

        return {
          id: usuario.id,
          name: usuario.nombre,
          email: usuario.email,
          role: usuario.rol,
          // Se propaga al JWT + session. La UI usa este flag para forzar
          // /admin/cambiar-password antes de cualquier otra acción.
          password_temporal: !!usuario.password_temporal,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.password_temporal = (user as any).password_temporal ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).password_temporal = token.password_temporal ?? false
      }
      return session
    },
  },
}
