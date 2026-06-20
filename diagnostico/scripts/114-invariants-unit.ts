// Fase B (blindaje): validador de invariantes paso↔sub_bloque. $0, sin red.
import { reconcilePasoSubBloque, pasoDeSubBloque } from '../../lib/wizard-invariants'
let pass = 0, fail = 0
function check(n: string, cond: boolean, extra?: string){ if(cond){pass++;console.log(`  ✓ ${n}`)} else {fail++;console.error(`  ✗ ${n}${extra?` — ${extra}`:''}`)} }

// pasoDeSubBloque
check('pasoDeSubBloque 0', pasoDeSubBloque('0') === 0)
check('pasoDeSubBloque 1.C', pasoDeSubBloque('1.C') === 1)
check('pasoDeSubBloque 2.G', pasoDeSubBloque('2.G') === 2)
check('pasoDeSubBloque 3.0', pasoDeSubBloque('3.0') === 3)
check('pasoDeSubBloque 3.E', pasoDeSubBloque('3.E') === 3)
check('pasoDeSubBloque completado', pasoDeSubBloque('completado') === 4)
check('pasoDeSubBloque desconocido', pasoDeSubBloque('9.Z') === -1)

// Caso real Lab 10x: paso=3, sub=2.G → sube sub a 3.0 (no regresa el paso).
{
  const r = reconcilePasoSubBloque(3, '2.G')
  console.log('Lab 10x (paso 3 / sub 2.G):')
  check('corregido', r.corregido)
  check('paso queda 3', r.paso_actual === 3)
  check('sub sube a 3.0', r.sub_bloque_actual === '3.0', r.sub_bloque_actual)
}

// sub_bloque lidera: paso=2, sub=3.B → sube paso a 3 (sub intacto).
{
  const r = reconcilePasoSubBloque(2, '3.B')
  console.log('sub lidera (paso 2 / sub 3.B):')
  check('corregido', r.corregido)
  check('paso sube a 3', r.paso_actual === 3)
  check('sub queda 3.B', r.sub_bloque_actual === '3.B')
}

// Consistente: no toca.
{
  const r = reconcilePasoSubBloque(3, '3.C')
  console.log('consistente (paso 3 / sub 3.C):')
  check('NO corregido', !r.corregido)
  check('paso 3', r.paso_actual === 3)
  check('sub 3.C', r.sub_bloque_actual === '3.C')
}

// Desconocido: no toca (defensivo).
{
  const r = reconcilePasoSubBloque(3, '9.Z')
  console.log('sub desconocido (paso 3 / sub 9.Z):')
  check('NO corregido', !r.corregido)
  check('paso 3 intacto', r.paso_actual === 3)
  check('sub 9.Z intacto', r.sub_bloque_actual === '9.Z')
}

// Nunca regresa: paso=3 sub=2.G no debe bajar paso a 2.
{
  const r = reconcilePasoSubBloque(3, '2.G')
  check('nunca regresa el paso (no baja a 2)', r.paso_actual === 3)
}

console.log(`\n${pass}/${pass+fail} checks verde.`)
process.exit(fail === 0 ? 0 : 1)
