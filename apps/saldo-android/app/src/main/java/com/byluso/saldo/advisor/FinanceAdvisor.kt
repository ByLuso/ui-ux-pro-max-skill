package com.byluso.saldo.advisor

import com.byluso.saldo.data.Movement
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
    HOUSING("Vivienda", "🏠", 0xFF8A5CFF, 30, setOf("Hogar"), "Alquiler o hipoteca, luz, agua, gas, comunidad e internet."),
    FOOD("Comida", "🛒", 0xFFFF9F1C, 12, setOf("Comida"), "Supermercado y alimentación en casa."),
    TRANSPORT("Transporte y coche", "🚗", 0xFF00B4FF, 10, setOf("Transporte"), "Gasolina, seguro, cuota del coche, transporte público, parking."),
    DINING("Restaurantes", "🍔", 0xFFFF3DCB, 5, setOf("Restaurantes"), "Comer fuera, cafés y comida a domicilio."),
    LEISURE("Ocio", "🎮", 0xFFB388FF, 5, setOf("Ocio"), "Cine, viajes, gimnasio, conciertos, hobbies."),
    SUBSCRIPTIONS("Suscripciones", "📺", 0xFF00E5FF, 2, setOf("Suscripciones"), "Streaming, música, móvil y servicios digitales."),
    HEALTH("Salud", "💊", 0xFF2DD4BF, 3, setOf("Salud"), "Farmacia, seguro médico, dentista, óptica."),
    SHOPPING("Ropa y compras", "🛍️", 0xFFFFD166, 5, setOf("Ropa", "Compras"), "Ropa, tecnología y compras online."),
    OTHER("Otros", "📦", 0xFF7D89A6, 8, setOf("Efectivo", "Bizum", "Otros"), "Efectivo, Bizum y gastos sin clasificar."),
    SAVINGS("Ahorro", "💎", 0xFF3DFFB0, 20, emptySet(), "Fondo de emergencia, objetivos e inversión."),
    ;

    companion object {
        val spending = entries.filter { it != SAVINGS }
        fun of(category: String): BudgetGroup = spending.firstOrNull { category in it.categories } ?: OTHER
    }
}

enum class Period(val label: String) {
    LAST_30("30 días"), THIS_MONTH("Este mes"), LAST_MONTH("Mes pasado"), LAST_90("3 meses");

    /** Rango [desde, hasta] y cuántos meses representa (para sacar la media mensual). */
    fun range(today: LocalDate): Triple<LocalDate, LocalDate, Double> = when (this) {
        LAST_30 -> Triple(today.minusDays(29), today, 1.0)
        THIS_MONTH -> Triple(today.withDayOfMonth(1), today, 1.0)
        LAST_MONTH -> YearMonth.from(today).minusMonths(1).let { Triple(it.atDay(1), it.atEndOfMonth(), 1.0) }
        LAST_90 -> Triple(today.minusDays(89), today, 3.0)
    }
}

enum class IncomeSource { MANUAL, DETECTED, NONE }

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
    val income: Double,
    val incomeSource: IncomeSource,
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

    fun analyze(
        movements: List<Movement>,
        period: Period,
        salaryOverride: Double?,
        balance: Double?,
        today: LocalDate = LocalDate.now(),
        zone: ZoneId = ZoneId.systemDefault(),
    ): Analysis {
        val (from, to, months) = period.range(today)
        val inPeriod = movements.filter {
            val d = Instant.ofEpochMilli(it.timestamp).atZone(zone).toLocalDate()
            !d.isBefore(from) && !d.isAfter(to)
        }
        val detectedIncome = inPeriod.filter { it.isIncome }.sumOf { it.amount } / months
        val (income, source) = when {
            salaryOverride != null && salaryOverride > 0 -> salaryOverride to IncomeSource.MANUAL
            detectedIncome > 0 -> detectedIncome to IncomeSource.DETECTED
            else -> 0.0 to IncomeSource.NONE
        }
        val expenseMovs = inPeriod.filter { !it.isIncome }
        val byGroup = expenseMovs.groupBy { BudgetGroup.of(it.category) }.mapValues { e -> e.value.sumOf { it.amount } / months }
        val expenses = byGroup.values.sum()

        val groups = BudgetGroup.entries.map { g ->
            val rec = income * g.recommendedPct / 100
            val act = if (g == BudgetGroup.SAVINGS) max(0.0, income - expenses) else byGroup[g] ?: 0.0
            GroupAnalysis(g, rec, act)
        }

        // Vivienda: alquiler o cuota de hipoteca ≤ 30 % del sueldo neto
        val maxPayment = income * 0.30
        val r = MORTGAGE_RATE / 12
        val n = MORTGAGE_YEARS * 12
        val loan = if (maxPayment > 0) maxPayment * (1 - (1 + r).pow(-n)) / r else 0.0
        val homePrice = loan / MORTGAGE_LTV
        val housing = HousingAdvice(
            maxRent = income * 0.30,
            maxMortgagePayment = maxPayment,
            maxHomePrice = homePrice,
            cashNeeded = homePrice * (1 - MORTGAGE_LTV + PURCHASE_COSTS),
        )

        // Coche: regla 20/4/10 y precio ≤ 35 % del sueldo neto anual
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
            .groupBy { it.merchant }.mapValues { e -> e.value.sumOf { it.amount } / months }
            .entries.sortedByDescending { it.value }.map { it.key to it.value }
        val small = expenseMovs.filter { it.amount < 6.0 }

        val analysis = Analysis(
            period, from, to, income, source, expenses, groups, balance, emergencyTarget,
            housing, car, null, subs, small.size to small.sumOf { it.amount }, inPeriod.size,
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
