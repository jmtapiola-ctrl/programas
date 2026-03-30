import Link from 'next/link'
import type { Programa, Usuario } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'

interface ProgramaCardProps {
  programa: Programa
  responsables?: Usuario[]
  objetivosCount?: number
  tieneAlertas?: boolean
}

export function ProgramaCard({ programa, responsables, objetivosCount, tieneAlertas }: ProgramaCardProps) {
  return (
    <div className="bg-card border border-border hover:border-border/80 rounded-lg p-5 transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge estadoPrograma={programa.estado} />
            {tieneAlertas && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-orange-900/40 text-orange-300 border-orange-700/60">
                Con alertas
              </span>
            )}
          </div>
          <Link href={`/programas/${programa.id}`} className="text-lg font-semibold text-foreground hover:text-blue-400 transition-colors line-clamp-2">
            {programa.nombre}
          </Link>
        </div>
      </div>

      {programa.descripcion && (
        <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{programa.descripcion}</p>
      )}

      {programa.objetivoMayor && (
        <div className="bg-purple-900/20 border border-purple-800/40 rounded p-2 mb-3">
          <p className="text-xs text-purple-300 font-medium mb-0.5">Objetivo Mayor</p>
          <p className="text-sm text-muted-foreground line-clamp-2">{programa.objetivoMayor}</p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {responsables && responsables.length > 0 && (
            <span>{responsables.map(r => r.nombre).join(', ')}</span>
          )}
          {typeof objetivosCount === 'number' && (
            <span>{objetivosCount} objetivo{objetivosCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {programa.fechaInicio && <span>Inicio: {programa.fechaInicio}</span>}
          {programa.fechaObjetivo && <span>Meta: {programa.fechaObjetivo}</span>}
        </div>
      </div>
    </div>
  )
}
