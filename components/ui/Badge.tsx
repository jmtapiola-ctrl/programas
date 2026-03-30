import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"
import type { TipoObjetivo, EstadoObjetivo } from "@/lib/types"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary border-primary/25",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        destructive: "bg-destructive/10 text-destructive border-destructive/25",
        outline: "border-border text-foreground",
        ghost: "border-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

const TIPO_STYLES: Record<string, string> = {
  Primario:    "bg-blue-500/12 text-blue-400 border-blue-500/20",
  Vital:       "bg-red-500/12 text-red-400 border-red-500/20",
  Condicional: "bg-amber-500/12 text-amber-400 border-amber-500/20",
  Operativo:   "bg-orange-500/12 text-orange-400 border-orange-500/20",
  Producción:  "bg-emerald-500/12 text-emerald-400 border-emerald-500/20",
  Mayor:       "bg-purple-500/12 text-purple-400 border-purple-500/20",
}

const ESTADO_OBJ_STYLES: Record<string, string> = {
  "No iniciado":             "bg-gray-500/10 text-gray-400 border-gray-500/20",
  "Asignado":                "bg-gray-400/10 text-gray-300 border-gray-400/20",
  "En curso":                "bg-blue-500/12 text-blue-400 border-blue-500/20",
  "Completado pendiente":    "bg-amber-500/12 text-amber-400 border-amber-500/20",
  "Completado":              "bg-emerald-500/12 text-emerald-400 border-emerald-500/20",
  "Rechazado":               "bg-orange-500/12 text-orange-400 border-orange-500/20",
  "Cancelado":               "bg-red-900/30 text-red-400 border-red-800/30",
  "Modificación solicitada": "bg-purple-500/12 text-purple-400 border-purple-500/20",
  "Incumplido":              "bg-red-500/12 text-red-400 border-red-500/20",
}

const ESTADO_PROG_STYLES: Record<string, string> = {
  Borrador:   "bg-gray-500/10 text-gray-400 border-gray-500/20",
  Activo:     "bg-emerald-500/12 text-emerald-400 border-emerald-500/20",
  Completado: "bg-blue-500/12 text-blue-400 border-blue-500/20",
  Archivado:  "bg-gray-500/10 text-gray-500 border-gray-500/15",
}

const ESTADO_PB_STYLES: Record<string, string> = {
  Borrador:   "bg-gray-500/10 text-gray-400 border-gray-500/20",
  Activo:     "bg-blue-500/12 text-blue-400 border-blue-500/20",
  Completado: "bg-emerald-500/12 text-emerald-400 border-emerald-500/20",
}

const BASE = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"

function Badge({
  className,
  variant = "default",
  asChild = false,
  tipo,
  estadoObjetivo,
  estadoPrograma,
  estadoPB,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    tipo?: TipoObjetivo | string
    estadoObjetivo?: EstadoObjetivo | string
    estadoPrograma?: string
    estadoPB?: string
  }) {
  if (tipo) {
    return (
      <span className={cn(BASE, TIPO_STYLES[tipo] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20", className)}>
        {tipo}
      </span>
    )
  }
  if (estadoObjetivo) {
    return (
      <span className={cn(BASE, ESTADO_OBJ_STYLES[estadoObjetivo] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20", className)}>
        {estadoObjetivo}
      </span>
    )
  }
  if (estadoPrograma) {
    return (
      <span className={cn(BASE, ESTADO_PROG_STYLES[estadoPrograma] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20", className)}>
        {estadoPrograma}
      </span>
    )
  }
  if (estadoPB) {
    return (
      <span className={cn(BASE, ESTADO_PB_STYLES[estadoPB] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20", className)}>
        {estadoPB}
      </span>
    )
  }

  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
