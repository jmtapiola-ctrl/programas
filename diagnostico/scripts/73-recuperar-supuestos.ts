// Recupera los 8 supuestos enumerados por el modelo en prosa y los persiste en
// plan.plan.preparativos.supuestos_exogenos con calificaciones vacías para que
// el SupuestosFormModal pueda mostrarlos.
//
// Estrategia:
//   1. Buscar el turno modelo con la enumeración completa (matchea "S-1 (").
//   2. Extraer cada "S-N (tipo) — descripcion" con regex.
//   3. Construir el array y persistir a plan.plan.preparativos.supuestos_exogenos.

import { getEntrevistaPE, getTurnosPE, getPlanEstrategico, updatePlanEstrategico } from '@/lib/airtable'
import type { SupuestoExogenoPE, SupuestoTipo, PlanoPE } from '@/lib/types'

const TIPOS_VALIDOS: SupuestoTipo[] = ['macro', 'mercado', 'regulatorio', 'social']

// Normaliza el tipo a uno de los 4 enums. Mapea sinónimos comunes.
function normalizarTipo(raw: string): SupuestoTipo {
  const t = raw.toLowerCase().trim()
  if (t.includes('macro') || t.includes('electoral')) return 'macro'
  if (t.includes('mercad') || t.includes('crédit') || t.includes('credit') || t.includes('compet')) return 'mercado'
  if (t.includes('regul')) return 'regulatorio'
  if (t.includes('social') || t.includes('cultur') || t.includes('talent')) return 'social'
  return 'macro'  // fallback razonable para 'general'
}

async function main() {
  const PLAN_ID = 'recFMWxoE5gTQQrf7'
  const PLAN_DUMMY_ID = 'recEsoKMENVQI8NUb'
  if ((PLAN_ID as string) === (PLAN_DUMMY_ID as string)) throw new Error('Sanity check')

  const ent = await getEntrevistaPE(PLAN_ID)
  if (!ent) throw new Error('Entrevista no encontrada')
  const turnos = await getTurnosPE(ent.id!)

  // Buscar el turno modelo más reciente que contenga "S-1 (" como inicio de enumeración.
  const candidatos = [...turnos].reverse().filter(t =>
    t.rol === 'model' && /\bS-1\s*\(/.test(t.contenido ?? '')
  )

  if (candidatos.length === 0) {
    console.log('❌ No encontré turno con enumeración "S-1 (". Listando últimos 5 turnos modelo:')
    const ultimos = [...turnos].reverse().filter(t => t.rol === 'model').slice(0, 5)
    for (const t of ultimos) {
      const ts = (t as any).timestamp ? new Date((t as any).timestamp).toLocaleString('es-AR') : '?'
      console.log(`  [${ts}] len=${(t.contenido ?? '').length}`)
    }
    process.exit(1)
  }

  const turno = candidatos[0]
  const ts = (turno as any).timestamp ? new Date((turno as any).timestamp).toLocaleString('es-AR') : '?'
  console.log(`[recup] Turno fuente: [${ts}] len=${(turno.contenido ?? '').length}`)

  const contenido = turno.contenido ?? ''

  // Regex que captura "S-N (tipo) — descripcion" hasta el próximo "S-N+1" o doble blank line o final.
  // Modelos pueden usar "—" (em dash) o "-" (hyphen) o ":" como separador. Tipo es opcional con paréntesis.
  const matches: { numero: number; tipo: string; descripcion: string }[] = []
  // Patrón: "S-N (tipo) — descripción" o "S-N — descripción" o "S-N: descripción"
  const re = /\*?\*?S-(\d+)\s*(?:\(([^)]+)\))?\s*[—\-:]\s*([^]*?)(?=(?:\*?\*?S-\d+\s*[(\-—:])|\n\n\*?\*?Pregunta|\n\n¿|\n\n\[|$)/g

  let m: RegExpExecArray | null
  while ((m = re.exec(contenido)) !== null) {
    const numero = parseInt(m[1], 10)
    const tipoRaw = m[2] ?? 'macro'
    let descripcion = m[3].trim()
    // Limpiar trailing whitespace y "Hoy implícito en:..." que suele venir al final.
    descripcion = descripcion.replace(/\n\s*Hoy implícito en:[\s\S]*$/i, '').trim()
    descripcion = descripcion.replace(/\*+/g, '').trim()
    if (descripcion.length > 0) {
      matches.push({ numero, tipo: tipoRaw, descripcion })
    }
  }

  console.log(`[recup] Extracted ${matches.length} supuestos del prosa:`)
  for (const sup of matches) {
    console.log(`\n  S-${sup.numero} (tipo raw: "${sup.tipo}" → norm: "${normalizarTipo(sup.tipo)}")`)
    console.log(`    ${sup.descripcion.slice(0, 200)}${sup.descripcion.length > 200 ? '…' : ''}`)
  }

  if (matches.length === 0) {
    console.log('\n[recup] ❌ No se pudo parsear ningún supuesto. Mostrando primeros 2000 chars del turno para inspección manual:')
    console.log(contenido.slice(0, 2000))
    process.exit(1)
  }

  // Confirmar antes de persistir
  console.log(`\n[recup] Voy a persistir ${matches.length} supuestos en plan.plan.preparativos.supuestos_exogenos con todas las calificaciones en "" (pendientes).`)

  // Construir array
  const supuestos: SupuestoExogenoPE[] = matches.map(m => ({
    descripcion: m.descripcion,
    tipo: normalizarTipo(m.tipo),
    probabilidad: '',
    impacto_signo: '',
    impacto_magnitud: '',
    estrategia: '',
    razon: '',
  }))

  // Leer plan actual + mergear con preparativos existentes
  const plan = await getPlanEstrategico(PLAN_ID)
  const planExistente: PlanoPE = plan.plan ?? {}
  const preparativosExistentes = planExistente.preparativos ?? {
    areas_afectadas: [],
    supuestos_exogenos: [],
    priorizacion_inicial: { desvio_elegido: '', razon: '' },
    criterio_exito: { por_metrica: [], zona_fracaso: '' },
  }

  const planActualizado: PlanoPE = {
    ...planExistente,
    preparativos: {
      ...preparativosExistentes,
      supuestos_exogenos: supuestos,
    },
  }

  await updatePlanEstrategico(PLAN_ID, { plan: planActualizado })
  console.log(`\n[recup] ✓ Persistido. Recargá la entrevista y debería aparecer el banner "Completar supuestos →".`)
}

main().catch(e => { console.error('[recup] FATAL:', e); process.exit(1) })
