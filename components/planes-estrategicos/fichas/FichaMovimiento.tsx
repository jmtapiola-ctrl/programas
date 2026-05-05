'use client'

// Ficha compacta de un Movimiento del Inventario, adaptable a `campos_a_mostrar`
// (qué campos del MovimientoPE renderizar según la pregunta del modelo).
//
// Estados visuales: 'normal' | 'atenuado' | 'resaltado' | 'marcado-N' | 'flag'
// Cada modo de interacción del Panel usa los estados que necesita.

import type { MovimientoPE, CampoFichaMovimiento } from '@/lib/types'

export type EstadoFicha =
  | { tipo: 'normal' }
  | { tipo: 'atenuado' }                       // otras fichas cuando una está seleccionada (seleccion_unica)
  | { tipo: 'resaltado'; color?: 'verde' | 'azul' | 'amarillo' }  // ficha seleccionada
  | { tipo: 'marcado-numero'; numero: number } // ranked: 1, 2, 3...
  | { tipo: 'flag' }                           // marcado_simple
  | { tipo: 'asociando' }                      // pares: ficha A esperando B
  | { tipo: 'conectado'; rol: 'desde' | 'hacia' } // pares: ya parte de un par

interface Props {
  movimiento: MovimientoPE
  campos: CampoFichaMovimiento[]
  estado: EstadoFicha
  onClick?: () => void
  onClickSecundario?: () => void  // ej: shift+click para quitar marca
  draggable?: boolean
  // ID del DOM para que SVG overlay pueda calcular posiciones (modo agrupacion_pares).
  // Pasamos del padre.
  htmlId?: string
}

export function FichaMovimiento({ movimiento, campos, estado, onClick, htmlId }: Props) {
  const claseEstado = renderClaseEstado(estado)
  const clickeable = onClick !== undefined

  return (
    <div
      id={htmlId}
      onClick={onClick}
      role={clickeable ? 'button' : undefined}
      tabIndex={clickeable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickeable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={`relative rounded-lg border px-3 py-2 transition-all select-none ${claseEstado} ${clickeable ? 'cursor-pointer' : ''}`}
    >
      {/* Badge de estado en esquina superior derecha (si aplica) */}
      <BadgeEstado estado={estado} />

      {/* ID + categoría + banda — siempre visibles, formato compacto */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[11px] text-muted-foreground/70">{movimiento.id}</span>
        {campos.includes('banda_ancha') && (
          <span className={`rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase ${
            movimiento.costo_banda_ancha === 'alta' ? 'bg-red-950/50 text-red-300 border border-red-800/50' :
            movimiento.costo_banda_ancha === 'media' ? 'bg-yellow-950/50 text-yellow-300 border border-yellow-800/50' :
            'bg-green-950/50 text-green-300 border border-green-800/50'
          }`}>
            {movimiento.costo_banda_ancha}
          </span>
        )}
        {campos.includes('estado_usuario') && movimiento.estado_usuario !== 'pendiente' && (
          <span className="rounded-full bg-foreground/10 px-1.5 py-0 text-[10px] uppercase text-foreground/60">
            {movimiento.estado_usuario}
          </span>
        )}
      </div>

      {/* Nombre — siempre visible */}
      <h4 className="text-[13px] font-semibold text-foreground leading-snug">{movimiento.nombre}</h4>

      {/* Campos opcionales según campos_a_mostrar */}
      {(campos.includes('que_resuelve') || campos.includes('ataca_desvio') || campos.includes('dueno') || campos.includes('costo') || campos.includes('ventana') || campos.includes('cantidad_precondiciones') || campos.includes('cantidad_desbloqueos') || campos.includes('criterio_exito')) && (
        <div className="mt-1.5 space-y-0.5 text-[11px]">
          {campos.includes('que_resuelve') && (
            <Linea label="Resuelve" valor={movimiento.que_resuelve} />
          )}
          {campos.includes('ataca_desvio') && (
            <Linea label="Desvío" valor={movimiento.ataca_desvio} />
          )}
          {campos.includes('dueno') && (
            <Linea label="Dueño" valor={movimiento.dueno} />
          )}
          {campos.includes('ventana') && (
            <Linea label="Ventana" valor={`${movimiento.ventana_temporal.arranca}→${movimiento.ventana_temporal.termina}`} />
          )}
          {campos.includes('costo') && (
            <Linea label="Costo" valor={`$${movimiento.costo_monetario.rango_min_usd.toLocaleString()}-$${movimiento.costo_monetario.rango_max_usd.toLocaleString()}`} />
          )}
          {campos.includes('cantidad_precondiciones') && (
            <Linea label="Precondiciones" valor={`${movimiento.precondiciones.length}`} />
          )}
          {campos.includes('cantidad_desbloqueos') && (
            <Linea label="Desbloquea" valor={`${movimiento.desbloquea.length}`} />
          )}
          {campos.includes('criterio_exito') && (
            <Linea label="Éxito" valor={movimiento.criterio_exito} />
          )}
        </div>
      )}
    </div>
  )
}

function renderClaseEstado(estado: EstadoFicha): string {
  switch (estado.tipo) {
    case 'normal':
      return 'border-sidebar-border bg-sidebar/40 hover:bg-sidebar/60'
    case 'atenuado':
      return 'border-sidebar-border bg-sidebar/20 opacity-40'
    case 'resaltado': {
      const color = estado.color ?? 'verde'
      if (color === 'azul') return 'border-2 border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/30'
      if (color === 'amarillo') return 'border-2 border-yellow-500 bg-yellow-950/40 ring-2 ring-yellow-500/30'
      return 'border-2 border-green-500 bg-green-950/40 ring-2 ring-green-500/30'
    }
    case 'marcado-numero':
      return 'border-2 border-blue-500 bg-blue-950/40'
    case 'flag':
      return 'border-2 border-yellow-600 bg-yellow-950/30'
    case 'asociando':
      return 'border-2 border-amber-500 bg-amber-950/40 ring-2 ring-amber-500/40 animate-pulse'
    case 'conectado':
      return 'border-2 border-purple-500 bg-purple-950/30'
    default:
      return 'border-sidebar-border bg-sidebar/40'
  }
}

function BadgeEstado({ estado }: { estado: EstadoFicha }) {
  if (estado.tipo === 'marcado-numero') {
    return (
      <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-blue-500 text-white text-[12px] font-bold flex items-center justify-center shadow-lg">
        {estado.numero}
      </div>
    )
  }
  if (estado.tipo === 'flag') {
    return (
      <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-yellow-500 text-white text-[14px] flex items-center justify-center shadow-lg">
        ⚑
      </div>
    )
  }
  if (estado.tipo === 'conectado') {
    return (
      <div className="absolute -top-2 -right-2 h-5 px-2 rounded-full bg-purple-500 text-white text-[10px] font-semibold flex items-center justify-center shadow-lg">
        {estado.rol === 'desde' ? 'Origen' : 'Destino'}
      </div>
    )
  }
  return null
}

function Linea({ label, valor }: { label: string; valor: string }) {
  return (
    <p className="leading-snug">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1">{label}:</span>
      <span className="text-foreground/90">{valor}</span>
    </p>
  )
}
