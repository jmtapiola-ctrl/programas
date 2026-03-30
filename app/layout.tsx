import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Programas — Sistema de Objetivos',
  description: 'Gestión de Programas, Objetivos y Planes de Batalla',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn("dark font-sans", geist.variable)}>
      <body className="bg-background text-foreground antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
