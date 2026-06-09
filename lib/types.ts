// Roles del sistema. Los 3 primeros son legacy (Programas + PBs); los 3 últimos
// se agregaron para el sistema Sr→Jr (planes estratégicos en cascada de 1 nivel):
//   - Plan Sr: dueño del plan estratégico raíz, crea/despliega Jr.
//   - Plan Jr: dueño formal de un plan Jr derivado. Solo ve su propio plan.
//   - Admin: autoridad operativa para crear/desplegar Jr en lugar del Sr.
// Compatibilidad: usuarios con roles legacy siguen funcionando — el filtrado
// por rol en getPlanesEstrategicos los trata como 'Operador' o 'Ejecutivo'.
export type Rol = 'Ejecutivo' | 'Operador' | 'Program Manager' | 'Plan Sr' | 'Plan Jr' | 'Admin'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  // Hash bcrypt del password. Si está vacío/undefined → login legacy (entra
  // sin password — para no romper usuarios existentes). Si está poblado, se
  // valida con bcrypt.compare en lib/auth.ts.
  password_hash?: string
  // Flag: si true, el user tiene un password temporal generado al crear el
  // Usuario (típico para users Jr recién invitados). Al loguear, el sistema
  // fuerza ir a /admin/cambiar-password antes de cualquier otra cosa.
  password_temporal?: boolean
}

export type EstadoPrograma = 'Borrador' | 'Activo' | 'Completado' | 'Archivado'

export interface Programa {
  id: string
  nombre: string
  situacion?: string
  descripcion?: string
  proposito?: string
  objetivoMayor?: string
  estado: EstadoPrograma
  responsableIds: string[]
  aprobadorId?: string
  fechaInicio?: string
  fechaObjetivo?: string
  notas?: string
  objetivoIds: string[]
  resumenEjecutivo?: string
}

export type TipoObjetivo =
  | 'Primario'
  | 'Vital'
  | 'Condicional'
  | 'Operativo'
  | 'Producción'
  | 'Mayor'

export type EstadoObjetivo =
  | 'Asignado'
  | 'No iniciado'
  | 'En curso'
  | 'Completado pendiente'
  | 'Completado'
  | 'Rechazado'
  | 'Cancelado'
  | 'Modificación solicitada'
  | 'Incumplido'

export interface Objetivo {
  id: string
  nombre: string
  tipo: TipoObjetivo
  programaIds: string[]
  responsableId: string
  aprobadorId?: string
  estado: EstadoObjetivo
  fechaInicioReal?: string
  fechaCumplimientoReportado?: string
  fechaLimite?: string
  descripcionDoingness: string
  esRepetible: boolean
  esCondicional?: boolean
  modo?: 'Secuencial' | 'Paralelo'
  orden?: number
  notas?: string
  pbIds: string[]
  cumplimientoIds: string[]
  logIds: string[]
}

export interface Cumplimiento {
  id: string
  cumplimiento?: string
  objetivoIds: string[]
  reportadoPorId: string
  aprobadoPorId?: string
  fecha?: string
  rechazado: boolean
  motivoRechazo?: string
  descripcionCumplimiento?: string
  aprobado: boolean
}

export interface LogEvento {
  id: string
  nombre?: string
  objetivoIds: string[]
  tipoEvento: string
  usuarioId: string
  fechaYHora?: string
  notas?: string
}

export type PeriodoPB = 'Día' | 'Semana'
export type EstadoPB = 'Borrador' | 'Activo' | 'Completado'

export interface PlanDeBatalla {
  id: string
  titulo: string
  responsableIds: string[]
  periodo: PeriodoPB
  fecha?: string
  estado: EstadoPB
  objetivosIncluidosIds: string[]
  notas?: string
}

export interface ObjetivoConDatos extends Objetivo {
  programa?: Programa
  responsable?: Usuario
  cumplimientos?: Cumplimiento[]
  log?: LogEvento[]
}

export interface ProgramaConDatos extends Programa {
  responsables?: Usuario[]
  aprobador?: Usuario
  objetivos?: Objetivo[]
}

export interface PBConDatos extends PlanDeBatalla {
  responsables?: Usuario[]
  objetivosIncluidos?: Objetivo[]
}

export const TIPO_ORDEN: Record<string, number> = {
  'Primario': 1,
  'Vital': 2,
  'Operativo': 3,
  'Producción': 4,
  'Mayor': 5,
  'Condicional': 6, // compatibilidad con registros existentes
}

export const TIPO_COLOR: Record<string, string> = {
  'Primario': 'bg-blue-900 text-blue-200 border-blue-700',
  'Vital': 'bg-red-900 text-red-200 border-red-700',
  'Condicional': 'bg-yellow-900 text-yellow-200 border-yellow-700',
  'Operativo': 'bg-orange-900 text-orange-200 border-orange-700',
  'Operativo Condicional': 'bg-orange-900/60 text-orange-200 border-orange-600 border-dashed',
  'Producción': 'bg-green-900 text-green-200 border-green-700',
  'Mayor': 'bg-purple-900 text-purple-200 border-purple-700',
}

export const ESTADO_COLOR: Record<string, string> = {
  'Asignado': 'bg-gray-700 text-gray-300 border-gray-600',
  'No iniciado': 'bg-gray-800 text-gray-400 border-gray-700',
  'En curso': 'bg-blue-900 text-blue-200 border-blue-700',
  'Completado pendiente': 'bg-yellow-900 text-yellow-200 border-yellow-700',
  'Completado': 'bg-green-900 text-green-200 border-green-700',
  'Rechazado': 'bg-orange-900 text-orange-200 border-orange-700',
  'Cancelado': 'bg-red-950 text-red-300 border-red-800',
  'Modificación solicitada': 'bg-purple-900 text-purple-200 border-purple-700',
  'Incumplido': 'bg-red-900 text-red-200 border-red-700',
}

export const TOOLTIP_TIPOS: Record<string, string> = {
  'Primario': 'Objetivos de organización, personas y comunicaciones. Son la base estructural del programa — si se abandonan, todo lo demás se cae.',
  'Vital': 'Lo mínimo indispensable para que el programa funcione. Si estos objetivos no se cumplen, el resto no puede avanzar.',
  'Condicional': 'Objetivos de verificación o investigación previos a la acción. Sirven para confirmar que el enfoque es correcto antes de comprometer recursos.',
  'Operativo': 'Acciones concretas con dirección, secuencia y fechas. Pueden marcarse como condicionales si dependen de una condición previa.',
  'Producción': 'Objetivos que establecen cantidades o resultados medibles. Son los indicadores de avance del programa.',
  'Mayor': 'La aspiración general del programa — amplia y de largo plazo. Define hacia dónde va todo.',
}

export const TOOLTIP_CAMPOS: Record<string, string> = {
  'Proposito': 'El motor del programa. Por qué tiene que existir y qué moviliza al equipo a ejecutarlo.',
  'Objetivo Mayor': 'La aspiración general que se logra cuando el programa está completo. Amplio, de largo plazo.',
  'Plan de Batalla': 'Lista de objetivos para el período inmediato que convierte el plan estratégico en acciones concretas y ejecutables.',
  'Descripcion Doingness': '¿Cuándo está HECHO este objetivo? Describí la acción concreta y el resultado verificable.',
}

export const CAUSAS_DESATORAMIENTO = [
  'Objetivo entregado al responsable inapropiado',
  'No hay nadie para llevarlo a cabo',
  'El objetivo se desatendió por el responsable',
  'El objetivo no era factible tal y como está expresado',
] as const

export function puedeVerTodo(rol: Rol): boolean {
  return rol === 'Ejecutivo' || rol === 'Program Manager'
}

export function puedeCrearProgramas(rol: Rol): boolean {
  return rol === 'Ejecutivo'
}

export function esOficialDelPrograma(usuarioId: string, programa: Programa): boolean {
  return programa.responsableIds.includes(usuarioId)
}

export function sortObjetivos(objetivos: Objetivo[]): Objetivo[] {
  return [...objetivos].sort((a, b) => {
    const ordenTipo = (TIPO_ORDEN[a.tipo] ?? 99) - (TIPO_ORDEN[b.tipo] ?? 99)
    if (ordenTipo !== 0) return ordenTipo
    return (a.orden ?? 0) - (b.orden ?? 0)
  })
}

export function getAprobadorEfectivo(
  objetivo: Objetivo,
  programa: Programa
): string | undefined {
  return objetivo.aprobadorId ?? programa.aprobadorId
}

export function isVencido(objetivo: Objetivo): boolean {
  if (!objetivo.fechaLimite) return false
  const estadosFinales: EstadoObjetivo[] = ['Completado', 'Cancelado', 'Incumplido']
  if (estadosFinales.includes(objetivo.estado)) return false
  return new Date(objetivo.fechaLimite) < new Date()
}

export function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

// Devuelve la fecha de hoy en zona horaria de Argentina (UTC-3),
// formato ISO YYYY-MM-DD. No depende de la TZ del runtime (Vercel = UTC).
export function getTodayArg(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Descripción del momento actual en Argentina, lista para inyectar al system prompt.
// Ej: "jueves 30 de abril de 2026 (Q2 2026)"
export function getContextoTemporalArg(): string {
  const ahora = new Date()
  const tz = 'America/Argentina/Buenos_Aires'
  const dia = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long' }).format(ahora)
  const fecha = new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(ahora)
  const mesNum = parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit' }).format(ahora), 10)
  const año = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric' }).format(ahora)
  const trimestre = Math.ceil(mesNum / 3)
  return `${dia} ${fecha} (Q${trimestre} ${año})`
}

export function esObjetivoEjecutable(tipo: string): boolean {
  return tipo !== 'Vital'
}

export function esObjetivoContable(tipo: string): boolean {
  return tipo !== 'Vital'
}

// ─── Planes Estratégicos ──────────────────────────────────────────────────────

export type TipoPlanEstrategico = 'Sr' | 'Jr'
// Estados del Plan Estratégico. 'Pendiente despliegue' y 'Listo para compartir'
// son específicos de Planes Jr en el flow Sr→Jr (un Jr recién creado pasa por
// Pendiente despliegue → Listo para compartir → En entrevista → Completado).
export type EstadoPlanEstrategico =
  | 'Borrador'
  | 'En entrevista'
  | 'Pendiente despliegue'
  | 'Listo para compartir'
  | 'Completado'
  | 'Archivado'

// Línea Jr persistida en el Plan Sr. Una línea es un agrupamiento temático de
// movimientos del inventario del Sr que se asignan a un dueño Jr específico.
// Cada línea, al ser desplegada, genera un Plan Jr con su propio inventario
// heredado + contexto curado independiente. Ver plan starry-foraging-sifakis.md.
export interface LineaJrPersistida {
  id: string                    // uuid local (no Airtable record ID)
  nombre: string                // ej: "Demanda", "Oferta", "Personas"
  descripcion: string           // markdown corto explicando el alcance
  movimientos_ids: string[]     // IDs de movs del inventario del Sr (M-1, M-3, ...)
  dueno_jr_email: string        // email del dueño formal (linkea a Usuario)
  dueno_jr_nombre: string       // nombre desnormalizado para UI
  plan_jr_id?: string           // record ID del Plan Jr cuando se despliega
  estado: 'borrador' | 'pendiente_contexto' | 'listo_para_compartir' | 'en_curso' | 'cerrado'
}
// ─── Contexto Curado del Jr (Wizard de Despliegue) ──────────────────────────
// El contexto que ve el dueño Jr al entrar, dividido en 5 conceptos editables
// y aprobables por separado. Generado por Opus, editado por Sr/Admin antes de
// compartir. Cada concepto se persiste en su propio campo de Airtable (ver
// CONTEXTO_CURADO_CAMPOS) y se concatena con contextoCuradoToMarkdown() para
// los consumidores que esperan un solo markdown (chat del Jr).
export interface ContextoCuradoJr {
  contexto: string         // Bienvenida + por qué importa (mira atrás/afuera: situación del Sr)
  proposito: string        // Propósito de la línea (mira adelante: a dónde llega)
  criterios_exito: string  // Qué significa que la línea esté lograda
  metricas: string         // Métricas del Propósito del Sr que mueve la línea (markdown)
  supuestos: string        // Supuestos exógenos del Sr relevantes a la línea
}

// Catálogo único de los campos del contexto curado: key TS ↔ campo Airtable ↔
// label de UI ↔ título de sección en el markdown derivado. Fuente de verdad
// para el mapper, el endpoint, el wizard de despliegue y el render de /inicio.
export const CONTEXTO_CURADO_CAMPOS = [
  { key: 'contexto',        field: 'Jr Contexto',           label: 'Contexto / Bienvenida',     seccion: null },
  { key: 'proposito',       field: 'Jr Proposito Linea',    label: 'Propósito de la línea',     seccion: 'Propósito de la línea' },
  { key: 'criterios_exito', field: 'Jr Criterios Exito',    label: 'Criterios de éxito',        seccion: 'Criterios de éxito' },
  { key: 'metricas',        field: 'Jr Metricas Proposito', label: 'Métricas del Propósito',    seccion: 'Métricas del Propósito que mueve tu línea' },
  { key: 'supuestos',       field: 'Jr Supuestos Criticos', label: 'Supuestos críticos',        seccion: 'Supuestos críticos que tenés que conocer' },
] as const

export type ContextoCuradoCampoKey = ContextoCuradoJr extends Record<infer K, string> ? K : never

// Concatena los 5 campos del contexto curado en un solo markdown, en el orden
// canónico. El campo 'contexto' ya trae su propio header (# Bienvenida...), los
// demás se prefijan con su título de sección. Usado por el chat del Jr y
// cualquier consumidor que necesite el contexto como un solo blob.
export function contextoCuradoToMarkdown(cc?: ContextoCuradoJr | null): string {
  if (!cc) return ''
  const partes: string[] = []
  for (const campo of CONTEXTO_CURADO_CAMPOS) {
    const valor = (cc[campo.key] ?? '').trim()
    if (!valor) continue
    partes.push(campo.seccion ? `## ${campo.seccion}\n\n${valor}` : valor)
  }
  return partes.join('\n\n')
}

// True si el contexto curado tiene contenido sustantivo en al menos un campo.
export function contextoCuradoTieneContenido(cc?: ContextoCuradoJr | null): boolean {
  if (!cc) return false
  return CONTEXTO_CURADO_CAMPOS.some(c => (cc[c.key] ?? '').trim().length > 0)
}

export type AlineacionSr = 'Verde' | 'Amarillo' | 'Rojo'

export interface MetricaPE { metrica: string; valor_objetivo: string; valor_actual: string }
export interface FueraDeScopePE { item: string; razon: string }
export interface DesvioSecundarioPE { descripcion: string; datos: string }
export interface ResistenciaPE {
  actor: string         // QUIÉN o QUÉ resiste (frase corta)
  descripcion: string   // POR QUÉ es resistencia (párrafo explicativo)
  mitigacion: string    // CÓMO se maneja (vacío si no se definió)
  tipo: string          // "Interna" / "Externa" / "Riesgo crítico precondicional"
  criticidad: 'Alta' | 'Media' | 'Baja'
}

export interface PropositorPE {
  escena: string
  metricas: MetricaPE[]
  fuera: FueraDeScopePE[]
  horizonte: string
  estabilidad: string
  // Solo Plan Jr. El Jr no define propósito (lo hereda del despliegue); en su
  // Paso 1 liviano declara qué tan alineado se siente con el propósito/criterios
  // heredados (Verde/Amarillo/Rojo) + un comentario que justifica esa lectura.
  alineacion_sr?: AlineacionSr
  alineacion_sr_comentario?: string
}

export interface SituacionPE {
  desvio_principal: string
  desvio_cuantificado: string
  desvios_secundarios: DesvioSecundarioPE[]
  causa_raiz: string
  consecuencia_6m: string
  consecuencia_12m: string
  recursos_actuales: string
  recursos_faltantes: string
  intentos_previos: string
  resistencias: ResistenciaPE[]
}

// Metadata para guiar la PRÓXIMA respuesta del usuario en el chat. Aplica a
// todos los pasos del wizard (0, 1, 2, 3...). Opcional. El modelo emite estos
// campos junto con el PANEL_UPDATE cuando quiere forzar mínimo de razonamiento
// (preguntas que admiten respuestas naturalmente cortas no llevan mínimos).
export interface ProximaRespuestaMetadata {
  // Mínimo de caracteres exigido al user para mandar el mensaje. Si presente,
  // el botón Enviar queda bloqueado hasta cumplir.
  caracteres_minimos?: number
  // Mínimo de palabras exigido. Si ambos presentes, ambos deben cumplirse.
  palabras_minimas?: number
  // Texto guía específico de la pregunta para el placeholder del textarea.
  // Si ausente, el cliente usa fallback genérico.
  placeholder_textarea?: string
}

// Detección de cambio retroactivo por el modelo (Fase F — H7 retroactividad
// fluida con control suave). El modelo emite esto en su PANEL_UPDATE cuando
// detecta que el último turno del usuario es un pedido de cambio sobre
// material ya producido en sub-bloques previos.
//
// Lógica de aplicación (backend):
//   - detectado=false              → no-op (no es cambio retroactivo).
//   - !toca_material_validado      → aplicar directo (material en construcción).
//   - !es_estructural              → aplicar directo (typo, redacción, aclaración).
//   - validado + estructural       → emitir SSE 'retroactividad_control_suave'
//                                    → frontend muestra modal Confirmar/Cancelar.
//
// "Material validado" = Pasos 0/1/2 cerrados con cierre formal + audit-reviewer,
// O sub-bloques 3.X cerrados con su flujo correspondiente. La clasificación
// detallada de qué cuenta como validado para cada sub-bloque queda en el system
// prompt — el modelo decide.
export interface CambioRetroactivoDetectado {
  detectado: boolean
  // Solo poblar el resto si detectado=true.
  toca_material_validado?: boolean
  es_estructural?: boolean
  bloque_afectado?: string          // ej "3.A Inventario", "Paso 2.B Causa raíz"
  texto_previo?: string             // qué decía antes (snippet contextual)
  descripcion_cambio?: string       // qué querría cambiar el user
  impactos_detectados?: string[]    // contradicciones/cascadas que el modelo detecta
}

export interface PanelUpdatePE {
  paso_actual: number
  sub_bloque_actual: string
  // proposito/situacion/datos_faltantes son OPCIONALES desde la regla
  // "no re-emitir sub-trees congelados" (commit bb689f5): durante 3.x el modelo
  // omite estos sub-trees y el merge protector preserva los persistidos.
  proposito?: PropositorPE
  situacion?: SituacionPE
  datos_faltantes?: string[]
  // Plan estructurado del Paso 3 (opcional — solo poblado durante o después del
  // Paso 3). Sigue el shape híbrido de D1: 6 keys top-level durante el flow.
  plan?: PlanoPE
  // Metadata de la próxima respuesta del usuario (Issue B / Mínimo dinámico).
  // Opcional — el modelo lo emite cuando quiere forzar profundidad de respuesta.
  proxima_respuesta_metadata?: ProximaRespuestaMetadata
  // true solo cuando el modelo considera, según su criterio, que el Paso actual
  // está conceptualmente cerrado (todos los sub-bloques cubiertos, decisiones
  // confirmadas, datos críticos registrados). Opcional con default false implícito
  // para no romper rehidratación de PANEL_UPDATEs viejos sin el campo.
  cierre_sugerido?: boolean
  // Detección de cambio retroactivo (Fase F — H7). Opcional, default { detectado: false }.
  cambio_retroactivo?: CambioRetroactivoDetectado
}

// Audit trail permanente de cambios retroactivos confirmados por el usuario
// sobre material validado. Vive en plan.warnings_retroactivos. Append-only.
export interface WarningRetroactivo {
  timestamp: string                 // ISO 8601
  bloque_afectado: string           // ej "3.A Inventario"
  paso_de_origen: number            // dónde estaba el user cuando hizo el cambio
  sub_bloque_de_origen: string
  texto_previo: string              // snippet del material previo
  descripcion_cambio: string        // qué cambió
  impactos_detectados: string[]     // impactos que el modelo había advertido
  confirmado_por_user: boolean      // siempre true en este shape (los rechazados no se guardan)
}

export interface PlanEstrategico {
  id: string
  nombre: string
  area: string
  tipo: TipoPlanEstrategico
  plan_sr_id?: string
  plan_sr_nombre?: string
  estado: EstadoPlanEstrategico
  version: number
  responsable_id: string
  horizonte?: string
  proposito?: PropositorPE
  situacion?: SituacionPE
  datos_faltantes: string[]
  plan?: PlanoPE
  // ─── Campos del sistema Sr→Jr ───────────────────────────────────────────
  // Solo Plan Sr lo usa. Array de líneas Jr derivadas (vacío hasta que se
  // crea el primer Jr vía el wizard de creación). Una vez creadas, refleja
  // el estado actual de cada línea (movimientos_ids, dueño asignado,
  // plan_jr_id si fue desplegada, estado).
  lineas_jr?: LineaJrPersistida[]
  // Solo Plan Jr lo usa. IDs de los movimientos del inventario del Sr que
  // este Jr heredó. Es la fuente de verdad de "qué movs me tocan".
  movs_heredados_ids?: string[]
  // Solo Plan Jr lo usa. Snapshot de los objetos MovimientoPE enteros al
  // momento del despliegue. Se hidrata al renderear inventario del Jr. Si
  // el Sr cambia, este snapshot NO se actualiza automáticamente (decisión
  // del user: sin sincronización Sr→Jr en V1; re-snapshot manual es backlog).
  movs_heredados_snapshot?: MovimientoPE[]
  // Solo Plan Jr lo usa. Contexto curado que ve el dueño Jr al entrar a su
  // plan, dividido en campos editables/aprobables por separado (Propósito,
  // Criterios de éxito, Métricas, Supuestos, Contexto/Bienvenida). Generado
  // por Opus en el wizard de despliegue + editado por Sr/Admin antes de
  // compartir. Es el ÚNICO material del Sr que el dueño Jr ve (no ve plan Sr
  // crudo). El chat del Jr deriva su system prompt de estos campos vía
  // contextoCuradoToMarkdown(). Reemplaza al antiguo contexto_curado_md (un
  // solo blob de markdown) — split decidido 2026-06-01 para revisión y
  // aprobación granular por concepto.
  contexto_curado?: ContextoCuradoJr
  // Solo Plan Jr lo usa. Email del dueño formal (espejo del campo Email
  // del Usuario asociado, para búsqueda rápida sin hacer join).
  dueno_jr_email?: string
  // Solo Plan Jr lo usa. Versión del Sr (PlanVersion.numero, ej "V1") sobre la
  // que este Jr fue derivado. El Jr queda anclado a esa versión: si el Sr se
  // edita y genera V1.1, el Jr no se entera (los snapshots heredados siguen
  // siendo los de V1). Re-apuntar a una versión nueva del Sr es fase futura.
  plan_sr_version_pin?: string
  // Feature edición de planes cerrados. Qué PlanVersion.numero refleja el plan
  // vivo actual. undefined en planes que todavía no tienen versión (legacy).
  version_activa_label?: string
  // Feature edición de planes cerrados. true cuando el plan cerrado está en modo
  // edición (habilita el chat narrativo + reconcile). Default false.
  editable?: boolean
}

// ─── Plan (Paso 3) ────────────────────────────────────────────────────────────
// Decisión D1 (3 mayo 2026): shape híbrido — 6 keys top-level durante el flow
// del Paso 3, objeto `curado` aplanado al cerrar 3.E (snapshot inmutable).

export interface AreaAfectadaPE {
  nombre: string
  responsable: string  // texto libre en V1 (sin Organigrama). '[vacancia]' si no asignado
  notas?: string
}

export type SupuestoTipo = 'macro' | 'mercado' | 'regulatorio' | 'social'
export type Probabilidad = 'alta' | 'media' | 'baja'
export type EstrategiaSupuesto = 'hedge' | 'bet' | 'aceptar'

export interface SupuestoExogenoPE {
  descripcion: string
  tipo: SupuestoTipo
  // Las 4 dimensiones de calificación admiten "" como "pendiente de calificar"
  // (3.0.B: el modelo emite la lista de supuestos con calificaciones vacías y
  // el SupuestosFormModal del frontend pide al usuario que las complete).
  probabilidad: Probabilidad | ''
  impacto_signo: 'favorable' | 'desfavorable' | ''
  impacto_magnitud: 'alta' | 'media' | 'baja' | ''
  estrategia: EstrategiaSupuesto | ''
  razon: string
}

export interface PriorizacionDesvioPE {
  desvio_elegido: string  // qué desvío priorizar primeros 60 días
  razon: string
  desbloquea?: string     // opcional: cómo desbloquea otros
}

export interface CriterioExitoMetricaPE {
  metrica: string  // referencia a métrica del propósito
  pleno: string    // target original (de Paso 1)
  minimo: string   // mínimo aceptable
}

export interface PreparativosPE {
  areas_afectadas: AreaAfectadaPE[]
  supuestos_exogenos: SupuestoExogenoPE[]
  priorizacion_inicial: PriorizacionDesvioPE
  criterio_exito: {
    por_metrica: CriterioExitoMetricaPE[]
    zona_fracaso: string  // textual
  }
  // Flag para gatear el auto-open del modal de renombrar brechas en 3.A:
  // se setea a true la primera vez que el modal se auto-abre. Una vez true,
  // las brechas NO se pueden renombrar más desde la UI del inventario.
  brechas_revisadas?: boolean
}

// Tipos de dependencia entre movs:
//   - 'sugerida': solo orden ideal, sin constraint de scheduling.
//   - 'ff' (Finish-to-Finish): A debe terminar para que B pueda CERRAR.
//     B puede arrancar en paralelo. Ej: "Diseñar local" FF con "Relevar zona".
//   - 'fs' (Finish-to-Start): A debe terminar para que B pueda ARRANCAR.
//     Ej: "Contratar gerente" FS con "Empezar a entrenarlo".
//   - 'ninguna': sin precondiciones (solo en `tipo_dependencia` global del mov).
// Legacy: planes viejos tienen 'dura' y 'blanda'. Reads usan
// `normalizeDependenciaTipo` para mapear: dura→ff (matches user intent),
// blanda→sugerida (mismo significado, rename).
export type DependenciaTipo = 'sugerida' | 'ff' | 'fs' | 'continuo' | 'ninguna'

// Mapea valores legacy ('dura'/'blanda') al schema actual. Idempotente: si
// recibe un valor ya nuevo, lo retorna sin cambio. Para defaults defensive,
// cualquier string desconocido cae a 'sugerida'.
export function normalizeDependenciaTipo(t: string | undefined | null): DependenciaTipo {
  if (t === 'dura') return 'ff'
  if (t === 'blanda') return 'sugerida'
  if (t === 'sugerida' || t === 'ff' || t === 'fs' || t === 'continuo' || t === 'ninguna') return t
  return 'sugerida'
}

// Variante que excluye 'ninguna' — útil para `precondiciones_tipo` values
// (donde 'ninguna' no aplica, es solo para mov.tipo_dependencia global).
export function normalizeDepTipoEdge(t: string | undefined | null): 'sugerida' | 'ff' | 'fs' | 'continuo' {
  const n = normalizeDependenciaTipo(t)
  return n === 'ninguna' ? 'sugerida' : n
}
export type CostoBandaAncha = 'baja' | 'media' | 'alta'
export type EstadoMovimiento = 'aceptado' | 'editado' | 'quitado' | 'pendiente'

export interface MovimientoPE {
  id: string                // M-1, M-2, ...
  categoria: string         // auto-detectada por el modelo (no fija)
  nombre: string
  // Descripción extensa de qué hace concretamente el movimiento — pre-cargada
  // por el modelo en /paso3/inventario/generar y editable por el usuario.
  // Opcional en el type para backward-compat con movimientos generados antes
  // del feature; defaults a "" cuando falta.
  descripcion?: string
  que_resuelve: string
  // Narrativa libre opcional. La fuente de verdad de "qué ataca" es
  // `brechas_atacadas` (multi-select declarativo). Este campo queda para
  // backward-compat: los movs migrados conservan el texto del modelo, pero
  // está oculto de los edit forms.
  ataca_desvio?: string
  // Brechas del Propósito que ataca este movimiento. Array de nombres EXACTOS
  // de métricas (matching contra proposito.metricas[i].metrica). REQUERIDO ≥1
  // para movs nuevos. Opcional en el type para backward-compat con movs viejos
  // pre-feature — la migración (diagnostico/scripts/79) los popula a posteriori.
  brechas_atacadas?: string[]
  // Esfuerzo GLOBAL del movimiento (incluye banda ancha ejecutiva + financiero
  // + organizativo + cualquier costo que considere quien arma el movimiento).
  // El nombre del campo se mantiene como `costo_banda_ancha` por backward-compat
  // con datos persistidos, pero la semántica desde 2026-05 es "esfuerzo global".
  costo_banda_ancha: CostoBandaAncha
  // Impacto esperado del movimiento (alta/media/baja). Opcional para
  // backward-compat con movimientos pre-feature; defaults a 'media' en UI.
  impacto?: 'alta' | 'media' | 'baja'
  costo_monetario: { rango_min_usd: number; rango_max_usd: number; nota?: string }
  // Duración estimada del mov en meses (sin contar lead time de vacancia). Es
  // el input REAL para scheduling — el cronograma (arranca/termina abajo) se
  // computa determinísticamente en P-4 vía CPM con: duracion + deps DURA +
  // vacancia + fecha base. En 3.A el user no tiene contexto suficiente para
  // saber CUÁNDO arranca/termina el mov; solo sabe CUÁNTO dura. Range típico
  // 1-12 meses.
  duracion_meses_ejecucion?: number
  // Override manual del arranca calculado por CPM. Permite al user POSTERGAR
  // (no adelantar) el inicio de un mov respecto del piso CPM natural (hoy +
  // vacancia + max(precondición FS termina)). YYYY-MM. Si el override es
  // anterior al piso natural, se descarta silenciosamente en CPM (no rompe).
  // Se setea desde el drag horizontal en el canvas P-4. null = "limpiado"
  // (volvió a posición natural) post-edit; semánticamente equivalente a
  // undefined, pero el patch HTTP lo necesita para sobreescribir un valor previo.
  arranca_override?: string | null
  // Razonamiento textual del por qué el user postergó. Requerido cuando hay
  // override (se le pide en el popover post-drag). El sistema usa este texto
  // como respuesta de razonamiento en P-4 — solo se pregunta por los movs
  // movidos manualmente, no por los 30+ posicionados deterministicamente.
  arranca_override_razonamiento?: string | null
  // Marcado "riesgo alto de ejecución" + razon textual (poblado en P-5 de 3.B).
  // La PRESENCIA del campo (string no vacío) indica que el mov está marcado;
  // null o undefined = no marcado. El user marca movs en P-5 RiesgoEjecucionModal
  // y da una razon por mov (mínimo 30 chars enforced en UI). El modelo lee este
  // campo del inventario al procesar la confirmación de P-5 — no se duplica en
  // respuesta_estructurada.marcados (los IDs se derivan de este campo).
  riesgo_ejecucion_razonamiento?: string | null
  // LEGACY: solía ser input directo del user en 3.A. Ahora se considera campo
  // DERIVADO — el cronograma real se computa via CPM en P-4. Se mantiene en
  // el schema para no romper planes viejos y para snapshot en curado. Movs
  // nuevos NO requieren poblarlo; CPM lo calcula on-the-fly.
  ventana_temporal?: { arranca: string; termina: string }  // YYYY-MM
  precondiciones: string[]  // ids de otros movimientos
  desbloquea: string[]      // ids de otros movimientos
  tipo_dependencia: DependenciaTipo
  // Tipo por edge: map precond_id → 'dura' | 'blanda'. Si una precondición
  // no aparece en este map, se cae al `tipo_dependencia` global del mov
  // (backward-compat). Permite que el user marque cada conexión por separado
  // en la vista 3.A.6 (Cadenas) sin tener que sincronizar la semántica
  // per-mov para los consumers viejos.
  precondiciones_tipo?: { [precond_id: string]: 'sugerida' | 'ff' | 'fs' | 'continuo' }
  // Razonamiento por edge: map precond_id → texto explicando por qué la
  // dependencia existe (típicamente 1-2 frases). Se popula cuando Opus
  // propone deps en 3.A.6 + cuando el user edita manualmente desde el
  // popover de tipo. Opcional, backward-compat con planes viejos.
  precondiciones_razonamiento?: { [precond_id: string]: string }
  // Lag por edge en meses: cuánto tarda B después del trigger de A (semantica
  // depende del tipo). Aplica a FS/FF/continuo; ignorado para 'sugerida'.
  //   - FS+lag: B.arranca >= A.termina + lag.
  //   - FF+lag: B.termina >= A.termina + lag.
  //   - continuo+lag: B.arranca >= A.arranca + lag AND B.termina >= A.termina + lag.
  // Default 0 si ausente (= comportamiento clásico sin offset). Solo lag >= 0.
  precondiciones_lag_meses?: { [precond_id: string]: number }
  dueno: string             // string libre en V1 (sin Organigrama)
  // Flag opcional: el "dueño" no es una persona concreta sino un puesto que
  // todavía hay que cubrir (vacancia). Cuando es true, `dueno` contiene el
  // rol/cargo (ej: "Director Comercial") y `dueno_semanas_cobertura` indica
  // cuánto se estima que toma cubrirlo. Inputs para la secuenciación en P-4:
  // la AI considera el lead time al sugerir fase; el sort visual muestra
  // dueños vacantes debajo de los no-vacantes en la misma fase porque los
  // no-vacantes pueden arrancar YA. Migración legacy: planes pre-feature
  // tenían el patrón `dueno: "[vacancia: ...]"`; ese formato se conserva pero
  // el feature nuevo prefiere los campos estructurados.
  dueno_es_vacante?: boolean
  // Semanas estimadas para cubrir la vacancia. Solo significativo si
  // dueno_es_vacante=true. Default razonable 8 (≈ 2 meses) para roles
  // estándar; directorios pueden requerir 12+; juniors 4. La AI puede sugerir
  // un valor en `generar` y el user lo edita en el form modal.
  dueno_semanas_cobertura?: number
  criterio_exito: string
  estado_usuario: EstadoMovimiento
  // Asignación visual a fase temporal. DORMANTE: la vista temporal de fases
  // fue retirada de 3.A.6 (ahora muestra DAG atemporal). El campo se conserva
  // para reactivarlo cuando se implemente una vista temporal en el futuro —
  // si algún plan ya tiene el campo seteado, no se borra.
  fase_visual?: 'sin_secuenciar' | 'fase_1' | 'fase_2' | 'fase_3'
  // Flag "deps validadas": el usuario marca el checkbox del nodo en 3.A.6
  // cuando termina de revisar las dependencias entrantes/salientes y queda
  // tranquilo. Es un bookkeeping personal — no afecta downstream (3.B+). Se
  // wipea al re-aceptar una propuesta de la AI (la estructura cambia). NO se
  // auto-invalida al editar deps manualmente (decisión deliberada — el user
  // re-togglea si quiere).
  deps_validadas?: boolean
}

// DAG del plan — sub-bloque 3.A.6. Un solo DAG por plan: contiene todos los
// movs activos del inventario con su posición en el canvas. Las dependencias
// (precondiciones/desbloquea) se persisten directamente en cada mov; el DAG
// solo guarda QUÉ movs son visibles y DÓNDE están posicionados.
export interface DAGMovPE {
  mov_id: string
  x: number          // canvas x position
  y: number          // canvas y position
  // Width opcional del nodo en pixeles. Default = NODE_W (240). Si > NODE_W, el
  // nodo es spanning (cruza múltiples fases en P-4). Solo se usa en runtime —
  // NO se persiste al DAG.
  width?: number
  // Info de span (arranca/termina/durMeses) para tooltip de spanning movs.
  // Solo runtime, no persistido.
  spanInfo?: { fases: string[]; numFases: number; durMeses: number }
}

export interface DAGPlanPE {
  movs: DAGMovPE[]
  generado_en: string  // ISO — última vez que se sobreescribió el DAG completo
}

export interface ResumenCategoriaPE {
  categoria: string
  total: number
  aceptados: number
  editados: number
  quitados: number
}

export interface InventarioPE {
  movimientos: MovimientoPE[]
  resumenes_categoria: ResumenCategoriaPE[]
  generado_en: string  // ISO
  costo_usd?: number
  latencia_ms?: number
  // DAG del plan (sub-bloque 3.A.6). Opcional: existe a partir de que el user
  // acepta la propuesta de Opus o agrega manualmente el primer mov al canvas.
  dag?: DAGPlanPE
  // Firma del set de dueños activos al momento del último review del modal
  // UnificarDuenos en P-4. Si la firma actual del inventario coincide con esta,
  // skipeamos el modal y abrimos el canvas directo. Se invalida implícitamente
  // cuando algún dueño cambia o se agrega un mov nuevo con dueño distinto.
  duenos_revisados_signature?: string
}

// ─── Modos de interacción del Panel Interactivo de Fichas (Fase D Chunk A) ──
// Decisión Juan 5 mayo 2026: las preguntas de palanca / estrés vienen con
// metadata sobre cómo el usuario debe responder (panel interactivo de fichas
// del Inventario), en lugar de respuesta-texto solamente.

export type ModoInteraccion =
  | 'seleccion_unica'              // 1 movimiento elegido (la palanca más fuerte)
  | 'seleccion_multiple_ranked'    // top N con orden (top 3 por impacto)
  | 'agrupacion_pares'             // pares (A → B): dependencias críticas
  | 'secuenciacion'                // ordenar en fases temporales
  | 'marcado_simple'               // flag binario en N (cuáles tienen riesgo alto)

export type CampoFichaMovimiento =
  | 'nombre' | 'que_resuelve' | 'ataca_desvio' | 'dueno' | 'banda_ancha'
  | 'impacto' | 'costo' | 'ventana' | 'cantidad_precondiciones'
  | 'cantidad_desbloqueos' | 'criterio_exito' | 'estado_usuario'
  | 'duracion_meses'

// Discriminated union: cada modo tiene su shape específico de respuesta.
export type RespuestaEstructurada =
  | { modo: 'seleccion_unica'; movimiento_id: string }
  | { modo: 'seleccion_multiple_ranked'; ranking: Array<{ movimiento_id: string; posicion: number }> }
  | { modo: 'agrupacion_pares'; pares: Array<{ desde: string; hacia: string }> }
  | { modo: 'secuenciacion';
      fases: Array<{ fase: string; movimientos: string[] }>
      // Sugerencia de la AI por mov (cuando aplica al sub-caso P-4 con
      // canvas de fases). Persistente para no re-disparar la llamada. Opcional
      // y backward-compat con respuestas previas. `sugerencias_ai[movId]` es
      // el key de la fase sugerida (ej: 'Q2' | 'Q3' | 'Q4').
      sugerencias_ai?: { [movId: string]: string }
      razonamientos_ai?: { [movId: string]: string }
    }
  | { modo: 'marcado_simple'; marcados: string[] }

export interface PalancaQAPE {
  id: string                     // P-1, P-2, ...
  origen: 'principal' | 'validador'
  pregunta: string
  respuesta: string              // texto del razonamiento del usuario
  observacion_modelo?: string    // observación intermedia del modelo
  // Metadata del Panel Interactivo (V1, opcional para preguntas-texto solamente
  // del validador y caso edge de pregunta sin modo — Ajuste 4 Juan):
  modo_interaccion?: ModoInteraccion
  campos_a_mostrar?: CampoFichaMovimiento[]
  instruccion_panel?: string                   // texto adicional al usuario
  restriccion_minima?: number                  // ej: 2 elementos mínimo
  restriccion_maxima?: number                  // ej: 5 elementos máximo
  respuesta_estructurada?: RespuestaEstructurada
}

export interface PalancasPE {
  preguntas_principal: PalancaQAPE[]   // 5 fijas
  preguntas_validador: PalancaQAPE[]   // 0-5, según validador (D4 — techo, no piso)
  costo_validador_usd?: number
  latencia_validador_ms?: number
}

export interface DecisionPriorizacionPE {
  decision: string
  razon: string
  alternativas_descartadas: string[]
}

export interface FaseSecuenciaPE {
  fase: string
  movimientos: string[]  // ids de movimientos (referencia, no copia)
  razon_secuencia: string
}

export interface BorradorIteracionPE {
  numero: 1 | 2 | 3
  contexto: string
  decisiones_priorizacion: DecisionPriorizacionPE[]
  secuencia_movimientos: FaseSecuenciaPE[]
  supuestos_criticos: string[]   // descripciones de supuestos referenciados
  criterio_exito: { pleno: string; minimo: string; path_minimo: string }
  alternativas_descartadas: { decision: string; razon: string }[]
  disconformidades_usuario: { elemento: string; razon: string }[]
  costo_usd: number
  latencia_ms: number
  generado_en: string
}

export interface BorradorPE {
  iteraciones: BorradorIteracionPE[]   // max 3
  iteracion_aceptada?: 1 | 2 | 3
}

export interface EstresQAPE {
  id: string  // E-1, E-2, ...
  pregunta: string
  respuesta: string
  observacion_modelo?: string
  // Metadata del Panel Interactivo (mismo shape que PalancaQAPE — los modos
  // funcionan idénticos en 3.B y 3.D):
  modo_interaccion?: ModoInteraccion
  campos_a_mostrar?: CampoFichaMovimiento[]
  instruccion_panel?: string
  restriccion_minima?: number
  restriccion_maxima?: number
  respuesta_estructurada?: RespuestaEstructurada
  ajuste_aplicado?: { tipo: 'inventario' | 'borrador'; descripcion: string }
}

export interface EstresPE {
  preguntas: EstresQAPE[]
}

// Plan curado: forma final aplanada al cerrar 3.E. Inmutable después.
// Snapshot de 3.E congela este objeto.
export interface PlanCuradoPE {
  contexto: string
  decisiones_priorizacion: { decision: string; razon: string }[]
  secuencia_movimientos: { fase: string; movimientos: MovimientoPE[]; razon_secuencia: string }[]
  supuestos_criticos: SupuestoExogenoPE[]
  criterio_exito: { pleno: string; minimo: string; path_minimo: string }
  alternativas_descartadas: { decision: string; razon: string }[]
  cerrado_en: string  // ISO
}

// Versionado del curado (Feature: 3.E no-destructivo). Cada llamada a
// /paso3/curado/generar appende una versión nueva a versiones[]; el usuario
// puede navegar entre versiones sin perder ninguna. La version_activa es la
// que se renderiza, la que se audita al cerrar Paso 3, y la que sirve de
// base para la próxima regeneración si el usuario pide ajuste desde ella.
//
// Migración backward-compat: si plan.curado está persistido con shape antiguo
// (PlanCuradoPE directo, sin versiones[]), mapPlanEstrategico lo envuelve
// automáticamente como { versiones: [old], version_activa: 0 } al leer.
export interface PlanCuradoVersionado {
  versiones: PlanCuradoPE[]
  version_activa: number  // 0-indexed
}

// Helper para acceder al curado activo desde cualquier callsite — handlea
// el shape versionado (V2) y null si no hay curado todavía.
export function getCuradoActivo(planEstrategico: { plan?: PlanoPE }): PlanCuradoPE | null {
  const c = planEstrategico.plan?.curado
  if (!c || !c.versiones || c.versiones.length === 0) return null
  const idx = Math.max(0, Math.min(c.version_activa, c.versiones.length - 1))
  return c.versiones[idx] ?? null
}

export interface PlanoPE {
  preparativos?: PreparativosPE
  inventario?: InventarioPE
  palancas?: PalancasPE
  borrador?: BorradorPE
  estres?: EstresPE
  // Versionado no-destructivo del plan curado. Cada "regenerar" hace append;
  // version_activa apunta a la versión que el user ve y la que se audita al
  // cerrar Paso 3. Acceder vía getCuradoActivo() para mantener compat.
  curado?: PlanCuradoVersionado
  // Audit trail de cambios retroactivos confirmados por el user sobre material
  // validado (Fase F — H7 control suave). Append-only. Cada entry queda
  // permanentemente como trazabilidad. Los rechazados (Cancelar) NO se persisten.
  warnings_retroactivos?: WarningRetroactivo[]
  // Solo Plan Jr (Fase 6 — cap). Snapshot del chequeo de agregados que corre al
  // cerrar el Paso 3: compara el plan curado del Jr contra el baseline del Sr
  // (movs_heredados_snapshot) + los criterios/métricas heredados. Trazabilidad
  // de las divergencias detectadas y resueltas. Ver lib/cap-jr.ts.
  cap_auditoria_jr?: CapAuditoriaJrSnapshot
}

// Snapshot del chequeo de "cap" del Jr al cerrar el Paso 3 (Fase 6). Compara
// los agregados del plan curado del Jr contra el baseline del Sr y registra
// cuántas divergencias se detectaron. Las divergencias en sí se canalizan como
// ReviewerQuestion en el flujo de auditoría (se resuelven con el dueño Jr).
export interface CapAuditoriaJrSnapshot {
  generado_en: string                 // ISO datetime
  costo_total_jr_usd: number          // suma de costo_monetario.rango_max del curado Jr
  costo_baseline_sr_usd: number       // suma de costo_monetario.rango_max del snapshot Sr
  duracion_total_jr_meses: number     // suma de duracion_meses_ejecucion del curado Jr
  duracion_baseline_sr_meses: number  // ídem del snapshot Sr
  criterios_evaluados: number         // nº de criterios/métricas heredados chequeados
  divergencias_detectadas: number     // nº de ReviewerQuestion de divergencia emitidas
  // Cap temporal (Opción B): fecha de cierre del cronograma Jr (max ventana_temporal.termina
  // del curado) vs cierre que el Sr esperaba para esta línea (max del snapshot). YYYY-MM o
  // undefined si alguno de los dos no está secuenciado.
  cierre_jr_ym?: string
  cierre_esperado_sr_ym?: string
}

// ─── Edición de planes cerrados (versionado + narrativa + reconcile) ──────────
// Ver docs/plan en repo y lib/version-persistence.ts.

// Qué disparó la creación de una versión inmutable del plan.
export type PlanVersionTrigger = 'cierre' | 'reconcile' | 'edicion_directa'

// Snapshot DENORMALIZADO de un plan en un momento dado. Mismo principio que el
// curado: los movimientos del inventario que son idénticos al inventario vivo se
// guardan solo por id; los que difieren se guardan completos. proposito/situacion/
// preparativos se guardan enteros (son chicos). El curado se referencia por su
// version_activa dentro del plan vivo. Se hidrata al leer (ver version-persistence).
export interface PlanVersionSnapshot {
  proposito?: PropositorPE
  situacion?: SituacionPE
  preparativos?: PreparativosPE        // incluye criterio_exito
  inventario_ref: {
    movs_sin_cambio_ids: string[]      // movs idénticos al inventario vivo (solo id)
    movs_override: MovimientoPE[]      // movs que difieren del vivo (objeto completo)
    dag?: DAGPlanPE                    // posiciones del canvas (baratas, enteras)
  }
  curado_ref: { version_activa: number }   // apunta a plan.curado.versiones[]
  datos_faltantes: string[]
}

// Una versión inmutable del plan, persistida en la tabla Versiones_PE.
export interface PlanVersion {
  id: string                          // Airtable record id
  numero: string                      // "V1", "V1.1", ...
  trigger: PlanVersionTrigger
  creada_en: string                   // ISO
  creada_por: string                  // userId
  resumen_cambio: string              // 1 línea ("Reconcile: 2 métricas, 1 criterio")
  snapshot: PlanVersionSnapshot
}

// Superficie del plan que un cambio de edición toca. V1 solo aplica las de texto
// (proposito/situacion/criterio); el resto se propone pero se marca fuera_de_alcance.
export type ReconcileSurface =
  | 'proposito.escena' | 'proposito.metricas' | 'proposito.fuera'
  | 'proposito.horizonte' | 'proposito.estabilidad'
  | 'situacion' | 'criterio_exito'
  | 'inventario' | 'dag' | 'otro'   // fuera de alcance en V1

// Un cambio propuesto por el reconcile. Mismo espíritu que ReviewerCrossBlock:
// que_dice_estructura es una CITA VERBATIM del valor estructural actual (para
// localizarlo y sustituirlo determinísticamente).
export interface ReconcileChange {
  id: string                          // "RC-1"
  surface: ReconcileSurface
  target_ref: string                  // ref opcional (ej métrica, "" si no aplica)
  severidad: 'Alta' | 'Media' | 'Baja'
  que_dice_estructura: string         // valor estructural actual (verbatim)
  que_dice_narrativa: string          // lo que la narrativa editada dice ahora
  cambio_propuesto: string            // nuevo valor estructural propuesto
  fuera_de_alcance?: boolean          // toca inventario/Gantt → informativo, NO se aplica en V1
}

// ─── Copia de trabajo (borrador) para editar un plan cerrado ──────────────────
// El usuario edita un borrador DESACOPLADO (sin las relaciones del plan vivo: no
// toca la versión activa ni los Jr anclados) vía chat. Acumula cambios con su OK;
// al "Aplicar al plan" se commitea como versión nueva. Vive en 'Plan Draft JSON'.

// Cambio sobre un movimiento del inventario (F3). Edita un campo escalar/texto
// del mov, o una dependencia (precondición). mov_id es el mov afectado; para
// dependencias, mov_id es el dependiente ("hacia") y dep.desde la precondición.
export interface DraftMovCambio {
  id: string
  mov_id: string
  campo?: 'nombre' | 'descripcion' | 'brechas_atacadas' | 'costo_banda_ancha'
        | 'duracion_meses_ejecucion' | 'dueno' | 'criterio_exito' | 'impacto'
  valor_anterior?: string
  valor_nuevo?: string | string[] | number
  dep?: { accion: 'agregar' | 'quitar' | 'editar'; desde: string; tipo?: 'fs' | 'ff' | 'continuo' | 'sugerida'; lag_meses?: number }
  motivo?: string
  severidad?: 'Alta' | 'Media' | 'Baja'
}

export interface PlanDraftMensaje {
  rol: 'user' | 'model'
  texto: string
  ts: string
  // Cambios estructurales que el modelo propuso en este turno (si los hubo).
  // El usuario los confirma para aplicarlos al borrador.
  cambios_propuestos?: ReconcileChange[]
  // Cambios de inventario propuestos en este turno (F3).
  cambios_inventario?: DraftMovCambio[]
}

export interface PlanDraft {
  base_version: string              // versión que se está editando (ej "V1")
  creado_en: string
  actualizado_en: string
  // Copia editable del plan — solo las superficies de texto de V1. El resto
  // (inventario, dag, curado) NO se edita acá todavía; se muestra de referencia
  // desde el plan vivo.
  proposito?: PropositorPE
  situacion?: SituacionPE
  preparativos?: PreparativosPE      // incluye criterio_exito
  inventario?: InventarioPE          // F3: movimientos + dag editables
  mensajes: PlanDraftMensaje[]
  // Cambios ya confirmados+aplicados al borrador (audit-trail; al "Aplicar al
  // plan" se vuelcan como warnings_retroactivos en el plan vivo).
  cambios_aplicados?: ReconcileChange[]
  cambios_inventario_aplicados?: DraftMovCambio[]
}

// Rol del turno. Extendido en Fase 1 del feat/audit-reviewer:
//   - 'reviewer': turno consolidado con el reporte de la auditoría externa.
//   - 'snapshot': turno especial creado al cerrar definitivamente un Paso,
//     congela el resumen del Paso (proposito + situacion + datos_faltantes).
export type RolTurno = 'model' | 'user' | 'reviewer' | 'snapshot'

export interface TurnoPE {
  rol: RolTurno
  contenido: string
  timestamp: string
  paso: number
}

// ─── Auditoría (feat/audit-reviewer Fase 1+) ─────────────────────────────────

export type SubEstadoPaso =
  | 'en_curso'
  | 'cierre_sugerido'
  | 'esperando_auditoria'
  | 'auditoria_en_proceso'
  | 'auditoria_completa'
  | 'aplicando_cambios'
  | 'esperando_aprobacion_final'
  | 'completo'

export interface ReviewerError {
  id: string
  tipo: 1 | 2 | 3 | 4
  severidad: 'Alta' | 'Media' | 'Baja'
  que_dice_resumen: string
  que_se_dijo_en_conversacion: string
  turno_referencia: number
  cambio_propuesto: string
}

export interface ReviewerQuestion {
  id: string
  categoria: 'CRITICA' | 'RECOMENDADA'
  pregunta: string
  por_que_importa: string
  relacion_con_plan: string
  placeholder_ejemplo_respuesta: string
}

export interface ReviewerCrossBlock {
  id: string
  bloque_afectado: number
  seccion_afectada: string
  severidad: 'Alta' | 'Media' | 'Baja'
  que_dice_actualmente: string
  que_se_declaro_que_lo_modifica: string
  turno_referencia: number
  cambio_propuesto: string
}

export interface ReviewerReportMeta {
  errores_alta: number
  errores_media: number
  errores_baja: number
  preguntas_criticas: number
  preguntas_recomendadas: number
  cross_block_changes_total: number
  confianza_general: 'Alta' | 'Media' | 'Baja'
  justificacion_confianza: string
}

export interface ReviewerReport {
  errors: ReviewerError[]
  questions: ReviewerQuestion[]
  cross_block_changes: ReviewerCrossBlock[]
  meta: ReviewerReportMeta
}

export interface DecisionUsuario {
  hallazgo_id: string
  tipo: 'error' | 'pregunta' | 'cross_block'
  decision: 'aprobado' | 'aprobado_con_cambios' | 'ignorado' | 'respondido'
  texto_editado?: string       // si aprobado_con_cambios
  respuesta_usuario?: string   // si respondido
}

// Snapshot del resumen al cerrar definitivamente un Paso. Se persiste como
// contenido JSON dentro del campo `Snapshot Resumen JSON` del turno snapshot.
// Decisión D5 (3 mayo 2026): el snapshot del Paso 3 incluye `plan` (plan curado).
export interface SnapshotPaso {
  paso: number
  proposito?: PropositorPE
  situacion?: SituacionPE
  datos_faltantes: string[]
  plan?: PlanoPE
  cerrado_en: string  // ISO datetime
  // Tipo de cierre que generó este snapshot:
  // - 'formal_paso': cierre formal del Paso entero post audit-reviewer.
  //   Implica que TODOS los sub-bloques del Paso están completos.
  // - 'intermedio_sub_bloque_3.0' | 'intermedio_sub_bloque_3.A': cierre
  //   intermedio cuando el modelo emite cierre_sugerido=true dentro del
  //   Paso 3 al terminar 3.0 o 3.A. NO implica Paso 3 terminado — solo
  //   ese sub-bloque. Sirve como marca "no re-litigar ese sub-bloque"
  //   sin que el modelo confunda con cierre formal del Paso.
  // Backward compat: snapshots viejos sin este campo se tratan como 'formal_paso'.
  cierre_tipo?: 'formal_paso' | 'intermedio_sub_bloque_3.0' | 'intermedio_sub_bloque_3.A'
}

export interface EntrevistaPE {
  id: string
  plan_id: string
  estado: 'En curso' | 'Pausada' | 'Completada'
  paso_actual: number
  sub_bloque_actual: string
  historial: TurnoPE[]
  ultima_actividad: string
  // Tracking de salud del PANEL_UPDATE (Fase 2 instrumentación)
  ultimo_panel_update_ok?: string                  // ISO datetime, último turno donde el PANEL_UPDATE se procesó OK
  turnos_sin_panel_consecutivos?: number           // contador; >=3 dispara panel_unhealthy
  retries_panel_update_acumulados?: number         // telemetría: total de retries para esta entrevista
  // Estado del flow de cierre+auditoría (feat/audit-reviewer Fase 1+)
  sub_estado_paso?: SubEstadoPaso                  // sub-estado del Paso actual; default 'en_curso'
  auditorias_paso_1_count?: number                 // cantidad de audits del Paso 1 (max 3)
  auditorias_paso_2_count?: number                 // cantidad de audits del Paso 2 (max 3)
  auditorias_paso_3_count?: number                 // cantidad de audits del Paso 3 (max 3)
}
