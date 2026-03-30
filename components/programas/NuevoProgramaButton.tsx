'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, FileText, Wand2 } from 'lucide-react'

export function NuevoProgramaButton() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors"
      >
        + Nuevo Programa
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            <Link
              href="/programas/nuevo"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              Formulario rápido
            </Link>
            <Link
              href="/programas/nuevo/wizard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors border-t border-border"
            >
              <Wand2 className="h-4 w-4 text-muted-foreground" />
              Wizard guiado
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
