# Diff comparativo — hallazgos audit Bloque 0-2 vs estado actual del plan

Fecha: 2026-05-03
Plan: `recFMWxoE5gTQQrf7` (Plan Sr de Terravinci)
Snapshot del plan: `diagnostico/output/16-plan-state.json` (lectura del 2026-05-03T02:53Z)

Metodología: lectura literal de cada campo del plan vs cita del cambio propuesto en el reporte. Sin LLM. Sin inferencia generosa: si el cambio propuesto exige un texto concreto y el plan no lo tiene, marca NO.

Leyenda:
- **YA APLICADO** → informativo. En Pantalla 3, marcar como `Ignorar` rápido.
- **PARCIAL** → cubierto indirectamente en otra sección, pero falta el texto específico que el reviewer pide. Decidir caso a caso si vale completar.
- **NO APLICADO** → acción real. Aprobar / editar en Pantalla 3.

---

## Errores (5)

| ID | Sev | Cambio propuesto | Estado actual del plan | Veredicto |
|---|---|---|---|---|
| ERR-001 | M | Declarar Área/alcance "Todo el Grupo Terravinci" | Field `Area` no existe en el record (sí existe `Tipo: "Sr"`). Ningún campo del propósito declara explícitamente alcance "Grupo entero". | **NO APLICADO** — acción real (decidir si entra como campo nuevo o como línea en `Proposito Escena`) |
| ERR-002 | M | Foco clase media + excepción condicionada a media-baja si reactiva crédito | `Proposito Fuera` excluye explícitamente media-baja sin excepciones. `Proposito Estabilidad` dice "Reactivación del crédito profundiza el propósito (no lo cambia)" — sin la excepción defensiva. | **NO APLICADO** — acción real (mismo cambio que CB7) |
| ERR-003 | M | "6 macrozonas: 5 CABA + GBA Oeste" como objetivo, expansión adicional GBA = buffer | `Proposito Metricas` "Expansión geográfica" sigue diciendo "Operando en 2+ partidos nuevos del GBA hacia fin de 2026" — métrica genérica, no las 6 macrozonas. `Situacion Desvio Cuantificado` SÍ habla de "6 macrozonas operativas", pero el propósito no lo refleja. | **PARCIAL** — situación lo tiene, métrica del propósito no. Acción real en `Proposito Metricas` |
| ERR-004 | B | "LATAM fuera del foco 2026 y también fuera de planes 2027. Desde 2027: GBA + resto de Argentina" | `Proposito Fuera` dice "Latam y mercados internacionales — Sale del foco 2026; se retoma desde 2027 hacia resto de Argentina, GBA y otras provincias." Texto ambiguo: "se retoma" puede leerse como LATAM se retoma. | **PARCIAL** — la idea de GBA en 2027 está, pero el texto literal sugiere lo contrario de lo que dijo el usuario. Acción real (clarificación textual chica) |
| ERR-005 | B | Agregar "relación política baja, relevante para DGIUR/permisos/expansión" en recursos actuales | `Situacion Recursos Actuales` lista relaciones externas (Tabakman, asesor financiero, abogados) sin mencionar política. DGIUR está cubierto en `Resistencias` (mitigación: Gerente de Asuntos Institucionales) y en `Recursos Faltantes`. La debilidad declarada explícita "política baja" no está. | **PARCIAL** — el problema está cubierto vía mitigación (Gerente Inst), pero la debilidad explícita falta. Decidir si vale agregarla |

---

## Cross-block changes hacia Bloque 1 (7)

| ID | Sev | Cambio propuesto | Estado actual del plan | Veredicto |
|---|---|---|---|---|
| CB1 | A | PAI motor explícito (piloto Liniers 200/mes jun-jul, 3-5 sucursales, 500-1.000 PAI/mes fin 2026, churn proxy gate) | `Proposito Escena` lo describe completo: "el modelo PAI de venta masiva en sucursales de alto tráfico debe haberse graduado y escalado a 3-5 sucursales generando 500-1.000 ventas mensuales". `Proposito Metricas` métrica "PAI graduado y escalado" lo cuantifica con todos los hitos: 200/mes piloto, 3-5 sucursales, 500-1.000/mes, churn proxy como gate antes de Q3. | **YA APLICADO** — informativo |
| CB2 | M | "Artesanal → industrial" reformulado como "máquina 100/mes → máquina 1.000+/mes" | `Proposito Escena` dice exactamente: "de una máquina dimensionada para 100 dueños/mes a una máquina dimensionada para 1.000+ dueños/mes". | **YA APLICADO** — informativo |
| CB3 | A | División Hacedora de Dueños (pasajes obra, retención, securitización orgánica) | `Proposito Escena` dice: "con una nueva División dedicada exclusivamente a 'hacer dueños' que asegure los pasajes de obra, la retención de clientes en cartera y la generación de liquidez vía securitización orgánica de flujos futuros". Tres componentes que pidió el reviewer presentes. | **YA APLICADO** — informativo |
| CB4 | M | Tierras 2028 fuera del foco 2026; compra en 2027 condicionada a macro | `Proposito Metricas` "Banco de tierras": "las de 2028 se compran en 2027 condicionado a evolución macro/electoral". `Proposito Fuera` lo refuerza: "Compra de tierras para producción 2028 durante 2026 — Se difiere a 2027 condicionado a evolución macro/electoral (riesgo de no reelección Milei)". Doble cobertura. | **YA APLICADO** — informativo |
| CB5 | M | Plataforma financiera: estructura legal/fiscal lista pero on hold hasta validar macro | `Proposito Escena`: "estructura legal y fiscal lista para capturar liquidez institucional desde 2027". `Situacion Desvios Secundarios` lo aclara: "Estructura legal/fiscal a dejar lista pero sin inscribir hasta confirmar evolución macro/electoral". Bien dividido entre propósito y situación. | **YA APLICADO** — informativo |
| CB6 | A | 800-1.000 personas + capa AI organizativa, headcount evitado a definir antes Q3 | `Proposito Escena`: "pasar de 250 a una organización en el orden de 800-1.000 personas (apalancada en una capa de AI organizativa —agentes y apps— que sustituye parcialmente la incorporación de personas)". `Proposito Metricas`: "800-1.000 personas totales (~300-400 asesores comisionados), dimensionamiento final ajustado por impacto de capa de AI organizativa". `Datos Faltantes`: "Impacto de la capa de AI organizativa en headcount esperado — a definir antes de Q3 2026". Cobertura completa en 3 puntos. | **YA APLICADO** — informativo |
| CB7 | M | Foco clase media + excepción condicionada a media-baja si reactiva crédito | Idem ERR-002: `Proposito Fuera` excluye media-baja sin condición; `Proposito Estabilidad` dice "Reactivación del crédito profundiza el propósito (no lo cambia)" sin la excepción. | **NO APLICADO** — acción real (es el mismo cambio que ERR-002, decidir una vez) |

---

## Preguntas críticas (5) — gap analysis sobre el plan actual

Las preguntas no son "cambios" sino faltantes. Verifico si el plan actual ya tiene la respuesta o si genuinamente falta.

| ID | Pregunta | Cubierta en el plan? | Veredicto |
|---|---|---|---|
| C1 | Estructura legal/contractual del PAI (riesgo regulatorio) | Plan habla del PAI como motor pero NO menciona estructura legal, custodia de fondos, riesgo CNV/defensa del consumidor. | **GAP REAL** — falta |
| C2 | Unit economics por macrozona (margen, CAC, payback, cash-in) | Plan tiene métricas agregadas (~200 dueños/mes/macrozona, US$10M caja, etc.) pero no unit economics por macrozona. | **GAP REAL** — falta |
| C3 | Capacidad cuantificada de Producción para escalar 10x | `Situacion Resistencias` item "Reputación" menciona "proteger a la División de Producción de la presión de escalar 10x"; `Recursos Faltantes` no cuantifica capacidad de Producción. | **PARCIAL** — el riesgo está nombrado pero la capacidad NO está cuantificada |
| C4 | Política de admisión/mora/cobranza/refinanciación a 30 años + PAI | Plan menciona modelo financiero a 30 años (5 anticipos, 360 cuotas, etc.) pero NO políticas de admisión, mora, refinanciación o provisiones. | **GAP REAL** — falta |
| C5 | Protocolo crisis JMT (reputación, burnout, controversia) | `Situacion Resistencias` tiene 6 items: cultura, macro, competidores, crédito, DGIUR, reputación general. NINGUNO sobre crisis JMT específicamente. | **GAP REAL** — falta (vulnerabilidad oculta en el moat principal) |

---

## Preguntas recomendadas (5) — gap analysis

| ID | Pregunta | Cubierta en el plan? | Veredicto |
|---|---|---|---|
| R1 | Gobernanza semanal de trade-offs (comité, cadencia, decisiones) | Plan no menciona estructura de gobernanza para trade-offs entre frentes. | **GAP REAL** — falta |
| R2 | Arquitectura CRM/BI/atribución end-to-end | Plan no menciona infraestructura de tracking de leads. | **GAP REAL** — falta |
| R3 | Comisiones/territorios/incentivos al escalar a 300 asesores | Plan menciona "objetivo ~300 asesores (3,33 unidades/asesor)" pero no políticas de transición. | **GAP REAL** — falta |
| R4 | Sistema de inteligencia competitiva y macro | Plan nombra competidores (IRSA, Mosquito) y la macro como amenaza, pero no sistema de monitoreo. | **GAP REAL** — falta |
| R5 | Estándares de experiencia/postventa Más Dueños | Plan dice "Más Dueños sub-desarrollada sin Director/a de Marca". No menciona estándares de experiencia para que herede confianza de Spazios. | **GAP REAL** — falta |

---

## Resumen ejecutivo

**Hallazgos para acción real (Pantalla 3 → aprobar/editar):**

| Tipo | IDs | Cantidad |
|---|---|---|
| Errores acción real | ERR-001 | 1 |
| Errores parciales (decidir si vale) | ERR-002, ERR-003, ERR-004, ERR-005 | 4 |
| Cross-block acción real | CB7 | 1 |
| Preguntas críticas con gap real | C1, C2, C4, C5 | 4 |
| Preguntas críticas parciales | C3 | 1 |
| Preguntas recomendadas con gap real | R1, R2, R3, R4, R5 | 5 |

**Hallazgos informativos (Pantalla 3 → ignorar rápido):**

| Tipo | IDs | Cantidad |
|---|---|---|
| Cross-block ya aplicados | CB1, CB2, CB3, CB4, CB5, CB6 | 6 |

**Total:** 22 hallazgos → 6 informativos (ignorar) + 16 reales o parciales (revisar / aprobar / editar).

**Observación clave sobre cross-blocks:**

6 de 7 cross-block changes hacia Bloque 1 están **YA APLICADOS** en el Plan Sr. Esto era esperable: el reviewer del Bloque 0-2 vio solo la conversación, no el plan, y por eso marcó "Confianza Media" sobre los cross-blocks. La conversación efectivamente declaró esos 6 cambios y el wizard los integró bien al cierre del Paso 1.

**El único cross-block que sí necesita acción es CB7** (excepción media-baja condicionada a reactivación de crédito) — coincide exactamente con ERR-002. Es **un solo cambio** real, registrado dos veces (una como error en el resumen del Paso 2, otra como inconsistencia retroactiva con el Paso 1).

**Lo más valioso del audit, ratificado por el diff:**

Los 4 gaps críticos C1, C2, C4, C5 son genuinos — el plan actual no los responde. Sumado a los 5 gaps recomendados R1-R5, son las 9 preguntas que efectivamente cubren agujeros del plan. La evaluación previa del usuario ("3 nuevas críticas no detectadas en análisis previo: C1, C2, C5") se confirma con la lectura literal del plan.

**Sugerencia para Pantalla 3:**

1. Marcar como `Ignorar` los 6 CB ya aplicados (CB1-CB6 menos CB7).
2. Aprobar ERR-001 + decidir formato (campo `Area` nuevo o línea en `Proposito Escena`).
3. Aprobar ERR-002 / CB7 como un único cambio (mismo texto, dos secciones afectadas: `Proposito Fuera` + `Proposito Estabilidad`).
4. Editar ERR-003 (cambio en `Proposito Metricas` "Expansión geográfica") y ERR-004 (clarificación textual chica en `Proposito Fuera` LATAM).
5. ERR-005 — judgement call (ya cubierto por mitigación; agregar como debilidad explícita o no).
6. Responder C1-C5 + R1-R5 (las que decida priorizar) — son las que justifican la inversión cross-provider.
