package com.byluso.saldo.advisor

import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.Categories
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.YearMonth
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Partidas del presupuesto con el porcentaje del sueldo neto recomendado.
 * Basado en la regla 50/30/20 (necesidades / deseos / ahorro) adaptada a España.
 */
enum class BudgetGroup(
    val label: String,
    val emoji: String,
    val color: Long,
    /** Porcentaje recomendado del sueldo neto mensual. */
    val recommendedPct: Int,
    val categories: Set<String>,
    val hint: String,
) {
    HOUSING("Vivienda", "🏠", 0xFF7F8FB8, 30, setOf("Hogar"), "Alquiler o hipoteca, luz, agua, gas, comunidad e internet."),
    FOOD("Comida", "🛒", 0xFFC9A46E, 12, setOf("Comida"), "Supermercado y alimentación en casa."),
    TRANSPORT("Transporte y coche", "🚗", 0xFF6FA2AF, 10, setOf("Transporte"), "Gasolina, seguro, cuota del coche, transporte público, parking."),
    DINING("Restaurantes", "🍔", 0xFFC98E8E, 5, setOf("Restaurantes"), "Comer fuera, cafés y comida a domicilio."),
    LEISURE("Ocio", "🎮", 0xFFA08FBF, 5, setOf("Ocio"), "Cine, viajes, gimnasio, conciertos, hobbies."),
    SUBSCRIPTIONS("Suscripciones", "📺", 0xFF7FAFC6, 2, setOf("Suscripciones"), "Streaming, música, móvil y servicios digitales."),
    HEALTH("Salud", "💊", 0xFF8DBFB0, 3, setOf("Salud"), "Farmacia, seguro médico, dentista, óptica."),
    SHOPPING("Ropa y compras", "🛍️", 0xFFCDB57E, 5, setOf("Ropa", "Compras"), "Ropa, tecnología y compras online."),
    OTHER("Otros", "📦", 0xFFA4AAA6, 8, setOf("Efectivo", "Bizum", "Otros"), "Efectivo, Bizum y gastos sin clasificar."),
    SAVINGS("Ahorro", "💎", 0xFF5E9C82, 20, emptySet(), "Fondo de emergencia, objetivos e inversión."),
    ;

    companion object {
        val spending = entries.filter { it != SAVINGS }
        fun of(category: String): BudgetGroup = spending.firstOrNull { category in it.categories } ?: OTHER
    }
}

/** Periodos de análisis por meses naturales: cada mes se compara con la nómina de ese mes. */
enum class Period(val label: String) {
    THIS_MONTH("Este mes"), LAST_MONTH("Mes pasado"), LAST_3("Media 3 meses");

    fun months(today: LocalDate): List<YearMonth> {
        val now = YearMonth.from(today)
        return when (this) {
            THIS_MONTH -> listOf(now)
            LAST_MONTH -> listOf(now.minusMonths(1))
            LAST_3 -> (3 downTo 1).map { now.minusMonths(it.toLong()) }
        }
    }
}

enum class IncomeSource {
    /** Nómina cobrada en el propio mes. */
    PAYROLL,
    /** Aún no se ha cobrado la nómina del mes: se usa la última cobrada. */
    PREVIOUS_PAYROLL,
    /** No hay nómina detectada ese mes: se usa el sueldo indicado a mano. */
    MANUAL,
    NONE,
}

data class GroupAnalysis(
    val group: BudgetGroup,
    /** € al mes recomendados. */
    val recommended: Double,
    /** € al mes reales (en el ahorro: lo que sobra). */
    val actual: Double,
) {
    val recommendedPct: Double get() = group.recommendedPct.toDouble()
    /** Diferencia en € (positivo = te pasas; en ahorro, positivo = ahorras de más). */
    val delta: Double get() = actual - recommended
    val over: Boolean get() = if (group == BudgetGroup.SAVINGS) actual < recommended - 0.5 else actual > recommended + 0.5
}

data class HousingAdvice(
    val maxRent: Double,
    val maxMortgagePayment: Double,
    val maxHomePrice: Double,
    /** Entrada (20 %) + gastos de compra (~10 %). */
    val cashNeeded: Double,
)

data class CarAdvice(
    val maxCarPrice: Double,
    /** Cuota + seguro + gasolina + mantenimiento. */
    val maxMonthlyCost: Double,
    val maxLoanPayment: Double,
)

data class Analysis(
    val period: Period,
    val from: LocalDate,
    val to: LocalDate,
    /** Nómina del mes (o media de las nóminas): la base de todos los porcentajes. */
    val income: Double,
    val incomeSource: IncomeSource,
    /** Explicación de qué nómina se está usando. */
    val incomeNote: String,
    /** Ingresos que no son nómina (Bizums, devoluciones, traspasos…): no cuentan como sueldo. */
    val otherIncome: Double,
    val expenses: Double,
    val groups: List<GroupAnalysis>,
    val balance: Double?,
    val emergencyTarget: Double,
    val housing: HousingAdvice,
    val car: CarAdvice,
    val score: Int?,
    val subscriptions: List<Pair<String, Double>>,
    val smallPurchases: Pair<Int, Double>,
    val movementsInPeriod: Int,
) {
    val savings: Double get() = income - expenses
    val savingsPct: Double get() = if (income > 0) savings / income * 100 else 0.0
    fun pctOfIncome(v: Double): Double = if (income > 0) v / income * 100 else 0.0
    /** Meses de gastos que cubre el saldo actual. */
    val monthsCovered: Double? get() = if (balance != null && expenses > 0) balance / expenses else null
}

/** Analiza ingresos y gastos y compara con un presupuesto recomendado. */
object FinanceAdvisor {
    /** Supuestos para la hipoteca (orientativos). */
    const val MORTGAGE_RATE = 0.03
    const val MORTGAGE_YEARS = 30
    const val MORTGAGE_LTV = 0.80
    const val PURCHASE_COSTS = 0.10
    const val CAR_RATE = 0.07
    const val CAR_MONTHS = 48

    private val monthName = java.time.format.DateTimeFormatter.ofPattern("LLLL", java.util.Locale.forLanguageTag("es-ES"))
    private fun nameOf(m: YearMonth) = monthName.format(m.atDay(1))

    private fun payerKey(m: Movement) = m.merchant.lowercase().replace(Regex("""[^a-záéíóúñü ]"""), "").replace(Regex("""\s+"""), " ").trim()

    /**
     * Movimientos que son nómina: los marcados como tal, los que lo dicen en el concepto y,
     * si no, los ingresos de un mismo pagador que se repiten en meses distintos con importe parecido.
     */
    fun salaryMovements(movements: List<Movement>, zone: ZoneId = ZoneId.systemDefault()): List<Movement> {
        val incomes = movements.filter { it.isIncome }
        val explicit = incomes.filter {
            it.category == Categories.SALARY ||
                Categories.salaryWords.containsMatchIn(it.merchant) || Categories.salaryWords.containsMatchIn(it.rawText ?: "")
        }
        val rest = incomes - explicit.toSet()
        val recurring = rest.filter { it.amount >= 400 }.groupBy { payerKey(it) }.filterKeys { it.isNotBlank() }.values.filter { group ->
            val months = group.map { YearMonth.from(Instant.ofEpochMilli(it.timestamp).atZone(zone)) }.toSet()
            val amounts = group.map { it.amount }.sorted()
            val median = amounts[amounts.size / 2]
            months.size >= 2 && amounts.all { it in median * 0.7..median * 1.3 }
        }.flatten()
        return explicit + recurring
    }

    /** Nómina de un mes y de dónde sale. */
    fun salaryFor(
        movements: List<Movement>, month: YearMonth, salaryOverride: Double?,
        zone: ZoneId = ZoneId.systemDefault(), salaries: List<Movement> = salaryMovements(movements, zone),
    ): Triple<Double, IncomeSource, String> {
        fun ym(m: Movement) = YearMonth.from(Instant.ofEpochMilli(m.timestamp).atZone(zone))
        val inMonth = salaries.filter { ym(it) == month }.sumOf { it.amount }
        if (inMonth > 0) return Triple(inMonth, IncomeSource.PAYROLL, "Nómina de ${nameOf(month)}")
        if (salaryOverride != null && salaryOverride > 0) return Triple(salaryOverride, IncomeSource.MANUAL, "Sueldo indicado por ti (no encuentro la nómina de ${nameOf(month)})")
        val last = salaries.filter { ym(it) < month }.maxByOrNull { it.timestamp }
        if (last != null) {
            val lm = ym(last)
            val amount = salaries.filter { ym(it) == lm }.sumOf { it.amount }
            return Triple(amount, IncomeSource.PREVIOUS_PAYROLL, "Aún no has cobrado la nómina de ${nameOf(month)}: uso la de ${nameOf(lm)}")
        }
        return Triple(0.0, IncomeSource.NONE, "No encuentro tu nómina")
    }

    fun analyze(
        movements: List<Movement>,
        period: Period,
        salaryOverride: Double?,
        balance: Double?,
        today: LocalDate = LocalDate.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): Analysis {
        fun ym(m: Movement) = YearMonth.from(Instant.ofEpochMilli(m.timestamp).atZone(zone))
        val salaries = salaryMovements(movements, zone)
        val salaryIds = salaries.toHashSet()
        val candidates = period.months(today)
        // En la media de 3 meses solo cuentan los meses con datos (si acabas de empezar a usar la app)
        val months = if (period == Period.LAST_3) candidates.filter { m -> movements.any { ym(it) == m } }.ifEmpty { candidates } else candidates
        val n = months.size.toDouble()
        val perMonth = months.map { salaryFor(movements, it, salaryOverride, zone, salaries) }
        val income = perMonth.sumOf { it.first } / n
        val source = perMonth.map { it.second }.let { list ->
            when {
                list.all { it == IncomeSource.NONE } -> IncomeSource.NONE
                list.any { it == IncomeSource.PREVIOUS_PAYROLL } -> IncomeSource.PREVIOUS_PAYROLL
                list.any { it == IncomeSource.MANUAL } -> IncomeSource.MANUAL
                else -> IncomeSource.PAYROLL
            }
        }
        val note = if (months.size == 1) perMonth.first().third
        else "Media de las nóminas de ${nameOf(months.first())} a ${nameOf(months.last())}"

        val inP = movements.filter { ym(it) in months }
        val from = months.first().atDay(1)
        val to = months.last().atEndOfMonth().let { if (it.isAfter(today)) today else it }
        val otherIncome = inP.filter { it.isIncome && it !in salaryIds }.sumOf { it.amount } / n
        val expenseMovs = inP.filter { !it.isIncome }
        val byGroup = expenseMovs.groupBy { BudgetGroup.of(it.category) }.mapValues { e -> e.value.sumOf { it.amount } / n }
        val expenses = byGroup.values.sum()
        val months_ = n

        val groups = BudgetGroup.entries.map { g ->
            val rec = income * g.recommendedPct / 100
            val act = if (g == BudgetGroup.SAVINGS) max(0.0, income - expenses) else byGroup[g] ?: 0.0
            GroupAnalysis(g, rec, act)
        }

        // Vivienda: alquiler o cuota de hipoteca ≤ 30 % de la nómina
        val maxPayment = income * 0.30
        val r = MORTGAGE_RATE / 12
        val nPay = MORTGAGE_YEARS * 12
        val loan = if (maxPayment > 0) maxPayment * (1 - (1 + r).pow(-nPay)) / r else 0.0
        val homePrice = loan / MORTGAGE_LTV
        val housing = HousingAdvice(
            maxRent = income * 0.30,
            maxMortgagePayment = maxPayment,
            maxHomePrice = homePrice,
            cashNeeded = homePrice * (1 - MORTGAGE_LTV + PURCHASE_COSTS),
        )

        // Coche: regla 20/4/10 y precio ≤ 35 % de la nómina anual
        val carMonthly = income * 0.10
        val carPayment = income * 0.06
        val cr = CAR_RATE / 12
        val financeable = if (carPayment > 0) carPayment * (1 - (1 + cr).pow(-CAR_MONTHS)) / cr / 0.8 else 0.0
        val car = CarAdvice(
            maxCarPrice = min(income * 12 * 0.35, financeable),
            maxMonthlyCost = carMonthly,
            maxLoanPayment = carPayment,
        )

        val essential = listOf(BudgetGroup.HOUSING, BudgetGroup.FOOD, BudgetGroup.TRANSPORT, BudgetGroup.HEALTH)
            .sumOf { byGroup[it] ?: 0.0 }
        val emergencyTarget = 6 * max(essential, expenses * 0.7).let { if (it > 0) it else income * 0.6 }

        val subs = expenseMovs.filter { it.category == "Suscripciones" }
            .groupBy { it.merchant }.mapValues { e -> e.value.sumOf { it.amount } / months_ }
            .entries.sortedByDescending { it.value }.map { it.key to it.value }
        val small = expenseMovs.filter { it.amount < 6.0 }

        val analysis = Analysis(
            period, from, to, income, source, note, otherIncome, expenses, groups, balance, emergencyTarget,
            housing, car, null, subs, small.size to small.sumOf { it.amount }, inP.size,
        )
        return analysis.copy(score = score(analysis))
    }

    /** Puntuación 0–100: tasa de ahorro (40), ajuste al presupuesto (30) y colchón de emergencia (30). */
    fun score(a: Analysis): Int? {
        if (a.income <= 0) return null
        val savingPts = (a.savingsPct / 20.0).coerceIn(0.0, 1.0) * 40
        val overspend = a.groups.filter { it.group != BudgetGroup.SAVINGS }.sumOf { max(0.0, it.delta) }
        val budgetPts = (1 - overspend / (a.income * 0.3)).coerceIn(0.0, 1.0) * 30
        val cushionPts = ((a.balance ?: 0.0) / a.emergencyTarget).coerceIn(0.0, 1.0) * 30
        return (savingPts + budgetPts + cushionPts).roundToInt()
    }

    fun scoreLabel(score: Int): String = when {
        score >= 80 -> "Excelente"
        score >= 60 -> "Bien"
        score >= 40 -> "Mejorable"
        else -> "En riesgo"
    }

    /** Meses que se tarda en reunir [target] ahorrando [perMonth]. */
    fun monthsToReach(target: Double, perMonth: Double): Int? =
        if (perMonth <= 0) null else ceil(max(0.0, target) / perMonth).toInt()
}
