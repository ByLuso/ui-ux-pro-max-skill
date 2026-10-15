package com.byluso.saldo

import com.byluso.saldo.data.BalanceAnchor
import com.byluso.saldo.data.BalanceCalculator
import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.NotificationParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationParserTest {

    private fun p(title: String?, text: String) = NotificationParser.parse(title, text)!!

    @Test fun bbvaCardPayment() {
        val r = p("BBVA", "Pago con tarjeta de 23,45 € en MERCADONA")
        assertEquals(23.45, r.amount, 0.001)
        assertFalse(r.isIncome)
        assertEquals("Mercadona", r.merchant)
        assertEquals("Comida", r.category)
    }

    @Test fun santanderWithBalance() {
        val r = p("Compra con tarjeta", "Compra 59,90 EUR en ZARA ESPAÑA. Saldo disponible 1.234,56 EUR")
        assertEquals(59.90, r.amount, 0.001)
        assertEquals("Ropa", r.category)
        assertEquals(1234.56, r.balance!!, 0.001)
    }

    @Test fun balanceFirstThenAmount() {
        val r = p(null, "Tu saldo es de 2.000,00 €. Has pagado 3,80 € en Starbucks")
        assertEquals(3.80, r.amount, 0.001)
        assertEquals(2000.0, r.balance!!, 0.001)
        assertEquals("Restaurantes", r.category)
    }

    @Test fun incomingTransfer() {
        val r = p("Transferencia recibida", "Has recibido una transferencia de 1.200,00 € de EMPRESA SL")
        assertEquals(1200.0, r.amount, 0.001)
        assertTrue(r.isIncome)
        assertEquals(Categories.INCOME, r.category)
    }

    @Test fun revolutEuroPrefix() {
        val r = p("Revolut", "Pagaste €12.50 en Uber")
        assertEquals(12.50, r.amount, 0.001)
        assertFalse(r.isIncome)
        assertEquals("Transporte", r.category)
    }

    @Test fun bizumReceived() {
        val r = p("Bizum recibido", "Has recibido un Bizum de 20 € de Juan Pérez")
        assertEquals(20.0, r.amount, 0.001)
        assertTrue(r.isIncome)
    }

    @Test fun nomina() {
        val r = p("Ingreso", "Abono de nómina: +2.200,00 €")
        assertEquals(2200.0, r.amount, 0.001)
        assertTrue(r.isIncome)
    }

    @Test fun subscription() {
        val r = p("CaixaBank", "Cargo de 12,99 EUR en NETFLIX.COM con tu tarjeta ****1234")
        assertEquals(12.99, r.amount, 0.001)
        assertEquals("Suscripciones", r.category)
    }

    @Test fun balanceOnly() {
        val r = p("Tu saldo", "El saldo de tu cuenta es 845,10 €")
        assertEquals(Categories.BALANCE_ONLY, r.category)
        assertEquals(845.10, r.balance!!, 0.001)
    }

    @Test fun nonFinancialIsIgnored() {
        assertNull(NotificationParser.parse("Juan", "¿Quedamos mañana?"))
        assertFalse(NotificationParser.looksFinancial("Oferta: 20 € de descuento en tu próxima visita"))
    }

    @Test fun numbers() {
        assertEquals(1234.56, NotificationParser.parseNumber("1.234,56")!!, 0.001)
        assertEquals(1234.56, NotificationParser.parseNumber("1,234.56")!!, 0.001)
        assertEquals(1200.0, NotificationParser.parseNumber("1.200")!!, 0.001)
        assertEquals(12.5, NotificationParser.parseNumber("12,5")!!, 0.001)
    }

    @Test fun balanceCalculation() {
        val movs = listOf(
            Movement(amount = 50.0, isIncome = false, merchant = "a", category = "Otros", timestamp = 100, balance = 950.0),
            Movement(amount = 10.0, isIncome = false, merchant = "b", category = "Otros", timestamp = 200),
            Movement(amount = 100.0, isIncome = true, merchant = "c", category = "Ingresos", timestamp = 300),
        )
        assertEquals(1040.0, BalanceCalculator.current(movs, null)!!, 0.001)
        assertEquals(600.0, BalanceCalculator.current(movs, BalanceAnchor(500.0, 250))!!, 0.001)
        assertNull(BalanceCalculator.current(emptyList(), null))
    }

    // ---------- Google Wallet ----------

    @Test fun googleWalletSpanish() {
        val r = NotificationParser.parse("Mercadona", "23,45 € · Visa ••1234", isWallet = true)!!
        assertEquals(23.45, r.amount, 0.001)
        assertFalse(r.isIncome)
        assertEquals("Mercadona", r.merchant)
        assertEquals("Comida", r.category)
    }

    @Test fun googleWalletEnglish() {
        val r = NotificationParser.parse("Starbucks", "€3.80 with Mastercard •••• 5678", isWallet = true)!!
        assertEquals(3.80, r.amount, 0.001)
        assertEquals("Starbucks", r.merchant)
    }

    @Test fun googleWalletRefund() {
        val r = NotificationParser.parse("Zara", "Reembolso de 29,95 € · Visa ••1234", isWallet = true)!!
        assertTrue(r.isIncome)
    }

    @Test fun walletFormatWithoutWalletFlagIsIgnored() {
        assertNull(NotificationParser.parse("Mercadona", "23,45 € · Visa ••1234"))
    }

    // ---------- Unicaja ----------

    @Test fun unicajaCardPurchase() {
        val r = p("Unicaja", "Se ha realizado una compra por 15,20 EUR en LIDL con la tarjeta ****1234")
        assertEquals(15.20, r.amount, 0.001)
        assertFalse(r.isIncome)
        assertEquals("Lidl", r.merchant)
        assertEquals("Comida", r.category)
    }

    @Test fun unicajaDirectDebit() {
        val r = p("Unicaja", "Cargo en cuenta de 45,00 EUR. Recibo IBERDROLA CLIENTES")
        assertEquals(45.0, r.amount, 0.001)
        assertFalse(r.isIncome)
        assertEquals("Iberdrola Clientes", r.merchant)
        assertEquals("Hogar", r.category)
    }

    @Test fun unicajaTransferIn() {
        val r = p("Unicaja", "Has recibido una transferencia de 350,00 EUR. Saldo: 1.467,13 EUR")
        assertTrue(r.isIncome)
        assertEquals(350.0, r.amount, 0.001)
        assertEquals(1467.13, r.balance!!, 0.001)
    }
}
