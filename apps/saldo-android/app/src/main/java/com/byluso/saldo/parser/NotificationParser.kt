package com.byluso.saldo.parser

import java.util.Locale

/** Resultado de analizar una notificación bancaria. */
data class ParsedNotification(
    /** 0 cuando la notificación solo informa del saldo. */
    val amount: Double,
    val isIncome: Boolean,
    val merchant: String,
    val category: String,
    /** Saldo que informa el banco en la propia notificación, si lo hay. */
    val balance: Double?,
)

/**
 * Extrae importe, tipo (gasto/ingreso), comercio y saldo de los textos que envían
 * las apps bancarias españolas (BBVA, CaixaBank, Santander, ING, Revolut, N26...).
 */
object NotificationParser {

    // Número en formato español o inglés: 1.234,56 · 1234,56 · 1,234.56 · 12.50 · 20
    private const val NUM = """\d{1,3}(?:[.\s ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?"""

    private val amountRegex = Regex(
        """(?:([+\-−])\s?)?(?:(?:€|EUR)\s?($NUM)|($NUM)\s?(?:€|EUR|euros?))""",
        RegexOption.IGNORE_CASE,
    )

    private val balanceKeyword = Regex("""\bsaldo\b""", RegexOption.IGNORE_CASE)

    private val incomeWords = listOf(
        "has recibido", "recibido", "recibida", "ingreso", "ingresado", "abono", "abonado",
        "nómina", "nomina", "devolución", "devolucion", "reembolso", "te ha enviado",
        "te han enviado", "te ha pagado", "transferencia entrante", "bizum de",
    )

    private val expenseWords = listOf(
        "pago", "pagado", "pagaste", "has pagado", "compra", "cargo", "cargado", "adeudo",
        "recibo", "domiciliación", "domiciliacion", "retirada", "reintegro", "has enviado",
        "enviado", "bizum a", "transferencia emitida", "transferencia enviada", "cobro",
        "suscripción", "suscripcion", "gastaste", "has gastado", "spent", "paid",
    )

    /** Palabras que indican que el texto es de dinero aunque no venga de un banco conocido. */
    private val financeHints = incomeWords + expenseWords + listOf("saldo", "tarjeta", "cuenta", "bizum", "transferencia")

    private val merchantRegexes = listOf(
        Regex("""\b(?i:recibo|domiciliaci[oó]n)\s+(?:(?i:de)\s+)?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ&'*.\- ]{1,40})"""),
        Regex("""\b(?:en|at|a)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9][\wÁÉÍÓÚÑáéíóúñ&'*.\- ]{1,40})""", RegexOption.IGNORE_CASE),
        Regex("""\bde\s+([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ&'*.\- ]{1,40})"""),
    )

    private val merchantStop = Regex(
        """\s+(?:con\s+(?:tu|la|su)|tarjeta|el\s+d[ií]a|el\s+\d|por\s+(?:importe|valor)|de\s+\d|por\s+\d|\d+[.,]\d{2}|saldo|\.\s|,\s|desde|terminada|acabada|ref).*$""",
        RegexOption.IGNORE_CASE,
    )

    fun looksFinancial(text: String): Boolean {
        val lower = text.lowercase(Locale.ROOT)
        return amountRegex.containsMatchIn(text) && financeHints.any { lower.contains(it) }
    }

    /**
     * @param isWallet true para Google Wallet / Samsung Wallet: si el texto no dice si es
     *   gasto o ingreso se asume gasto, y el comercio es el título de la notificación.
     */
    fun parse(title: String?, text: String?, isWallet: Boolean = false): ParsedNotification? {
        val full = listOfNotNull(title, text).joinToString(". ").replace('\n', ' ').trim()
        if (full.isEmpty()) return null

        // Saldo: primer importe que aparece en los 40 caracteres siguientes a "saldo".
        val balanceMatch = balanceKeyword.find(full)?.let { kw ->
            amountRegex.find(full, kw.range.last)?.takeIf { it.range.first - kw.range.last <= 40 }
        }
        val balance = balanceMatch?.let { toSignedAmount(it) }

        // Importe del movimiento: el primero que no sea el del saldo.
        val amountMatch = amountRegex.findAll(full).firstOrNull { m ->
            balanceMatch == null || m.range != balanceMatch.range
        }
        if (amountMatch == null) {
            // Notificación que solo informa del saldo ("Tu saldo es 1.234,56 €").
            return balance?.let { ParsedNotification(0.0, false, "Saldo", Categories.BALANCE_ONLY, it) }
        }
        val signed = toSignedAmount(amountMatch) ?: return null
        if (signed == 0.0) return null

        val lower = full.lowercase(Locale.ROOT)
        val isIncome = when {
            amountMatch.groupValues[1] == "+" -> true
            amountMatch.groupValues[1].let { it == "-" || it == "−" } -> false
            else -> {
                val inc = incomeWords.filter { lower.contains(it) }.maxOfOrNull { it.length } ?: 0
                val exp = expenseWords.filter { lower.contains(it) }.maxOfOrNull { it.length } ?: 0
                if (inc == 0 && exp == 0 && !isWallet) return null
                inc > exp
            }
        }

        val walletTitle = title?.trim()?.takeIf { isWallet && it.isNotEmpty() && !amountRegex.containsMatchIn(it) }
        val merchant = walletTitle?.take(40) ?: findMerchant(full, amountMatch.range) ?: title?.trim()?.take(40).orEmpty()
        return ParsedNotification(
            amount = kotlin.math.abs(signed),
            isIncome = isIncome,
            merchant = merchant.ifBlank { if (isIncome) "Ingreso" else "Gasto" },
            category = Categories.guess(merchant, full, isIncome),
            balance = balance,
        )
    }

    private fun findMerchant(full: String, amountRange: IntRange): String? {
        for (regex in merchantRegexes) {
            // Preferimos el comercio que aparece justo después del importe.
            val matches = regex.findAll(full).toList()
            val m = matches.firstOrNull { it.range.first >= amountRange.last } ?: matches.firstOrNull() ?: continue
            val cleaned = m.groupValues[1].replace(merchantStop, "").trim().trimEnd('.', ',', ':', '-')
            if (cleaned.length >= 2 && !cleaned.first().isDigit() && !isGenericWord(cleaned)) {
                return prettify(cleaned)
            }
        }
        return null
    }

    private fun isGenericWord(s: String): Boolean = s.lowercase(Locale.ROOT) in setOf(
        "tu cuenta", "la cuenta", "cuenta", "tu tarjeta", "tarjeta", "euros", "eur", "tu", "la", "el",
    )

    internal fun prettify(s: String): String {
        val trimmed = s.take(32)
        return if (trimmed == trimmed.uppercase(Locale.ROOT)) {
            trimmed.lowercase(Locale.ROOT).split(' ').joinToString(" ") { w ->
                w.replaceFirstChar { it.titlecase(Locale.ROOT) }
            }
        } else trimmed
    }

    private fun toSignedAmount(m: MatchResult): Double? {
        val raw = m.groupValues[2].ifEmpty { m.groupValues[3] }
        val value = parseNumber(raw) ?: return null
        return if (m.groupValues[1] == "-" || m.groupValues[1] == "−") -value else value
    }

    /** Convierte "1.234,56", "1,234.56", "12,5", "1.200" o "20" en Double. */
    fun parseNumber(raw: String): Double? {
        val s = raw.replace(" ", "").replace(" ", "").trim()
        if (s.isEmpty()) return null
        val lastDot = s.lastIndexOf('.')
        val lastComma = s.lastIndexOf(',')
        val normalized = when {
            lastDot >= 0 && lastComma >= 0 ->
                if (lastComma > lastDot) s.replace(".", "").replace(',', '.') else s.replace(",", "")
            lastComma >= 0 -> s.replace(',', '.')
            lastDot >= 0 ->
                // "1.200" (miles) frente a "12.50" (decimales)
                if (s.length - lastDot - 1 == 3) s.replace(".", "") else s
            else -> s
        }
        return normalized.toDoubleOrNull()
    }
}
