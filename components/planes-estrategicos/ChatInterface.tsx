'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { TurnoPE, PanelUpdatePE } from '@/lib/types'

const PANEL_UPDATE_RE = /<!--PANEL_UPDATE-->[\s\S]*?<!--\/PANEL_UPDATE-->/g
const PANEL_UPDATE_OPEN = '<!--PANEL_UPDATE-->'

interface Props {
  historial: TurnoPE[]
  streamingContent: string
  isStreaming: boolean
  isPersisting?: boolean  // true después de 'content_done', mientras backend persiste
  error: string | null
  pendingMessage: string | null
  onRetry: () => void
  onPanelUpdate: (data: PanelUpdatePE) => void
}

// Para historial: el bloque PANEL_UPDATE viene completo (open + close).
function cleanContent(text: string) {
  return text.replace(PANEL_UPDATE_RE, '').trim()
}

// Para streaming: durante la llegada de tokens, el bloque puede estar incompleto
// (open sin close) — la regex no matchea y el JSON del panel se renderea visible.
// Si detectamos el open sin el close, cortamos desde ahí. Si llega el close,
// usamos la regex normal.
function cleanContentStreaming(text: string) {
  const idx = text.indexOf(PANEL_UPDATE_OPEN)
  if (idx === -1) return text
  if (text.includes('<!--/PANEL_UPDATE-->')) {
    return text.replace(PANEL_UPDATE_RE, '').trim()
  }
  return text.slice(0, idx).trimEnd()
}

export function ChatInterface({
  historial,
  streamingContent,
  isStreaming,
  isPersisting,
  error,
  pendingMessage,
  onRetry,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historial, streamingContent])

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {/* Solo mostrar turnos conversacionales — los `reviewer` y `snapshot`
            (feat/audit-reviewer) tienen su propia UI dedicada en Pantallas 1-4. */}
        {historial
          .filter((t): t is typeof t & { rol: 'user' | 'model' } => t.rol === 'user' || t.rol === 'model')
          .map((turno, i) => (
            <Burbuja key={i} rol={turno.rol} contenido={cleanContent(turno.contenido)} />
          ))}

        {/* Streaming response */}
        {isStreaming && (
          <Burbuja
            rol="model"
            contenido={cleanContentStreaming(streamingContent)}
            streaming
            persisting={isPersisting}
          />
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-[13px] text-red-300">
            <span className="flex-1">{error}</span>
            {pendingMessage && (
              <button
                onClick={onRetry}
                className="flex-shrink-0 rounded-md bg-red-800 px-3 py-1 text-[12px] font-medium text-red-100 hover:bg-red-700 transition-colors"
              >
                Reintentar
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function Burbuja({
  rol,
  contenido,
  streaming,
  persisting,
}: {
  rol: 'model' | 'user'
  contenido: string
  streaming?: boolean
  persisting?: boolean
}) {
  const isModel = rol === 'model'

  return (
    <div className={`flex ${isModel ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 text-[15px] leading-relaxed ${
          isModel
            ? 'bg-sidebar border border-sidebar-border text-foreground'
            : 'bg-primary/15 border border-primary/25 text-foreground'
        }`}
      >
        {contenido ? (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1 marker:text-muted-foreground/70">{children}</ol>,
              ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1 marker:text-muted-foreground/70">{children}</ul>,
              li: ({ children }) => <li>{children}</li>,
              h1: ({ children }) => <h1 className="text-[17px] font-bold text-foreground mt-4 mb-2 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-[15px] font-semibold text-foreground mt-3 mb-2 first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="text-[14px] font-semibold text-foreground/95 mt-2 mb-1.5 first:mt-0">{children}</h3>,
              h4: ({ children }) => <h4 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mt-2 mb-1 first:mt-0">{children}</h4>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic text-foreground/85">{children}</blockquote>
              ),
              hr: () => <hr className="border-0 border-t border-sidebar-border my-3" />,
              code: ({ children, ...props }) => {
                // react-markdown pasa `inline` cuando el code es inline (no en pre)
                const inline = !(props as any).className?.startsWith('language-')
                if (inline) {
                  return (
                    <code className="rounded bg-foreground/10 px-1 py-0.5 text-[13px] font-mono">{children}</code>
                  )
                }
                return <code className="font-mono text-[13px]">{children}</code>
              },
              pre: ({ children }) => (
                <pre className="my-2 overflow-x-auto rounded-md bg-foreground/10 p-3 text-[13px] leading-relaxed">{children}</pre>
              ),
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">{children}</a>
              ),
            }}
          >
            {contenido}
          </ReactMarkdown>
        ) : streaming ? '' : '—'}
        {streaming && !contenido && !persisting && (
          <span className="inline-flex gap-1 items-center">
            <span className="animate-bounce delay-0 h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            <span className="animate-bounce delay-150 h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            <span className="animate-bounce delay-300 h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          </span>
        )}
        {streaming && persisting && (
          <p className="mt-2 text-[11px] text-muted-foreground/70 italic flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
            Guardando…
          </p>
        )}
      </div>
    </div>
  )
}
