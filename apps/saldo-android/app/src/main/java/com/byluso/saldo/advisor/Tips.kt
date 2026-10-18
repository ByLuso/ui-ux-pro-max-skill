package com.byluso.saldo.advisor

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

data class Tip(
    val id: String,
    val topic: String,
    val title: String,
    val body: String,
    /** Generado con tus datos. */
    val personal: Boolean = false,
    /** Ahorro mensual estimado si se aplica, en €. */
    val monthlySaving: Double? = null,
    /** Obra en la que se basa el consejo, si la hay. */
    val source: String? = null,
)

object Tips {
    val topics = listOf(
        "Ahorro", "Planificación", "Inversión", "Psicología", "Asesoramiento", "Vivienda", "Coche", "Comida",
        "Ocio", "Suscripciones", "Compras", "Deudas", "Bancos", "Impuestos", "Hábitos",
    )

    /** M. Casanovas, "El asesoramiento financiero, la figura del Asesor Financiero y de las E.A.F.I.s",
     *  discurso de ingreso en la Real Academia de Ciencias Económicas y Financieras (2017). */
    const val CASANOVAS = "M. Casanovas, discurso RACEF (2017)"

    private val es = Locale.forLanguageTag("es-ES")
    private val nf = NumberFormat.getNumberInstance(es).apply { maximumFractionDigits = 0 }
    private fun e(v: Double) = "${nf.format(v)} €"
    private fun p(v: Double) = "${v.roundToInt()} %"

    /** Consejos generados a partir de tu análisis, ordenados por impacto. */
    fun personal(a: Analysis): List<Tip> {
        if (a.income <= 0) {
            return listOf(
                Tip(
                    "p-income", "Ahorro", "Indica tu sueldo neto",
                    "No he detectado ingresos en este periodo. Escribe tu sueldo neto mensual arriba para calcular cuánto deberías gastar en cada partida.",
                    personal = true,
                )
            )
        }
        val out = mutableListOf<Tip>()
        val rec = a.income * 0.20
        if (a.savings < rec) {
            val gap = rec - max(0.0, a.savings)
            out += Tip(
                "p-save", "Ahorro", "Te faltan ${e(gap)} al mes para ahorrar el 20 %",
                "Con tu sueldo de ${e(a.income)} lo recomendable es apartar ${e(rec)} al mes. Ahora ahorras ${e(max(0.0, a.savings))} (${p(max(0.0, a.savingsPct))}). " +
                    "Programa una transferencia automática a otra cuenta el mismo día que cobras: lo que no ves, no lo gastas.",
                personal = true, monthlySaving = gap,
            )
        } else {
            out += Tip(
                "p-save-ok", "Ahorro", "¡Ahorras el ${p(a.savingsPct)} de tu sueldo!",
                "Superas el 20 % recomendado (${e(rec)}). Pon a trabajar el excedente: completa tu colchón de emergencia y después valora una cuenta remunerada, Letras del Tesoro o fondos indexados.",
                personal = true,
            )
        }
        a.groups.filter { it.group != BudgetGroup.SAVINGS && it.over }
            .sortedByDescending { it.delta }
            .forEach { g ->
                val pct = a.pctOfIncome(g.actual)
                out += Tip(
                    "p-over-${g.group.name}", topicOf(g.group),
                    "${g.group.emoji} ${g.group.label}: te pasas ${e(g.delta)} al mes",
                    "Gastas ${e(g.actual)} (${p(pct)} de tu sueldo) y lo recomendado es ${e(g.recommended)} (${g.group.recommendedPct} %). " +
                        "Ajustándolo ahorrarías ${e(g.delta)} al mes, ${e(g.delta * 12)} al año. ${adviceFor(g.group)}",
                    personal = true, monthlySaving = g.delta,
                )
            }
        val cushion = a.emergencyTarget
        val bal = a.balance ?: 0.0
        if (bal < cushion) {
            val months = FinanceAdvisor.monthsToReach(cushion - bal, max(rec, a.savings))
            out += Tip(
                "p-cushion", "Ahorro", "Colchón de emergencia: te faltan ${e(cushion - bal)}",
                "Lo ideal es tener unos 6 meses de gastos básicos a mano (${e(cushion)}). " +
                    (months?.let { "Ahorrando ${e(max(rec, a.savings))} al mes lo tendrías en unos $it meses. " } ?: "") +
                    "Guárdalo en una cuenta separada y remunerada, no en la del día a día.",
                personal = true,
            )
        } else {
            out += Tip(
                "p-cushion-ok", "Inversión", "Tu colchón de emergencia está cubierto",
                "Tu saldo cubre unos ${a.monthsCovered?.let { "%.1f".format(es, it) } ?: "6"} meses de gastos. El dinero que pase de ${e(cushion)} puede ir a objetivos a medio plazo o a inversión a largo plazo.",
                personal = true,
            )
        }
        if (a.subscriptions.isNotEmpty()) {
            val total = a.subscriptions.sumOf { it.second }
            out += Tip(
                "p-subs", "Suscripciones", "Tienes ${a.subscriptions.size} suscripciones: ${e(total)} al mes",
                "Son ${e(total * 12)} al año: " + a.subscriptions.take(6).joinToString(", ") { "${it.first} (${e(it.second)})" } +
                    ". Cancela las que no hayas usado en el último mes y rota las plataformas de streaming en vez de tenerlas todas a la vez.",
                personal = true, monthlySaving = total * 0.3,
            )
        }
        val discretionary = a.groups.filter { it.group in DISCRETIONARY }.sumOf { it.actual }
        val fixed = a.groups.filter { it.group in NON_DISCRETIONARY }.sumOf { it.actual }
        if (a.expenses > 0 && discretionary > 0) {
            out += Tip(
                "p-discretionary", "Planificación",
                "Gastos discrecionales: ${e(discretionary)} al mes (${p(discretionary / a.expenses * 100)} de tu gasto)",
                "Restaurantes, ocio, suscripciones y compras son los más fáciles de ajustar; recortarlos un 10 % te ahorraría ${e(discretionary * 0.1)} al mes. " +
                    "Los no discrecionales (vivienda, comida, transporte y salud: ${e(fixed)}) cuestan más de reducir, pero también se puede: compara tarifas de suministros y agrupa seguros o deudas para negociar mejores condiciones.",
                personal = true, monthlySaving = discretionary * 0.1, source = CASANOVAS,
            )
        }
        val (n, sum) = a.smallPurchases
        if (n >= 8) {
            out += Tip(
                "p-small", "Hábitos", "$n pequeñas compras de menos de 6 € suman ${e(sum)}",
                "Los gastos hormiga (cafés, snacks, apps) pasan desapercibidos. Reducirlos a la mitad te ahorraría unos ${e(sum / 2)} en este periodo.",
                personal = true, monthlySaving = sum / 2,
            )
        }
        out += Tip(
            "p-house", "Vivienda", "Vivienda que te puedes permitir",
            "Alquiler de hasta ${e(a.housing.maxRent)} al mes. Para comprar, una cuota de hipoteca de hasta ${e(a.housing.maxMortgagePayment)} " +
                "da para una vivienda de unos ${e(a.housing.maxHomePrice)}, pero necesitarías ahorrados unos ${e(a.housing.cashNeeded)} (20 % de entrada + ~10 % de impuestos y gastos).",
            personal = true,
        )
        out += Tip(
            "p-car", "Coche", "Coche que te puedes permitir",
            "Precio de hasta ${e(a.car.maxCarPrice)} y un coste total (cuota, seguro, gasolina y mantenimiento) de hasta ${e(a.car.maxMonthlyCost)} al mes. " +
                "Si lo financias, intenta dar un 20 % de entrada, no pasar de 4 años y que la cuota no supere ${e(a.car.maxLoanPayment)}.",
            personal = true,
        )
        return out.sortedByDescending { it.monthlySaving ?: 0.0 }
    }

    private val DISCRETIONARY = setOf(BudgetGroup.DINING, BudgetGroup.LEISURE, BudgetGroup.SUBSCRIPTIONS, BudgetGroup.SHOPPING)
    private val NON_DISCRETIONARY = setOf(BudgetGroup.HOUSING, BudgetGroup.FOOD, BudgetGroup.TRANSPORT, BudgetGroup.HEALTH)

    private fun topicOf(g: BudgetGroup) = when (g) {
        BudgetGroup.HOUSING -> "Vivienda"
        BudgetGroup.FOOD -> "Comida"
        BudgetGroup.TRANSPORT -> "Coche"
        BudgetGroup.DINING, BudgetGroup.LEISURE -> "Ocio"
        BudgetGroup.SUBSCRIPTIONS -> "Suscripciones"
        BudgetGroup.SHOPPING -> "Compras"
        else -> "Hábitos"
    }

    private fun adviceFor(g: BudgetGroup) = when (g) {
        BudgetGroup.HOUSING -> "Revisa tu tarifa de luz y gas, y si el alquiler supera el 30 %, valora compartir piso o negociar la renovación."
        BudgetGroup.FOOD -> "Planifica el menú semanal, haz la lista antes de ir y compara marca blanca: suele ser un 20–30 % más barata."
        BudgetGroup.TRANSPORT -> "Compara el seguro cada año, conduce de forma eficiente y valora el abono de transporte para el día a día."
        BudgetGroup.DINING -> "Fija un número de comidas fuera a la semana y lleva táper al trabajo algunos días."
        BudgetGroup.LEISURE -> "Ponte un presupuesto fijo de ocio al mes y busca planes gratuitos o con descuento."
        BudgetGroup.SUBSCRIPTIONS -> "Quédate solo con las que usas cada semana."
        BudgetGroup.HEALTH -> "Pregunta por genéricos en la farmacia y compara seguros médicos."
        BudgetGroup.SHOPPING -> "Aplica la regla de las 48 horas antes de comprar algo que no necesitas."
        else -> "Revisa los movimientos sin categoría para saber a dónde va ese dinero."
    }

    val general: List<Tip> = listOf(
        Tip("g1", "Ahorro", "Págate primero a ti", "En cuanto cobres, transfiere automáticamente el ahorro a otra cuenta. Gasta lo que queda, no ahorres lo que sobra."),
        Tip("g2", "Ahorro", "Regla 50/30/20", "50 % del sueldo para necesidades (vivienda, comida, transporte), 30 % para deseos y 20 % para ahorro e inversión."),
        Tip("g3", "Ahorro", "Fondo de emergencia de 3 a 6 meses", "Ten entre 3 y 6 meses de gastos básicos en una cuenta aparte y líquida. Te evita endeudarte ante imprevistos."),
        Tip("g4", "Ahorro", "Objetivos con nombre y fecha", "\"Viaje a Japón, 2.000 € en 10 meses\" motiva más que \"ahorrar\". Divide el objetivo entre los meses y prográmalo."),
        Tip("g5", "Ahorro", "Redondeo automático", "Muchos bancos redondean cada compra al euro y apartan la diferencia. Son pocos céntimos que suman cientos al año."),
        Tip("g6", "Ahorro", "Ahorra las subidas de sueldo", "Cuando cobres más (subida, paga extra, devolución de Hacienda), destina al menos la mitad al ahorro antes de acostumbrarte."),
        Tip("g7", "Vivienda", "El alquiler, como máximo el 30 %", "Si el alquiler o la hipoteca supera el 30–35 % de tu sueldo neto, te quedará poco margen para ahorrar."),
        Tip("g8", "Vivienda", "Compara la tarifa de luz", "Compara mercado libre y tarifa regulada (PVPC) con tu consumo real. Pon lavadora y lavavajillas en horas valle."),
        Tip("g9", "Vivienda", "Ahorra en calefacción", "Bajar 1 °C el termostato reduce alrededor de un 7 % el consumo. Revisa ventanas y burletes."),
        Tip("g10", "Vivienda", "Antes de comprar casa", "Necesitarás ahorrado en torno al 30 % del precio: 20 % de entrada y ~10 % de impuestos (ITP o IVA), notaría y registro."),
        Tip("g11", "Vivienda", "Revisa la hipoteca", "Compara el diferencial con otras entidades; una subrogación o cambio de banco puede ahorrarte mucho a largo plazo."),
        Tip("g12", "Coche", "Regla 20/4/10 para el coche", "20 % de entrada, financiación máxima de 4 años y gasto total del coche por debajo del 10 % de tu sueldo."),
        Tip("g13", "Coche", "Compara el seguro cada año", "Pide precio a varias aseguradoras antes de renovar; la diferencia por la misma cobertura puede ser de cientos de euros."),
        Tip("g14", "Coche", "Conducción eficiente", "Neumáticos a la presión correcta, velocidad constante y marchas largas reducen hasta un 15 % el consumo."),
        Tip("g15", "Coche", "Echa gasolina donde sea más barato", "Usa comparadores de precios de gasolineras: entre estaciones cercanas hay a menudo 10–15 céntimos por litro."),
        Tip("g16", "Coche", "¿Necesitas coche propio?", "Si lo usas poco, suma seguro, impuesto, ITV, parking y mantenimiento: a veces sale más barato transporte público, carsharing o alquiler puntual."),
        Tip("g17", "Comida", "Planifica el menú semanal", "Decide las comidas de la semana y compra solo lo necesario. Reduce desperdicio y compras impulsivas."),
        Tip("g18", "Comida", "Marca blanca", "Los productos de marca blanca suelen costar un 20–30 % menos con calidad similar."),
        Tip("g19", "Comida", "Nunca compres con hambre", "Ir al supermercado con hambre aumenta el gasto en caprichos. Lleva lista y cíñete a ella."),
        Tip("g20", "Comida", "Cocina en cantidad", "Cocinar por tandas (batch cooking) y congelar ahorra dinero y tiempo, y evita pedir comida a domicilio."),
        Tip("g21", "Ocio", "Presupuesto de ocio fijo", "Decide al principio de mes cuánto vas a gastar en ocio y retíralo a una tarjeta o cuenta aparte."),
        Tip("g22", "Ocio", "Planes gratis", "Museos con entrada gratuita, rutas, eventos municipales, bibliotecas: hay mucho ocio sin coste."),
        Tip("g23", "Ocio", "Viaja fuera de temporada", "Reservar con antelación y viajar en temporada baja abarata vuelos y alojamiento a la mitad."),
        Tip("g24", "Suscripciones", "Audita tus suscripciones", "Revisa cada trimestre lo que pagas cada mes. Cancela lo que no uses y comparte planes familiares cuando se pueda."),
        Tip("g25", "Suscripciones", "Revisa tu tarifa de móvil", "Compara operadoras: muchas tarifas con los mismos gigas cuestan la mitad en operadoras low cost."),
        Tip("g26", "Compras", "Regla de las 48 horas", "Antes de una compra no necesaria, espera 48 horas. Muchas veces se te pasan las ganas."),
        Tip("g27", "Compras", "Coste por uso", "Divide el precio entre las veces que lo usarás. Algo caro y duradero puede salir más barato que algo barato que se rompe."),
        Tip("g28", "Compras", "Compra de segunda mano", "Ropa, muebles, electrónica y libros de segunda mano pueden costar un 50–70 % menos."),
        Tip("g29", "Compras", "Cuidado con el \"compra ahora, paga después\"", "Fraccionar compras pequeñas hace que gastes más y acumules pagos. Úsalo solo para imprevistos necesarios."),
        Tip("g30", "Deudas", "Paga primero la deuda más cara", "Liquida antes las deudas con mayor interés (tarjetas revolving, créditos rápidos). Su TAE puede superar el 20 %."),
        Tip("g31", "Deudas", "Evita las tarjetas revolving", "El pago aplazado con cuota fija puede hacer que una compra cueste el doble. Paga la tarjeta a fin de mes."),
        Tip("g32", "Deudas", "Las cuotas, como máximo el 35 %", "La suma de todas tus deudas (hipoteca incluida) no debería superar el 35 % de tus ingresos netos."),
        Tip("g33", "Inversión", "Interés compuesto", "Invertir 100 € al mes al 6 % anual durante 30 años da unos 100.000 €, de los que solo 36.000 € son tu aportación."),
        Tip("g34", "Inversión", "Fondos indexados", "Invertir a largo plazo en fondos indexados de bajo coste y diversificados es una de las formas más sencillas de hacer crecer el ahorro."),
        Tip("g35", "Inversión", "Letras del Tesoro y cuentas remuneradas", "Para el colchón o el dinero a corto plazo, busca productos sin riesgo y con algo de rentabilidad en lugar de dejarlo a 0 %."),
        Tip("g36", "Inversión", "No inviertas lo que vas a necesitar", "Solo invierte en bolsa el dinero que no necesitarás en al menos 5 años. El colchón de emergencia, siempre aparte."),
        Tip("g37", "Bancos", "Cero comisiones", "Si pagas comisiones de mantenimiento o por la tarjeta, negocia o cambia a un banco sin comisiones."),
        Tip("g38", "Bancos", "Separa cuentas por objetivo", "Una cuenta para gastos fijos, otra para el día a día y otra para el ahorro te da control sin esfuerzo."),
        Tip("g39", "Impuestos", "Revisa tus deducciones", "En la renta revisa deducciones autonómicas (alquiler, donativos, gastos educativos) y aportaciones a planes de pensiones."),
        Tip("g40", "Impuestos", "Guarda tus facturas", "Guarda justificantes de donativos, cuotas sindicales o de colegios profesionales: pueden desgravar."),
        Tip("g41", "Hábitos", "Revisa tus gastos cada semana", "Cinco minutos a la semana mirando a dónde va tu dinero cambian más tus hábitos que cualquier propósito de año nuevo."),
        Tip("g42", "Hábitos", "Paga con débito, no con crédito", "Pagar con lo que ya tienes evita gastar dinero que aún no has ganado."),
        Tip("g43", "Hábitos", "Gastos hormiga", "Un café de 2 € al día son más de 700 € al año. No hace falta eliminarlos, solo ser consciente."),
        Tip("g44", "Hábitos", "Desactiva las compras en un clic", "Eliminar tarjetas guardadas y apps de compras reduce las compras impulsivas."),
    ) + fromCasanovas

    /** Consejos basados en el discurso de M. Casanovas sobre asesoramiento financiero. */
    private val fromCasanovas: List<Tip> get() = listOf(
        Tip("c1", "Inversión", "Rentabilidad, seguridad y liquidez: elige dos",
            "Ningún producto da las tres a la vez. Más rentabilidad implica más riesgo o menos liquidez, porque se paga una prima por asumirlos. Decide qué priorizas según cuándo vas a necesitar el dinero.", source = CASANOVAS),
        Tip("c2", "Inversión", "Mira la rentabilidad real, neta y después de impuestos",
            "La rentabilidad anunciada suele ser nominal y bruta. Réstale la inflación, las comisiones y los impuestos: lo que importa es lo que te queda. Un depósito que rinde menos que el IPC te hace perder poder adquisitivo.", source = CASANOVAS),
        Tip("c3", "Inversión", "Pregunta cuánto cuesta salir",
            "Antes de contratar, averigua si puedes recuperar el dinero antes de tiempo y con qué penalización. Algunos productos solo permiten rescatar sin coste en fechas concretas (ventanas de liquidez).", source = CASANOVAS),
        Tip("c4", "Bancos", "Fondo de Garantía de Depósitos: hasta 100.000 €",
            "Los depósitos están cubiertos hasta 100.000 € por titular y entidad. Si tienes más en un mismo banco, repártelo entre varias entidades.", source = CASANOVAS),
        Tip("c5", "Inversión", "Fíjate en el indicador de riesgo del 1/6 al 6/6",
            "Los productos financieros llevan un indicador de riesgo: 1/6 es el más seguro y 6/6 el más arriesgado. Los candados avisan de que es difícil recuperar el dinero antes de tiempo y las exclamaciones, de que es un producto complejo. Si no lo entiendes, no lo contrates.", source = CASANOVAS),
        Tip("c6", "Inversión", "No contrates lo que no entiendas",
            "Las participaciones preferentes y la deuda subordinada se vendieron a ahorradores que no conocían sus riesgos. Pide que te expliquen en qué inviertes, qué puede salir mal y cómo recuperarías el dinero.", source = CASANOVAS),
        Tip("c7", "Planificación", "Conoce tu perfil de riesgo",
            "Tiene dos partes: la objetiva (cuánto puedes perder sin que afecte a tu vida, según ingresos, gastos y deudas) y la subjetiva (cuánto estás dispuesto a soportar sin ponerte nervioso). Revísalo cuando cambie tu situación.", source = CASANOVAS),
        Tip("c8", "Psicología", "Cuidado con el efecto rebaño",
            "Invertir en algo porque lo hace tu vecino, un famoso o todo el mundo es una decisión emocional. Las mismas noticias empujan a todos en la misma dirección y amplifican subidas y bajadas.", source = CASANOVAS),
        Tip("c9", "Psicología", "La aversión a la pérdida",
            "Nos duele más perder que nos alegra ganar: tendemos a vender pronto lo que sube y a aguantar lo que baja esperando recuperar. Decide antes de invertir cuándo venderías, y no lo cambies en caliente.", source = CASANOVAS),
        Tip("c10", "Psicología", "No reacciones en caliente a las noticias",
            "Ante caídas bruscas o malas noticias, los inversores tienden a sobrerreaccionar y vender. Los acontecimientos imprevisibles (\"cisnes negros\") ocurren: la defensa es un colchón de emergencia y una cartera diversificada, no adivinar el momento.", source = CASANOVAS),
        Tip("c11", "Inversión", "El reparto entre tipos de activo es lo que más pesa",
            "A largo plazo, la mayor parte del resultado depende de cuánto pones en liquidez, renta fija, renta variable o inmuebles, más que de elegir el valor concreto. Diversifica también por mercados y sectores.", source = CASANOVAS),
        Tip("c12", "Inversión", "Invertir en otra moneda añade riesgo",
            "Si inviertes en dólares u otra divisa, además del riesgo del producto asumes el riesgo de cambio: aunque la inversión suba, puedes perder si el euro se aprecia.", source = CASANOVAS),
        Tip("c13", "Asesoramiento", "Asesorar no es lo mismo que vender",
            "El comercial de tu banco te ofrece productos de su entidad. Un asesor analiza todo tu patrimonio, tus objetivos y tus impuestos y te recomienda entre todas las alternativas. Pregunta siempre cómo cobra quien te aconseja.", source = CASANOVAS),
        Tip("c14", "Asesoramiento", "Comprueba que el asesor está registrado",
            "Las empresas de asesoramiento financiero (EAFI) y demás entidades de inversión deben estar inscritas en la CNMV. Búscalas en su web antes de contratar nada.", source = CASANOVAS),
        Tip("c15", "Asesoramiento", "Contesta el test de idoneidad con sinceridad",
            "Los tests de conveniencia e idoneidad existen para protegerte: sirven para saber si un producto encaja con tu situación, tus objetivos y tus conocimientos. Exagerar tu experiencia solo te expone a productos inadecuados.", source = CASANOVAS),
        Tip("c16", "Planificación", "Haz un plan con objetivos y horizonte",
            "Ordena tus metas: protegerte ante imprevistos, acumular capital (emergencias, estudios, jubilación), pagar menos impuestos, comprar vivienda y planificar la herencia. Para cada una, fija cuándo necesitarás el dinero.", source = CASANOVAS),
        Tip("c17", "Planificación", "Protégete antes de invertir",
            "Antes de buscar rentabilidad, cubre los riesgos que podrían arruinar tus planes: enfermedad, invalidez, fallecimiento si alguien depende de ti y responsabilidad civil.", source = CASANOVAS),
        Tip("c18", "Planificación", "La jubilación dura más de lo que crees",
            "Al planificarla, tu horizonte no son los años que faltan para jubilarte sino los que vivirás después. Empezar pronto multiplica el efecto del interés compuesto.", source = CASANOVAS),
        Tip("c19", "Planificación", "Revisa tu plan periódicamente",
            "Compara cada cierto tiempo lo conseguido con lo previsto y corrige desviaciones. Tus objetivos y tu perfil cambian con la vida; el plan también debe hacerlo.", source = CASANOVAS),
        Tip("c20", "Vivienda", "La vivienda no siempre sube",
            "Hasta 2007 se daba por hecho que el precio de la vivienda siempre subía. No concentres todo tu patrimonio en ladrillo: es el activo menos líquido y también puede bajar.", source = CASANOVAS),
    )
}
