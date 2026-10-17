package com.byluso.saldo.parser

import java.time.LocalDate
import java.util.Locale
import kotlin.math.abs

/** Una línea de movimiento leída de un extracto bancario en PDF. */
data class StatementLine(
    val date: LocalDate,
    val concept: String,
    val merchant: String,
    /** Siempre positivo; el signo lo da [isIncome]. */
    val amount: Double,
    val isIncome: Boolean,
    val category: String,
    /** Saldo tras el movimiento, si el extracto lo incluye. */
    val balance: Double?,
    val raw: String,
)

data class Statement(
    val bank: String?,
    /** Movimientos en orden cronológico (del más antiguo al más reciente). */
    val lines: List<StatementLine>,
) {
    val from: LocalDate? get() = lines.minOfOrNull { it.date }
    val to: LocalDate? get() = lines.maxOfOrNull { it.date }
    /** Saldo del movimiento más reciente, si el extracto lo indica. */
    val finalBalance: Double? get() = lines.lastOrNull { it.balance != null }?.balance
}

/**
 * Convierte el texto de un extracto bancario (como lo devuelve PDFTextStripper) en movimientos.
 *
 * Funciona por líneas: una línea que empieza por una fecha y contiene importes es un
 * movimiento. El penúltimo importe es el del movimiento y el último, el saldo. Si los
 * importes no llevan signo (columnas Debe/Haber), el tipo se deduce de cómo cambia el saldo.
 */
object StatementParser {

    private val months = mapOf(
        "ene" to 1, "feb" to 2, "mar" to 3, "abr" to 4, "may" to 5, "jun" to 6,
        "jul" to 7, "ago" to 8, "sep" to 9, "set" to 9, "oct" to 10, "nov" to 11, "dic" to 12,
        "jan" to 1, "apr" to 4, "aug" to 8, "dec" to 12,
    )

    private val numericDate = Regex("""^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b""")
    private val textDate = Regex(
        """^(\d{1,2})\s+(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|jan|apr|aug|dec)[a-záéíóú]*\.?(?:\s+(?:de\s+)?(\d{4}))?\b""",
        RegexOption.IGNORE_CASE,
    )

    // Importes con dos decimales: 1.234,56 · -52,30 · 52,30 € · +2.200,00
    private val moneyComma = Regex("""(?<![\d.,])([+\-−]\s?)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?![\d])(?:\s?(?:€|EUR))?""")
    // Variante inglesa: 1,234.56 · -52.30
    private val moneyDot = Regex("""(?<![\d.,])([+\-−]\s?)?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d])(?:\s?(?:€|EUR))?""")

    private val skipConcept = Regex(
        """saldo\s+(anterior|inicial|final|a\s+fecha|al)|^total|suma\s+de|página|pagina|^fecha\b""",
        RegexOption.IGNORE_CASE,
    )

    private val incomeHints = listOf(
        "abono", "ingreso", "nomina", "nómina", "transferencia recibida", "transf. recibida", "recibida",
        "devolucion", "devolución", "reembolso", "bizum recibido", "bizum de", "a su favor", "haber",
        "intereses", "pension", "pensión", "prestacion", "prestación",
    )

    private val conceptPrefixes = listOf(
        """compra\s+tarj(?:eta)?\.?(?:\s+(?:de\s+)?(?:credito|crédito|debito|débito))?""",
        """pago\s+(?:con\s+)?tarj(?:eta)?\.?""", """pago\s+m[oó]vil(?:\s+en)?""", """compra\s+(?:en|internet)""",
        """compra""", """pago\s+en""", """pago""", """adeudo(?:\s+recibo)?""", """recibo(?:\s+de)?""",
        """transferencia(?:\s+(?:a\s+favor\s+de|recibida\s+de|emitida\s+a|inmediata|recibida|emitida|de|a))*""",
        """transf\.?(?:\s+(?:de|a|inm\.?))?""", """bizum\s+(?:enviado|recibido)(?:\s+(?:a|de))?""", """bizum(?:\s+(?:a|de))?""",
        """abono(?:\s+de)?""", """cargo(?:\s+de)?""", """domiciliaci[oó]n""", """liquidaci[oó]n""",
        """ingreso(?:\s+de)?""", """devoluci[oó]n(?:\s+compra)?""",
    ).map { Regex("^(?:$it)\\s*[:\\-]?\\s*", RegexOption.IGNORE_CASE) }

    private val noise = listOf(
        Regex("""\b[\dX*]{4}[\s-]?[\dX*]{4}[\s-]?[\dX*]{4}[\s-]?[\dX*]{4}\b""", RegexOption.IGNORE_CASE), // tarjeta enmascarada
        Regex("""\b(?:\d{4}\s?)?[X*]{4,}\d{0,4}\b""", RegexOption.IGNORE_CASE),
        Regex("""\bES\d{2}(?:\s?\d{4}){5}\b"""), // IBAN
        Regex("""\b\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?\b"""), // fechas dentro del concepto
        Regex("""\b(?:tarj(?:eta)?\.?|ref\.?|n[ºo°]\.?)\s*\d+\b""", RegexOption.IGNORE_CASE),
        Regex("""\b\d{6,}\b"""), // referencias largas
    )

    private val banks = listOf(
        "Unicaja", "BBVA", "CaixaBank", "Santander", "ING", "Openbank", "Sabadell", "Bankinter", "Revolut",
        "N26", "Abanca", "Ibercaja", "Kutxabank", "EVO Banco", "Cajamar", "imagin", "Pibank", "MyInvestor",
        "Caja Rural", "Cajasur", "Wise", "Trade Republic", "Bankia", "Banco Mediolanum", "Deutsche Bank",
    )

    private class Row(
        val date: LocalDate,
        var concept: String,
        val amount: Double,
        val sign: Int, // +1 ingreso, -1 gasto, 0 desconocido
        val balance: Double?,
        var raw: String,
    )

    fun parse(text: String, today: LocalDate = LocalDate.now()): Statement {
        val lines = text.replace(' ', ' ').replace(' ', ' ').lines()
            .map { it.replace(Regex("""[ \t]+"""), " ").trim() }
            .filter { it.isNotEmpty() }
        val money = if (lines.sumOf { moneyComma.findAll(it).count() } >= lines.sumOf { moneyDot.findAll(it).count() }) moneyComma else moneyDot
        val decimalComma = money === moneyComma
        val defaultYear = Regex("""\b(20\d{2})\b""").find(text)?.groupValues?.get(1)?.toInt() ?: today.year

        val rows = mutableListOf<Row>()
        var continuation = 0
        for (line in lines) {
            val date = leadingDate(line, defaultYear, today)
            if (date == null) {
                // Línea sin fecha y sin importes justo después de un movimiento: continuación del concepto.
                val last = rows.lastOrNull()
                if (last != null && continuation < 2 && !money.containsMatchIn(line) && !skipConcept.containsMatchIn(line) && line.length <= 60) {
                    last.concept = (last.concept + " " + line).trim()
                    last.raw += " " + line
                    continuation++
                } else continuation = 2
                continue
            }
            continuation = 0
            var rest = line.substring(date.second)
            // Fecha valor opcional justo detrás de la fecha de operación
            leadingDate(rest.trimStart(), defaultYear, today)?.let { rest = rest.trimStart().substring(it.second) }
            val amounts = money.findAll(rest).toList()
            if (amounts.isEmpty()) continue
            val concept = rest.substring(0, amounts.first().range.first).trim().trim('-', '|', ':').trim()
            if (skipConcept.containsMatchIn(concept)) continue

            val amountMatch = if (amounts.size >= 2) amounts[amounts.size - 2] else amounts[0]
            val balanceMatch = if (amounts.size >= 2) amounts.last() else null
            val value = toNumber(amountMatch, decimalComma)
            if (value == 0.0) continue
            val explicitSign = amountMatch.groupValues[1].trim()
            rows += Row(
                date = date.first,
                concept = concept,
                amount = abs(value),
                sign = when (explicitSign) { "-", "−" -> -1; "+" -> 1; else -> 0 },
                balance = balanceMatch?.let { toNumber(it, decimalComma) },
                raw = line,
            )
        }

        inferSigns(rows)

        // Orden cronológico: muchos extractos listan del más reciente al más antiguo.
        val descending = rows.size > 1 && rows.first().date > rows.last().date
        val ordered = if (descending) rows.reversed() else rows

        return Statement(
            bank = banks.firstOrNull { Regex("""\b${Regex.escape(it)}\b""", RegexOption.IGNORE_CASE).containsMatchIn(text) },
            lines = ordered.map { r ->
                val isIncome = when (r.sign) {
                    1 -> true
                    -1 -> false
                    else -> incomeHints.any { r.concept.lowercase(Locale.ROOT).contains(it) }
                }
                val merchant = merchantOf(r.concept).ifBlank { if (isIncome) "Ingreso" else "Gasto" }
                StatementLine(
                    date = r.date, concept = r.concept, merchant = merchant, amount = r.amount, isIncome = isIncome,
                    category = Categories.guess(merchant, r.concept, isIncome), balance = r.balance, raw = r.raw,
                )
            },
        )
    }

    /** Deduce el signo de los importes sin signo comparando saldos consecutivos. */
    private fun inferSigns(rows: MutableList<Row>) {
        fun near(a: Double, b: Double) = abs(a - b) < 0.015
        for (i in rows.indices) {
            val r = rows[i]
            if (r.sign != 0 || r.balance == null) continue
            val bal = r.balance
            val prev = rows.getOrNull(i - 1)?.balance
            val next = rows.getOrNull(i + 1)?.balance
            val sign = when {
                prev != null && near(prev + r.amount, bal) -> 1   // orden ascendente
                prev != null && near(prev - r.amount, bal) -> -1
                next != null && near(next + r.amount, bal) -> 1   // orden descendente
                next != null && near(next - r.amount, bal) -> -1
                else -> 0
            }
            if (sign != 0) rows[i] = Row(r.date, r.concept, r.amount, sign, r.balance, r.raw)
        }
    }

    /** Devuelve la fecha al principio de la línea y cuántos caracteres ocupa. */
    private fun leadingDate(line: String, defaultYear: Int, today: LocalDate): Pair<LocalDate, Int>? {
        numericDate.find(line)?.let { m ->
            val d = m.groupValues[1].toInt()
            val mo = m.groupValues[2].toInt()
            var y = m.groupValues[3].toInt()
            if (y < 100) y += 2000
            return runCatching { LocalDate.of(y, mo, d) }.getOrNull()?.let { it to m.range.last + 1 }
        }
        textDate.find(line)?.let { m ->
            val d = m.groupValues[1].toInt()
            val mo = months[m.groupValues[2].lowercase(Locale.ROOT).take(3)] ?: return null
            val y = m.groupValues[3].toIntOrNull() ?: run {
                // Sin año: el más reciente que no quede en el futuro
                if (LocalDate.of(defaultYear, mo, 1) > today) defaultYear - 1 else defaultYear
            }
            return runCatching { LocalDate.of(y, mo, d) }.getOrNull()?.let { it to m.range.last + 1 }
        }
        return null
    }

    private fun toNumber(m: MatchResult, decimalComma: Boolean): Double {
        val intPart = m.groupValues[2].replace(if (decimalComma) "." else ",", "")
        val v = "$intPart.${m.groupValues[3]}".toDouble()
        return if (m.groupValues[1].trim().let { it == "-" || it == "−" }) -v else v
    }

    /** Limpia el concepto bancario para quedarse con el comercio o la persona. */
    fun merchantOf(concept: String): String {
        var s = concept
        noise.forEach { s = s.replace(it, " ") }
        s = s.replace(Regex("""\s+"""), " ").trim()
        repeat(2) { conceptPrefixes.forEach { p -> s = s.replace(p, "") } }
        s = s.replace(Regex("""\s+(?:ES|ESP|SPAIN|ESPAÑA)$""", RegexOption.IGNORE_CASE), "")
            .trim().trim('-', ',', '.', ':', '/', '*').trim()
        if (s.isEmpty()) return ""
        return NotificationParser.prettify(s)
    }
}
