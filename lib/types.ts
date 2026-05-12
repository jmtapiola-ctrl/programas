export type Rol = 'Ejecutivo' | 'Operador' | 'Program Manager'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
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
export type EstadoPlanEstrategico = 'Borrador' | 'En entrevista' | 'Completado' | 'Archivado'
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
  alineacion_sr?: AlineacionSr
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
}

export type DependenciaTipo = 'dura' | 'blanda' | 'ninguna'
export type CostoBandaAncha = 'baja' | 'media' | 'alta'
export type EstadoMovimiento = 'aceptado' | 'editado' | 'quitado' | 'pendiente'

export interface MovimientoPE {
  id: string                // M-1, M-2, ...
  categoria: string         // auto-detectada por el modelo (no fija)
  nombre: string
  que_resuelve: string
  ataca_desvio: string      // ref a desvío Bloque 0-2 o capacidad del Propósito
  costo_banda_ancha: CostoBandaAncha
  costo_monetario: { rango_min_usd: number; rango_max_usd: number; nota?: string }
  ventana_temporal: { arranca: string; termina: string }  // YYYY-MM
  precondiciones: string[]  // ids de otros movimientos
  desbloquea: string[]      // ids de otros movimientos
  tipo_dependencia: DependenciaTipo
  dueno: string             // string libre en V1 (sin Organigrama)
  criterio_exito: string
  estado_usuario: EstadoMovimiento
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
  | 'costo' | 'ventana' | 'cantidad_precondiciones' | 'cantidad_desbloqueos'
  | 'criterio_exito' | 'estado_usuario'

// Discriminated union: cada modo tiene su shape específico de respuesta.
export type RespuestaEstructurada =
  | { modo: 'seleccion_unica'; movimiento_id: string }
  | { modo: 'seleccion_multiple_ranked'; ranking: Array<{ movimiento_id: string; posicion: number }> }
  | { modo: 'agrupacion_pares'; pares: Array<{ desde: string; hacia: string }> }
  | { modo: 'secuenciacion'; fases: Array<{ fase: string; movimientos: string[] }> }
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
