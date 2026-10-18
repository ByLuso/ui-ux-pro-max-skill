package com.byluso.saldo

import com.byluso.saldo.advisor.BudgetGroup
import com.byluso.saldo.advisor.FinanceAdvisor
import com.byluso.saldo.advisor.IncomeSource
import com.byluso.saldo.advisor.Period
import com.byluso.saldo.advisor.Tips
import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.Categories
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

class FinanceAdvisorTest {
    private val today = LocalDate.of(2026, 10, 18)
    private fun at(y: Int, m: Int, d: Int) = LocalDate.of(y, m, d).atTime(12, 0).toInstant(ZoneOffset.UTC).toEpochMilli()
    private fun exp(a: Double, cat: String, ts: Long, m: String = cat) = Movement(amount = a, isIncome = false, merchant = m, category = cat, timestamp = ts)
    private fun inc(a: Double, m: String, ts: Long, cat: String = Categories.INCOME) = Movement(amount = a, isIncome = true, merchant = m, category = cat, timestamp = ts)
    private fun run(movs: List<Movement>, period: Period = Period.THIS_MONTH, salary: Double? = null, balance: Double? = 3000.0) =
        FinanceAdvisor.analyze(movs, period, salary, balance, today, ZoneOffset.UTC)

    // Septiembre: nómina 1.800 €; octubre: nómina 2.000 € más Bizums que no son sueldo
    private val movs = listOf(
        inc(1800.0, "Empresa Sl Nomina", at(2026, 9, 1)),
        exp(700.0, "Hogar", at(2026, 9, 3)), exp(250.0, "Comida", at(2026, 9, 10)),
        inc(2000.0, "Empresa Sl Nomina", at(2026, 10, 1)),
        inc(60.0, "Bizum de Ana", at(2026, 10, 5)),
        inc(500.0, "Traspaso desde ahorro", at(2026, 10, 6)),
        exp(700.0, "Hogar", at(2026, 10, 3)), exp(300.0, "Comida", at(2026, 10, 9)), exp(150.0, "Restaurantes", at(2026, 10, 12)),
        exp(12.99, "Suscripciones", at(2026, 10, 4), "Netflix"), exp(10.99, "Suscripciones", at(2026, 10, 6), "Spotify"),
    )

    @Test fun percentagesAreOverThisMonthsPayrollOnly() {
        val a = run(movs)
        assertEquals(IncomeSource.PAYROLL, a.incomeSource)
        assertEquals(2000.0, a.income, 0.01) // ni Bizums ni traspasos cuentan como sueldo
        assertEquals(560.0, a.otherIncome, 0.01)
        val housing = a.groups.first { it.group == BudgetGroup.HOUSING }
        assertEquals(600.0, housing.recommended, 0.01) // 30 % de 2.000 €
        assertEquals(35.0, a.pctOfIncome(housing.actual), 0.01) // 700 / 2.000
        val savings = a.groups.first { it.group == BudgetGroup.SAVINGS }
        assertEquals(400.0, savings.recommended, 0.01) // 20 % de 2.000 €
        assertEquals(2000.0 - 1173.98, savings.actual, 0.01)
        assertEquals(100, BudgetGroup.entries.sumOf { it.recommendedPct })
    }

    @Test fun eachMonthUsesItsOwnPayroll() {
        val sept = run(movs, Period.LAST_MONTH)
        assertEquals(1800.0, sept.income, 0.01)
        assertEquals(540.0, sept.groups.first { it.group == BudgetGroup.HOUSING }.recommended, 0.01) // 30 % de 1.800 €
        assertEquals(700.0 / 1800 * 100, sept.pctOfIncome(700.0), 0.01)
    }

    @Test fun beforePaydayUsesLastPayroll() {
        // Noviembre aún sin nómina: usa la de octubre y lo avisa
        val nov = FinanceAdvisor.analyze(movs + exp(40.0, "Comida", at(2026, 11, 2)), Period.THIS_MONTH, null, null, LocalDate.of(2026, 11, 3), ZoneOffset.UTC)
        assertEquals(IncomeSource.PREVIOUS_PAYROLL, nov.incomeSource)
        assertEquals(2000.0, nov.income, 0.01)
        assertTrue(nov.incomeNote.contains("octubre"))
    }

    @Test fun manualSalaryOnlyWhenNoPayroll() {
        assertEquals(2000.0, run(movs, salary = 2500.0).income, 0.01) // hay nómina: se ignora el fijo
        val noPayroll = listOf(exp(100.0, "Comida", at(2026, 10, 2)), inc(60.0, "Bizum de Ana", at(2026, 10, 3)))
        val a = run(noPayroll, salary = 2500.0)
        assertEquals(IncomeSource.MANUAL, a.incomeSource)
        assertEquals(2500.0, a.income, 0.01)
        val none = run(noPayroll)
        assertEquals(IncomeSource.NONE, none.incomeSource)
        assertEquals(0.0, none.income, 0.01) // un Bizum nunca se toma como sueldo
    }

    @Test fun detectsRecurringPayerWithoutKeyword() {
        val m = listOf(inc(1650.0, "Acme Iberia", at(2026, 8, 30)), inc(1700.0, "Acme Iberia", at(2026, 9, 30)), inc(80.0, "Bizum de Luis", at(2026, 9, 12)))
        val sept = run(m, Period.LAST_MONTH)
        assertEquals(1700.0, sept.income, 0.01)
    }

    @Test fun markedAsSalaryCounts() {
        val m = listOf(inc(1400.0, "Transferencia de Juan", at(2026, 10, 2), Categories.SALARY))
        assertEquals(1400.0, run(m).income, 0.01)
    }

    @Test fun threeMonthAverage() {
        val m = movs + listOf(inc(1900.0, "Empresa Sl Nomina", at(2026, 8, 1)), exp(600.0, "Hogar", at(2026, 8, 5)))
        val a = run(m, Period.LAST_3) // julio sin datos, agosto y septiembre
        assertEquals((1900.0 + 1800.0) / 2, a.income, 0.01)
        assertEquals((600.0 + 700.0) / 2, a.groups.first { it.group == BudgetGroup.HOUSING }.actual, 0.01)
    }

    @Test fun housingAndCarFromPayroll() {
        val a = run(movs)
        assertEquals(600.0, a.housing.maxRent, 0.01)
        assertEquals(a.housing.maxHomePrice * 0.3, a.housing.cashNeeded, 0.01)
        assertEquals(200.0, a.car.maxMonthlyCost, 0.01)
    }

    @Test fun scoreAndTips() {
        val a = run(movs)
        assertNotNull(a.score)
        assertTrue(a.score!! in 0..100)
        val tips = Tips.personal(a)
        assertTrue(tips.any { it.id == "p-over-HOUSING" })
        assertTrue(tips.any { it.id == "p-subs" && it.title.contains("2 suscripciones") })
        assertTrue(tips.any { it.id == "p-discretionary" })
        assertTrue(Tips.general.size >= 60)
        assertEquals(Tips.general.size, Tips.general.map { it.id }.toSet().size)
    }

    @Test fun noIncome() {
        val a = run(listOf(exp(10.0, "Comida", at(2026, 10, 2))), balance = null)
        assertEquals(IncomeSource.NONE, a.incomeSource)
        assertNull(a.score)
        assertEquals("p-income", Tips.personal(a).single().id)
    }

    @Test fun salaryKeywordsSetCategory() {
        assertEquals(Categories.SALARY, Categories.guess("Empresa Sl", "TRANSFERENCIA DE EMPRESA SL NOMINA OCTUBRE", true))
        assertEquals(Categories.INCOME, Categories.guess("Ana", "BIZUM RECIBIDO DE ANA", true))
    }
}
