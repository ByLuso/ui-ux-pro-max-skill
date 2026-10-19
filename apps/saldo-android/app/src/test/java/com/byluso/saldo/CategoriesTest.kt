package com.byluso.saldo

import com.byluso.saldo.advisor.BudgetGroup
import com.byluso.saldo.advisor.FinanceAdvisor
import com.byluso.saldo.advisor.Period
import com.byluso.saldo.advisor.Spending
import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.Categories
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

class CategoriesTest {
    private fun g(merchant: String, text: String = merchant, income: Boolean = false) = Categories.guess(merchant, text, income)

    @Test fun fuelTollsAndParkingAreSeparate() {
        assertEquals("Gasolina", g("Repsol Estacion 4521"))
        assertEquals("Gasolina", g("E.S. Ballenoil Sevilla"))
        assertEquals("Gasolina", g("Plenoil Malaga"))
        assertEquals("Peajes", g("Autopista AP-7 Peaje Malaga"))
        assertEquals("Peajes", g("Audasa"))
        assertEquals("Parking", g("Empark Aparcamientos"))
        assertEquals("Parking", g("EasyPark"))
        assertEquals("Coche", g("Norauto Malaga"))
        assertEquals("Taxi y VTC", g("Cabify"))
        assertEquals("Transporte", g("Renfe Viajeros"))
        assertEquals("Viajes", g("Ryanair"))
    }

    @Test fun keywordOrderResolvesOverlaps() {
        assertEquals("Restaurantes", g("Uber Eats"))
        assertEquals("Taxi y VTC", g("Uber BV"))
        assertEquals("Suministros", g("Repsol Luz y Gas"))
        assertEquals("Suscripciones", g("Amazon Prime"))
        assertEquals("Compras", g("Amazon Marketplace"))
        assertEquals("Telefonía e internet", g("Vodafone Espana"))
        assertEquals("Mascotas", g("Clinica Veterinaria Sol"))
        assertEquals("Salud", g("Clinica Dental Sur"))
        assertEquals("Telefonía e internet", g("Recarga movil Orange"))
        assertEquals("Hogar", g("Zara Home"))
        assertEquals("Ropa", g("Zara"))
    }

    @Test fun lessGoesToOthers() {
        assertEquals("Seguros", g("Linea Directa Aseguradora"))
        assertEquals("Impuestos y tasas", g("Agencia Tributaria"))
        assertEquals("Comisiones", g("Comision mantenimiento cuenta"))
        assertEquals("Cuidado personal", g("Peluqueria Ana"))
        assertEquals("Deporte", g("Basic-Fit"))
        assertEquals("Estanco y apuestas", g("Estanco n 5"))
        assertEquals("Educación", g("Academia de ingles"))
        assertEquals("Transferencias", g("Transferencia a Pedro"))
        assertEquals(Categories.OTHER, g("Comercio desconocido 123"))
    }

    @Test fun topUpsAndSavingsAreTransfers() {
        assertEquals(Categories.TOP_UP, g("Revolut**1234"))
        assertEquals(Categories.TOP_UP, g("Recarga tarjeta prepago"))
        assertEquals(Categories.TOP_UP, g("Traspaso a cuenta 5678"))
        assertEquals(Categories.SAVINGS, g("MyInvestor"))
        // Llega a la tarjeta o vuelve a la cuenta: tampoco es un ingreso real
        assertEquals(Categories.TOP_UP, g("Top-up by *1234", income = true))
        assertEquals(Categories.TOP_UP, g("Traspaso desde Revolut", income = true))
        assertEquals(Categories.INCOME, g("Bizum de Ana", income = true))
        assertTrue(Categories.isTransfer(Categories.TOP_UP) && Categories.isTransfer(Categories.SAVINGS))
    }

    @Test fun refineOnlyTouchesOthersAndSplitCategories() {
        assertEquals("Gasolina", Categories.refine("Transporte", "Repsol", null, false))
        assertEquals("Peajes", Categories.refine("Transporte", "Peaje AP-4", null, false))
        assertEquals("Suministros", Categories.refine("Hogar", "Iberdrola", null, false))
        assertEquals(Categories.TOP_UP, Categories.refine("Otros", "Revolut", null, false))
        assertNull(Categories.refine("Transporte", "Renfe", null, false))
        // Lo que cambiaste a mano a una categoría que no se ha dividido se respeta
        assertNull(Categories.refine("Ocio", "Mercadona", null, false))
        assertNull(Categories.refine(Categories.SALARY, "Revolut", null, true))
    }

    // ------------------------------------------------------------ Recargas en los cálculos

    private val today = LocalDate.of(2026, 10, 18)
    private fun at(d: Int) = LocalDate.of(2026, 10, d).atTime(12, 0).toInstant(ZoneOffset.UTC).toEpochMilli()
    private fun exp(a: Double, cat: String, d: Int, account: String? = null, m: String = cat) =
        Movement(amount = a, isIncome = false, merchant = m, category = cat, timestamp = at(d), account = account)
    private val payroll = Movement(amount = 2000.0, isIncome = true, merchant = "Empresa Nomina", category = Categories.SALARY, timestamp = at(1))

    @Test fun topUpCountsUntilTheCardStatementIsImported() {
        val base = listOf(payroll, exp(300.0, "Comida", 3), exp(200.0, Categories.TOP_UP, 4, m = "Revolut"), exp(100.0, Categories.SAVINGS, 5))
        assertEquals(500.0, Spending.expenses(base).sumOf { it.amount }, 0.01)
        val a = FinanceAdvisor.analyze(base, Period.THIS_MONTH, null, 0.0, today, ZoneOffset.UTC)
        assertEquals(500.0, a.expenses, 0.01)
        assertTrue(a.topUpsUndetailed)
        assertEquals(100.0, a.toSavings, 0.01)
        assertEquals(listOf(Categories.TOP_UP to 200.0), a.groups.first { it.group == BudgetGroup.OTHER }.parts)

        // Con el extracto de la tarjeta: cuentan sus compras y la recarga desaparece de los gastos
        val card = listOf(
            Movement(amount = 200.0, isIncome = true, merchant = "Top-up", category = Categories.TOP_UP, timestamp = at(4), account = "Revolut"),
            exp(60.0, "Gasolina", 6, "Revolut"), exp(15.0, "Peajes", 6, "Revolut"), exp(40.0, "Restaurantes", 7, "Revolut"),
        )
        val b = FinanceAdvisor.analyze(base + card, Period.THIS_MONTH, null, 0.0, today, ZoneOffset.UTC)
        assertEquals(415.0, b.expenses, 0.01)
        assertEquals(0.0, b.otherIncome, 0.01)
        assertTrue(!b.topUpsUndetailed)
        assertEquals(
            listOf("Gasolina" to 60.0, "Peajes" to 15.0),
            b.groups.first { it.group == BudgetGroup.TRANSPORT }.parts,
        )
    }
}
