package com.byluso.saldo.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import com.byluso.saldo.R
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/** Paleta "holo 2100": vacío casi negro, cristal y un degradado iridiscente cian → violeta → magenta. */
object C {
    val Void = Color(0xFF04050B)
    val Deep = Color(0xFF0A0E1C)
    val Glass = Color(0x0FFFFFFF)
    val GlassStrong = Color(0x1AFFFFFF)
    val Line = Color(0x26FFFFFF)
    val Track = Color(0x14FFFFFF)
    val Text = Color(0xFFEAF6FF)
    val Muted = Color(0xFF7D89A6)
    val Cyan = Color(0xFF00E5FF)
    val Violet = Color(0xFF8A5CFF)
    val Magenta = Color(0xFFFF3DCB)
    val Income = Color(0xFF3DFFB0)
    val Expense = Color(0xFFFF4D6D)

    // Alias usados por el resto de la app
    val Bg = Void
    val Card = Deep
    val CardAlt = GlassStrong
    val Border = Line
    val Accent = Cyan
    val OnAccent = Void

    val holo = Brush.linearGradient(listOf(Cyan, Violet, Magenta))
    val holoSoft = Brush.linearGradient(listOf(Cyan.copy(alpha = 0.55f), Violet.copy(alpha = 0.35f), Magenta.copy(alpha = 0.55f)))
}

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, vararg weights: Int) = FontFamily(
    weights.map { w ->
        Font(res, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))
    }
)

/** Orbitron: titulares y cifras grandes. */
val Display = variable(R.font.orbitron, 500, 700, 900)
/** Exo 2: texto general. */
val Body = variable(R.font.exo2, 400, 500, 600, 700)
/** JetBrains Mono: etiquetas técnicas y datos. */
val Mono = variable(R.font.jetbrains_mono, 400, 500, 700)

private val typography = Typography().let { t ->
    Typography(
        displayLarge = t.displayLarge.copy(fontFamily = Display),
        displayMedium = t.displayMedium.copy(fontFamily = Display),
        displaySmall = t.displaySmall.copy(fontFamily = Display),
        headlineLarge = t.headlineLarge.copy(fontFamily = Display),
        headlineMedium = t.headlineMedium.copy(fontFamily = Display),
        headlineSmall = t.headlineSmall.copy(fontFamily = Display),
        titleLarge = t.titleLarge.copy(fontFamily = Body),
        titleMedium = t.titleMedium.copy(fontFamily = Body),
        titleSmall = t.titleSmall.copy(fontFamily = Body),
        bodyLarge = t.bodyLarge.copy(fontFamily = Body),
        bodyMedium = t.bodyMedium.copy(fontFamily = Body),
        bodySmall = t.bodySmall.copy(fontFamily = Body),
        labelLarge = t.labelLarge.copy(fontFamily = Mono),
        labelMedium = t.labelMedium.copy(fontFamily = Mono),
        labelSmall = t.labelSmall.copy(fontFamily = Mono),
    )
}

@Composable
fun SaldoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = C.Cyan,
            onPrimary = C.Void,
            secondary = C.Violet,
            tertiary = C.Magenta,
            background = C.Void,
            surface = C.Deep,
            onSurface = C.Text,
            onBackground = C.Text,
            surfaceVariant = C.GlassStrong,
            onSurfaceVariant = C.Muted,
            outline = C.Line,
            error = C.Expense,
        ),
        typography = typography,
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
