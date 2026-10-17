package com.byluso.saldo

import com.byluso.saldo.parser.StatementParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class StatementParserTest {
    private val today = LocalDate.of(2026, 10, 17)

    /** Formato típico Unicaja/CaixaBank: fecha op., fecha valor, concepto, importe con signo, saldo. */
    @Test fun signedAmountsWithBalance() {
        val text = """
            Unicaja Banco · Extracto de movimientos
            Cuenta ES12 2103 0000 0000 0000 0000
            Fecha Fecha valor Concepto Importe Saldo
            SALDO ANTERIOR 1.500,00
            01/10/2026 01/10/2026 RECIBO IBERDROLA CLIENTES SAU -78,00 1.422,00
            02/10/2026 02/10/2026 TRANSFERENCIA RECIBIDA DE EMPRESA SL +2.200,00 3.622,00
            NOMINA OCTUBRE
            05/10/2026 05/10/2026 COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA VALENCIA ES -52,30 3.569,70
            05/10/2026 05/10/2026 COMPRA TARJ. 5402XXXXXXXX1234 STARBUCKS -3,80 3.565,90
            Página 1 de 1
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals("Unicaja", st.bank)
        assertEquals(4, st.lines.size)
        val (iber, nomina, merca, star) = st.lines
        assertEquals(78.0, iber.amount, 0.001); assertFalse(iber.isIncome)
        assertEquals("Iberdrola Clientes Sau", iber.merchant); assertEquals("Hogar", iber.category)
        assertTrue(nomina.isIncome); assertEquals(2200.0, nomina.amount, 0.001)
        assertTrue(nomina.concept.contains("NOMINA OCTUBRE"))
        assertEquals("Mercadona Valencia", merca.merchant); assertEquals("Comida", merca.category)
        assertEquals("Starbucks", star.merchant)
        assertEquals(3565.90, st.finalBalance!!, 0.001)
        assertEquals(LocalDate.of(2026, 10, 1), st.from)
        assertEquals(LocalDate.of(2026, 10, 5), st.to)
    }

    /** Importes sin signo (columnas Debe/Haber): el tipo se deduce del saldo. Orden descendente. */
    @Test fun unsignedDescendingInfersFromBalance() {
        val text = """
            BBVA
            FECHA CONCEPTO IMPORTE SALDO
            15/10/2026 PAGO CON TARJETA ZARA ESPAÑA 59,90 1.467,13
            14/10/2026 BIZUM RECIBIDO DE JUAN PEREZ 20,00 1.527,03
            13/10/2026 PAGO MOVIL EN REPSOL 66,30 1.507,03
            12/10/2026 SALDO INICIAL 1.573,33
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals("BBVA", st.bank)
        assertEquals(3, st.lines.size)
        // Se devuelven en orden cronológico
        assertEquals("Repsol", st.lines[0].merchant); assertFalse(st.lines[0].isIncome)
        assertEquals("Juan Perez", st.lines[1].merchant); assertTrue(st.lines[1].isIncome)
        assertEquals("Zara", st.lines[2].merchant); assertFalse(st.lines[2].isIncome)
        assertEquals(1467.13, st.finalBalance!!, 0.001)
    }

    /** Fechas con nombre de mes y sin año, estilo Revolut / N26. */
    @Test fun textDatesWithoutYear() {
        val text = """
            Revolut Bank UAB · Extracto en EUR
            Fecha Descripción Dinero saliente Dinero entrante Saldo
            3 oct. Netflix 12,99 € 980,00 €
            7 oct. Recarga de Apple Pay 100,00 € 1.080,00 €
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals("Revolut", st.bank)
        assertEquals(2, st.lines.size)
        assertEquals(LocalDate.of(2026, 10, 3), st.lines[0].date)
        assertFalse(st.lines[0].isIncome); assertEquals("Suscripciones", st.lines[0].category)
        assertTrue(st.lines[1].isIncome)
    }

    @Test fun noBalanceColumnUsesKeywords() {
        val text = """
            10-09-26 Abono nómina septiembre 1.900,00
            11-09-26 Compra Amazon 23,45
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals(2, st.lines.size)
        assertTrue(st.lines[0].isIncome)
        assertFalse(st.lines[1].isIncome)
        assertEquals("Amazon", st.lines[1].merchant)
        assertNull(st.finalBalance)
    }

    @Test fun nothingToReadGivesEmpty() {
        assertTrue(StatementParser.parse("Documento sin movimientos", today).lines.isEmpty())
    }
}
