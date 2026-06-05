'use client'

// Editor markdown con preview live, usado en el Wizard de Despliegue del Jr
// (Fase 3 del sistema Sr→Jr) para que el Sr/Admin edite el contexto curado
// propuesto por el LLM antes de confirmar el despliegue.
//
// Modos de vista:
//   - 'split': textarea + preview lado a lado (default).
//   - 'edicion': solo textarea (full width).
//   - 'preview': solo preview renderizado (full width).
//
// Reuso de react-markdown (ya instalado en el proyecto). El estilo prose
// sigue el patrón de tipografía del wizard PE (mínimo 12px, gris suave).

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

type Modo = 'split' | 'edicion' | 'preview'

interface Props {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
  disabled?: boolean
}

export default function MarkdownEditor({
  value,
  onChange,
  rows = 24,
  placeholder = 'Escribí markdown acá…',
  disabled = false,
}: Props) {
  const [modo, setModo] = useState<Modo>('split')

  return (
    <div className="rounded-lg border border-sidebar-border overflow-hidden bg-sidebar/20">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar/40 px-3 py-2">
        <div className="text-[12px] text-muted-foreground">
          Markdown — usá <code className="text-foreground">#</code> para títulos, <code className="text-foreground">**bold**</code>, <code className="text-foreground">- listas</code>, <code className="text-foreground">---</code> para separadores.
        </div>
        <div className="flex items-center rounded border border-sidebar-border overflow-hidden text-[12px]">
          <BotonModo activo={modo === 'edicion'} onClick={() => setModo('edicion')}>Solo edición</BotonModo>
          <BotonModo activo={modo === 'split'} onClick={() => setModo('split')}>Split</BotonModo>
          <BotonModo activo={modo === 'preview'} onClick={() => setModo('preview')}>Solo preview</BotonModo>
        </div>
      </div>

      {/* Cuerpo */}
      <div className={modo === 'split' ? 'grid grid-cols-2' : ''}>
        {(modo === 'edicion' || modo === 'split') && (
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            className={`block w-full resize-none bg-background px-3 py-2 text-[13px] font-mono leading-relaxed text-foreground focus:outline-none ${
              modo === 'split' ? 'border-r border-sidebar-border' : ''
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            spellCheck={false}
          />
        )}
        {(modo === 'preview' || modo === 'split') && (
          <div
            className="prose prose-invert prose-sm max-w-none overflow-y-auto bg-background/30 px-4 py-3"
            style={{ minHeight: `${rows * 1.6}rem`, maxHeight: `${rows * 1.6}rem` }}
          >
            {value.trim() ? (
              <MarkdownContent value={value} />
            ) : (
              <p className="text-[13px] italic text-muted-foreground">El preview aparece acá cuando escribas markdown.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function BotonModo({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 transition-colors ${
        activo
          ? 'bg-primary text-primary-foreground'
          : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar/60'
      }`}
    >
      {children}
    </button>
  )
}

// Render del markdown con estilos del wizard PE. Headings con un sizing
// custom para mantenerlos legibles dentro del preview compacto.
function MarkdownContent({ value }: { value: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-[18px] font-bold text-foreground mt-3 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-[15px] font-bold text-foreground mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-[14px] font-semibold text-foreground mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-[13px] text-foreground/90 leading-relaxed mb-2">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 text-[13px] text-foreground/90 space-y-0.5 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 text-[13px] text-foreground/90 space-y-0.5 mb-2">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="my-3 border-sidebar-border" />,
        code: ({ children }) => <code className="rounded bg-sidebar/60 px-1 py-0.5 text-[12px] font-mono">{children}</code>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-2">{children}</blockquote>,
      }}
    >
      {value}
    </ReactMarkdown>
  )
}
