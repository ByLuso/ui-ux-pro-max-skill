package com.byluso.saldo

import com.byluso.saldo.advisor.BudgetGroup
import com.byluso.saldo.advisor.FinanceAdvisor
import com.byluso.saldo.advisor.IncomeSource
import com.byluso.saldo.advisor.Period
import com.byluso.saldo.advisor.Tips
import com.byluso.saldo.data.Movement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

class FinanceAdvisorTest {
    private val today = LocalDate.of(2026, 10, 18)
    private fun ts(daysAgo: Long) = today.minusDays(daysAgo).atTime(12, 0).toInstant(ZoneOffset.UTC).toEpochMilli()
    private fun exp(a: Double, cat: String, d: Long, m: String = cat) = Movement(amount = a, isIncome = false, merchant = m, category = cat, timestamp = ts(d))

    private val movs = listOf(
        Movement(amount = 2000.0, isIncome = true, merchant = "Nómina", category = "Ingresos", timestamp = ts(10)),
        exp(700.0, "Hogar", 9), exp(300.0, "Comida", 5), exp(150.0, "Restaurantes", 3),
        exp(12.99, "Suscripciones", 4, "Netflix"), exp(10.99, "Suscripciones", 6, "Spotify"),
        exp(100.0, "Transporte", 2),
        exp(500.0, "Hogar", 60), // fuera de los 30 días
    )

    private fun run(salary: Double? = null, balance: Double? = 3000.0, period: Period = Period.LAST_30) =
        FinanceAdvisor.analyze(movs, period, salary, balance, today, ZoneOffset.UTC)

    @Test fun detectsIncomeAndGroups() {
        val a = run()
        assertEquals(IncomeSource.DETECTED, a.incomeSource)
        assertEquals(2000.0, a.income, 0.01)
        assertEquals(1273.98, a.expenses, 0.01)
        val housing = a.groups.first { it.group == BudgetGroup.HOUSING }
        assertEquals(600.0, housing.recommended, 0.01) // 30 %
        assertEquals(700.0, housing.actual, 0.01)
        assertTrue(housing.over)
        assertEquals(100.0, housing.delta, 0.01)
        val savings = a.groups.first { it.group == BudgetGroup.SAVINGS }
        assertEquals(400.0, savings.recommended, 0.01) // 20 %
        assertEquals(726.02, savings.actual, 0.01)
        assertEquals(100, BudgetGroup.entries.sumOf { it.recommendedPct })
    }

    @Test fun manualSalaryWins() {
        val a = run(salary = 2500.0)
        assertEquals(IncomeSource.MANUAL, a.incomeSource)
        assertEquals(750.0, a.groups.first { it.group == BudgetGroup.HOUSING }.recommended, 0.01)
    }

    @Test fun ninetyDaysAveragesPerMonth() {
        val a = run(period = Period.LAST_90)
        assertEquals(2000.0 / 3, a.income, 0.01)
        assertEquals((1273.98 + 500) / 3, a.expenses, 0.01)
    }

    @Test fun housingAndCar() {
        val a = run()
        assertEquals(600.0, a.housing.maxRent, 0.01)
        // 600 €/mes, 30 años al 3 % ≈ 142.300 € de préstamo → vivienda ≈ 177.900 €
        assertEquals(142_311.0, a.housing.maxHomePrice * 0.8, 50.0)
        assertEquals(a.housing.maxHomePrice * 0.3, a.housing.cashNeeded, 0.01)
        assertEquals(200.0, a.car.maxMonthlyCost, 0.01)
        assertTrue(a.car.maxCarPrice <= 2000 * 12 * 0.35 + 0.01)
    }

    @Test fun scoreAndTips() {
        val a = run()
        assertNotNull(a.score)
        assertTrue(a.score!! in 0..100)
        val tips = Tips.personal(a)
        assertTrue(tips.any { it.id == "p-over-HOUSING" })
        assertTrue(tips.any { it.id == "p-subs" && it.title.contains("2 suscripciones") })
        assertTrue(Tips.general.size >= 40)
        assertEquals(Tips.general.size, Tips.general.map { it.id }.toSet().size)
    }

    @Test fun noIncome() {
        val a = FinanceAdvisor.analyze(listOf(exp(10.0, "Comida", 1)), Period.LAST_30, null, null, today, ZoneOffset.UTC)
        assertEquals(IncomeSource.NONE, a.incomeSource)
        assertNull(a.score)
        assertEquals("p-income", Tips.personal(a).single().id)
    }
}
