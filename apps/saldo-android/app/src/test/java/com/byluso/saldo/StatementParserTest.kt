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

    /** Debe / Haber con 0,00 de relleno en la columna vacía. */
    @Test fun debitCreditColumnsWithZeroFiller() {
        val text = """
            Fecha Concepto Debe Haber Saldo
            21/09/2026 COMPRA TARJ. ALCAMPO SUPERMERCADO 5,34 0,00 1.494,66
            22/09/2026 TRANSFERENCIA DE EMPRESA 0,00 1.000,00 2.494,66
            23/09/2026 RECIBO CSIF 34,50 0,00 2.460,16
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals(3, st.lines.size)
        assertFalse(st.lines[0].isIncome); assertEquals(5.34, st.lines[0].amount, 0.001)
        assertTrue(st.lines[1].isIncome); assertEquals(1000.0, st.lines[1].amount, 0.001)
        assertEquals(34.50, st.lines[2].amount, 0.001)
        assertTrue(st.unrecognized.isEmpty())
    }

    /** La fecha y el concepto en una línea y los importes en la siguiente. */
    @Test fun amountsOnNextLine() {
        val text = """
            15/10/2026 COMPRA TARJ. ESTANCO ITURRIAGA
            -7,10 1.200,00
            16/10/2026 BIZUM ENVIADO A PEDRO
            CENA
            -12,00 1.188,00
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals(2, st.lines.size)
        assertEquals("Estanco Iturriaga", st.lines[0].merchant)
        assertEquals(7.10, st.lines[0].amount, 0.001)
        assertTrue(st.lines[1].concept.contains("CENA"))
        assertEquals(1188.0, st.finalBalance!!, 0.001)
    }

    /** Fechas sin año, columna previa con nº de operación, signo detrás y concepto que empieza por TOTAL. */
    @Test fun noYearLeadingColumnTrailingMinusAndTotalMerchant() {
        val text = """
            Unicaja · Movimientos de octubre de 2026
            0001 03/10 TOTALENERGIES ESTACION 45,20- 954,80
            0002 04/10 COMPRA REPSOL ESTACION 23,45- 931,35
            0003 05/10 TOTAL ENERGIES MADRID 30,00- 901,35
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals(3, st.lines.size)
        assertEquals(LocalDate.of(2026, 10, 3), st.lines[0].date)
        assertFalse(st.lines[0].isIncome); assertEquals(45.20, st.lines[0].amount, 0.001)
        assertEquals("Transporte", st.lines[1].category)
        // "TOTAL..." ya no se confunde con una línea de totales
        assertTrue(st.lines[0].merchant.startsWith("Totalenergies"))
        assertTrue(st.lines[2].merchant.startsWith("Total Energies"))
        assertEquals(901.35, st.finalBalance!!, 0.001)
    }

    /** Las líneas con importes que no se entienden se informan, no se pierden en silencio. */
    @Test fun reportsUnrecognizedLines() {
        val text = """
            01/10/2026 COMPRA MERCADONA -20,00 980,00
            Movimiento raro sin fecha 15,00
            Saldo disponible 980,00
        """.trimIndent()
        val st = StatementParser.parse(text, today)
        assertEquals(1, st.lines.size)
        assertEquals(listOf("Movimiento raro sin fecha 15,00"), st.unrecognized)
    }
}
