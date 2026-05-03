# Audit retroactivo Bloque 0-1 — Plan Sr de Terravinci

Fecha: 2026-05-03T02:28:34.931Z
Plan ID: `recFMWxoE5gTQQrf7`
Reviewer turno: `recTvbcxdrFwZjkd9`
Modelo: `gpt-5.5` · Reasoning effort: `high`

## Material auditado

- Conversación: turnos 1-44 del Airtable (44 turnos user/model).
- Resumen: piloto manual del script 28 (`28-resumen-bloque-0-1.md`, 8551 chars).
- Modo: **read-only / educativo** — los hallazgos quedan registrados pero NO se aplican al plan vivo.

## Métricas

| Métrica | Valor |
|---|---|
| Latencia | 202.1s |
| Costo | $0.417 USD |
| Input tokens | 20.136 |
| Output tokens | 12.641 (9.840 de reasoning) |
| Confianza general | **Alta** |

## Hallazgos

- **4 errores** (2 Alta · 2 Media · 0 Baja)
- **5 preguntas críticas** + **5 recomendadas**
- Cross-block changes: 0 (esperado 0 para Bloque 1)

## Errores detectados (4)

### 1. [Alta] E-01 (tipo 2)

- **Qué dice el resumen:** “Excepción condicional: ante reactivación masiva del crédito hipotecario tradicional, se podría penetrar marginalmente al sector inferior de la clase media-alta — clase media-alta-baja” y luego “sector inferior de clase media-alta”.
- **Qué se dijo en la conversación (turno 37):** “Observación: me confundi, quise ponerte ‘clase media-baja’.”
- **Cambio propuesto:** Reemplazar la excepción de “clase media-alta / clase media-alta-baja” por la corrección del usuario: “clase media-baja”. Además, dejar explícita la tensión con el fuera de scope original que excluía media-baja, para resolver si es una excepción condicional ante reactivación del crédito.

### 2. [Media] E-02 (tipo 3)

- **Qué dice el resumen:** “operación en CABA Oeste y GBA 3 de Febrero” y “Valor actual: Operando en CABA Oeste + GBA 3 de Febrero”.
- **Qué se dijo en la conversación (turno 5):** “CABA y GBA el desarrollo.” No aparece una declaración del usuario que especifique “GBA 3 de Febrero” como operación actual.
- **Cambio propuesto:** Cambiar por: “operación declarada en CABA y GBA”. Si se quiere usar “CABA Oeste” o “GBA 3 de Febrero”, marcarlos como datos a confirmar, salvo que existan fuera del material provisto.

### 3. [Media] E-03 (tipo 3)

- **Qué dice el resumen:** “Plan Sr con horizonte de 12 meses (desde mayo 2026 hasta fin de 2026 efectivamente, dado el contexto temporal).”
- **Qué se dijo en la conversación (turno 34):** “Horizonte temporal: ya lo tenemos definido — fin de 2026. Confirmo.” No se declaró una fecha de inicio en mayo ni una duración exacta de 12 meses.
- **Cambio propuesto:** Dejar simplemente: “Horizonte: fin de 2026”. Eliminar “12 meses” y “desde mayo 2026” salvo que sean confirmados explícitamente.

### 4. [Alta] E-04 (tipo 1)

- **Qué dice el resumen:** Solo aparece como proxy de confianza: “Google Reviews con 2.600 comentarios y 4,7 estrellas”, pero no queda registrada la precondición/riesgo crítico de sostener calidad y avance de obras para proteger la reputación.
- **Qué se dijo en la conversación (turno 39):** “Si descuidamos el primer punto, descuidando nuestra División de Producción, y surgiera algún problema grave (...) nuestra reputación se vería seriamente dañada y todos los cimientos sobres los que íbamos a construir nuestro plan desaparecerían.” Luego agregó que también aplica si “los avances de obra no sean los esperados”.
- **Cambio propuesto:** Agregar una nota de precondición/riesgo crítico a trasladar a Situación: sostener la reputación exige proteger la División de Producción, evitar incidentes graves de construcción y cumplir avances/inicios/finalizaciones de obra esperados; la confianza actual no depende solo de awareness sino de calidad y cumplimiento operativo.


## Preguntas críticas (5)

### C1. Q-C01

**Pregunta:** ¿Qué cuenta exactamente como “dueño” o “dueño hecho” en las métricas: reserva, boleto firmado, anticipo integrado, adjudicación desde PAI, escritura, entrega, unidad vendida o cliente/familia?

- **Por qué importa:** La meta central del plan usa “1.000+ dueños/mes”, “~6.000 en 2026” y conversiones futuras de PAI. Sin una definición operativa única, las áreas pueden optimizar métricas distintas o inflar resultados no comparables.
- **Relación con el plan:** Métrica de volumen/capacidad instalada, productividad, PAI y banco de tierras.
- **Ejemplo de respuesta:** “Dueño 2026 = contrato firmado con anticipo acreditado y unidad asignada. PAI no cuenta como dueño hasta que aplica a un departamento; se mide aparte como venta PAI.”

### C2. Q-C02

**Pregunta:** ¿Cuál es el baseline actual separado de empleados fijos y asesores comisionados, y cuál es la productividad actual de cada grupo para poder medir el 2x en fijos y +25% en asesores?

- **Por qué importa:** La métrica de productividad quedó definida en términos relativos, pero no se estableció la base de comparación. Sin baseline, no se puede saber si la organización realmente mejoró productividad o solo creció en headcount.
- **Relación con el plan:** Métrica de organización y productividad: 1.000+ personas, fijos 2x, asesores +25%.
- **Ejemplo de respuesta:** “Hoy tenemos 180 fijos y 70 asesores. Producimos 100 dueños/mes: 0,56 dueños/fijo/mes y 1,43 dueños/asesor/mes. El objetivo 2026 será 1,12 y 1,79 respectivamente.”

### C3. Q-C03

**Pregunta:** ¿Cómo se traduce el banco de tierras objetivo en cantidad de macrozonas, terrenos, m² vendibles, unidades potenciales, calendario trimestral de adquisición y capital máximo comprometible sin romper el buffer financiero del 20%?

- **Por qué importa:** “Tierras suficientes para 12-15k dueños en 2027 y 20k+ en 2028” es una dirección, pero todavía no es una especificación ejecutable. Si se compra de menos, no hay output futuro; si se compra de más o mal financiado, se compromete la solvencia.
- **Relación con el plan:** Métrica de banco de tierras, expansión geográfica y solidez financiera.
- **Ejemplo de respuesta:** “Necesitamos 8 macrozonas activas, 12 tierras escala condominio y 3 escala pueblo, equivalentes a X m² vendibles. Máximo capital propio comprometido: Y, con opciones a 6 meses y sin que el peor mes baje de 20% de buffer.”

### C4. Q-C04

**Pregunta:** Además de llegar a 200 ventas/mes en la sucursal piloto, ¿qué criterios definen que PAI está “graduado” y puede escalarse: churn, cobranza, CAC, reclamos, conversión esperada, cumplimiento legal/regulatorio y cashflow neto?

- **Por qué importa:** PAI fue incorporado como motor estratégico, pero solo se definió volumen de ventas y churn actual. Escalar un producto financiero/comercial masivo sin criterios de calidad puede generar caja aparente, reclamos, riesgo reputacional o descalce futuro.
- **Relación con el plan:** Métrica PAI graduado y escalado; confianza; banco de tierras; solidez financiera.
- **Ejemplo de respuesta:** “PAI gradúa si durante 3 meses logra 200 ventas/mes, churn mensual menor a X%, cobranza mayor a Y%, CAC menor a Z, cero incumplimientos regulatorios y reclamos bajo N por cada 100 clientes.”

### C5. Q-C05

**Pregunta:** ¿Qué métricas de guarda reputacional y de producción deben mantenerse mientras se escala: rating mínimo, reviews, incidentes cero, % de obras iniciadas, avanzadas y terminadas según cronograma?

- **Por qué importa:** El usuario declaró que un problema grave de construcción o retrasos sistemáticos podrían destruir la reputación sobre la que se apoya todo el plan. La confianza no se protege solo con PR; necesita umbrales operativos explícitos.
- **Relación con el plan:** Confianza como activo central, estabilidad del propósito y precondición de viabilidad del crecimiento 10x.
- **Ejemplo de respuesta:** “Mantener Google rating ≥4,7, reviews creciendo al menos X/mes, cero incidentes graves, 95% de obras con hitos mensuales cumplidos y 100% de desvíos críticos reportados al CEO.”


## Preguntas recomendadas (5)

### R1. Q-R01

**Pregunta:** ¿Con qué metodología, proveedor, frecuencia, universo target y set de competidores se va a medir el 90%+ de awareness y el ranking #1 en confianza?

- **Por qué importa:** La métrica de confianza es central, pero la forma de medición puede cambiar completamente el resultado. Definirla evita discusiones posteriores sobre si la meta se cumplió o no.
- **Relación con el plan:** Métrica de confianza: awareness asistido y ranking #1 vs. inmobiliarias, desarrolladores y constructoras.
- **Ejemplo de respuesta:** “Medición trimestral con consultora externa, muestra CABA/GBA clase media interesada en vivienda, awareness asistido de marcas del Grupo y ranking de confianza contra 10 competidores predefinidos.”

### R2. Q-R02

**Pregunta:** ¿Qué significa operativamente “clase media” para este plan: rango de ingresos, cuota máxima, anticipo, ticket, ubicación, tipo de producto y criterios de exclusión?

- **Por qué importa:** El foco excluye media-baja, baja, media-alta y alta, pero no define el borde operativo. Sin esa definición, un terreno o producto puede entrar al plan con una interpretación laxa del segmento.
- **Relación con el plan:** Fuera de scope por segmento, compra de tierras, diseño de producto y marketing.
- **Ejemplo de respuesta:** “Cliente clase media = hogar con ingresos entre X e Y, capacidad de cuota de Z, anticipo máximo de A, producto entre B y C m², sin amenities premium y con financiación a largo plazo.”

### R3. Q-R03

**Pregunta:** ¿Quién es dueño de cada métrica del Plan Sr dentro de la mesa chica y con qué cadencia se revisan avances, desvíos y decisiones de foco?

- **Por qué importa:** Se identificaron CEO, CFO y Director Comercial, pero no se asignó accountability por métrica. En un plan paraguas, la falta de dueño puede hacer que las métricas queden como aspiraciones sin seguimiento.
- **Relación con el plan:** Plan Sr del Grupo y derivación a planes Jr de Spazios, Divoi, Más Dueños y áreas funcionales.
- **Ejemplo de respuesta:** “CEO dueño de volumen/operación, CFO de solvencia y banco de tierras, Director Comercial de PAI y asesores, Fundador de marca/confianza; revisión quincenal y comité mensual.”

### R4. Q-R04

**Pregunta:** ¿Cuáles son los hitos intermedios mensuales o trimestrales para validar la rampa hacia 1.000+ dueños/mes antes de fin de 2026?

- **Por qué importa:** La meta final está clara, pero una rampa vertical necesita puntos de control. Sin hitos intermedios, el plan puede descubrir demasiado tarde que no llega al run-rate objetivo.
- **Relación con el plan:** Métrica de volumen/capacidad instalada y horizonte fin 2026.
- **Ejemplo de respuesta:** “Junio: 200/mes; agosto: 400/mes; octubre: 700/mes; diciembre: 1.000+/mes sostenido, con definición de sostenido como 3 meses consecutivos.”

### R5. Q-R05

**Pregunta:** ¿Qué implica concretamente pasar de “3 empresas” a una “estructura multi-empresa coordinada”: cuántas empresas o unidades nuevas, qué roles tendrán y qué interfaces críticas deben existir?

- **Por qué importa:** El propósito declara una transformación estructural, pero todavía no se definió la forma objetivo. Aclararlo ayuda a que los planes Jr no creen estructuras incompatibles entre sí.
- **Relación con el plan:** Escena ideal organizacional y Plan Sr como paraguas de Spazios, Divoi, Más Dueños y áreas funcionales.
- **Ejemplo de respuesta:** “A fin de 2026 habrá X unidades: desarrolladoras por macrozona, Más Dueños retail, PAI, banco de tierras y shared services; cada una con SLA e interfaces definidas.”


## Importante

Este es un audit **retroactivo / educativo**. Algunos hallazgos pueden estar
ya resueltos en el plan actual (que continuó después de este cierre con
ajustes del Paso 2). El usuario debe distinguir manualmente cuáles siguen
vigentes.

Para procesarlos visualmente: navegá a /planes-estrategicos/recFMWxoE5gTQQrf7/cierre/1 —
Pantalla 3 va a mostrar todos los hallazgos con UI normal (aprobar/editar/ignorar/responder)
PERO el footer va a decir "Cerrar — los hallazgos quedan registrados" en lugar
de "Procesar todos los cambios y avanzar". Las decisiones se persisten para
auditoría pero no modifican el plan curado.
