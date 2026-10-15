package com.byluso.saldo.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

object C {
    val Bg = Color(0xFF0F172A)
    val Header = Color(0xFF1E293B)
    val Card = Color(0xFF1E293B)
    val CardAlt = Color(0xFF273449)
    val Track = Color(0xFF334155)
    val Border = Color(0x1AFFFFFF)
    val Text = Color(0xFFF8FAFC)
    val Muted = Color(0xFF94A3B8)
    val Accent = Color(0xFF38BDF8)
    val OnAccent = Color(0xFF0F172A)
    val Income = Color(0xFF34D399)
    val Expense = Color(0xFFF87171)
}

@Composable
fun SaldoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = C.Accent,
            onPrimary = C.OnAccent,
            background = C.Bg,
            surface = C.Card,
            onSurface = C.Text,
            onBackground = C.Text,
            surfaceVariant = C.CardAlt,
            onSurfaceVariant = C.Muted,
            error = C.Expense,
        ),
        content = content,
    )
}

/** Ocultar importes (botón del ojo). */
val LocalHideAmounts = staticCompositionLocalOf { false }

val esLocale: Locale = Locale.forLanguageTag("es-ES")
private val numberFormat = NumberFormat.getNumberInstance(esLocale).apply {
    minimumFractionDigits = 2
    maximumFractionDigits = 2
}

fun euros(value: Double, signed: Boolean = false, hide: Boolean = false): String {
    if (hide) return "••••• €"
    val sign = when {
        !signed -> if (value < 0) "-" else ""
        value > 0 -> "+"
        value < 0 -> "-"
        else -> ""
    }
    return "$sign${numberFormat.format(kotlin.math.abs(value))} €"
}

fun monthTitle(ym: YearMonth): String =
    ym.month.getDisplayName(TextStyle.FULL_STANDALONE, esLocale).replaceFirstChar { it.titlecase(esLocale) } + " " + ym.year

fun YearMonth.contains(ts: Long): Boolean = YearMonth.from(toDate(ts)) == this

fun toDate(ts: Long): LocalDate = Instant.ofEpochMilli(ts).atZone(ZoneId.systemDefault()).toLocalDate()

private val dayFmt = DateTimeFormatter.ofPattern("EEE, d MMM", esLocale)

fun relativeDay(ts: Long): String {
    val d = toDate(ts)
    val today = LocalDate.now()
    return when (d) {
        today -> "Hoy"
        today.minusDays(1) -> "Ayer"
        else -> dayFmt.format(d)
    }
}
