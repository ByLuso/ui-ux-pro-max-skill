package com.byluso.saldo.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontFamily
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/** Paleta tranquila: neutros con un leve tono verde, un único acento verde azulado y semánticos apagados. */
data class Palette(
    val bg: Color, val surface: Color, val surface2: Color, val line: Color, val track: Color,
    val text: Color, val muted: Color, val accent: Color, val onAccent: Color, val accent2: Color,
    val warn: Color, val income: Color, val expense: Color, val dark: Boolean,
)

val LightPalette = Palette(
    bg = Color(0xFFF3F4F1), surface = Color(0xFFFFFFFF), surface2 = Color(0xFFEDEFEB), line = Color(0xFFE0E3DE),
    track = Color(0xFFE8EBE6), text = Color(0xFF1F2523), muted = Color(0xFF6E7873), accent = Color(0xFF3F7D6E),
    onAccent = Color(0xFFFFFFFF), accent2 = Color(0xFF6C7FA6), warn = Color(0xFFB98A3E),
    income = Color(0xFF3E8A66), expense = Color(0xFFB2645A), dark = false,
)

val DarkPalette = Palette(
    bg = Color(0xFF141817), surface = Color(0xFF1C2120), surface2 = Color(0xFF232927), line = Color(0xFF2C3330),
    track = Color(0xFF2A302E), text = Color(0xFFE5E9E6), muted = Color(0xFF8D9893), accent = Color(0xFF86BBAC),
    onAccent = Color(0xFF12201C), accent2 = Color(0xFF9DADCB), warn = Color(0xFFD3AE6B),
    income = Color(0xFF80BC9C), expense = Color(0xFFD58E84), dark = true,
)

/**
 * Colores de la app. Los nombres se mantienen del diseño anterior para no tocar cada pantalla,
 * pero ahora apuntan a la paleta tranquila activa (clara u oscura según el sistema).
 */
object C {
    var pal by mutableStateOf(LightPalette)

    val Void: Color get() = pal.bg
    val Deep: Color get() = pal.surface
    val Glass: Color get() = pal.surface
    val GlassStrong: Color get() = pal.surface2
    val Line: Color get() = pal.line
    val Track: Color get() = pal.track
    val Text: Color get() = pal.text
    val Muted: Color get() = pal.muted
    val Cyan: Color get() = pal.accent
    val Violet: Color get() = pal.accent2
    val Magenta: Color get() = pal.warn
    val Income: Color get() = pal.income
    val Expense: Color get() = pal.expense

    val Bg: Color get() = pal.bg
    val Card: Color get() = pal.surface
    val CardAlt: Color get() = pal.surface2
    val Border: Color get() = pal.line
    val Accent: Color get() = pal.accent
    val OnAccent: Color get() = pal.onAccent

    /** Antes degradados holográficos; ahora colores planos. */
    val holo: Brush get() = SolidColor(pal.accent.copy(alpha = 0.45f))
    val holoSoft: Brush get() = SolidColor(pal.line)
}

/** Tipografía del sistema: limpia y la misma del resto del móvil. */
val Display: FontFamily = FontFamily.Default
val Body: FontFamily = FontFamily.Default
val Mono: FontFamily = FontFamily.Default

@Composable
fun SaldoTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val p = if (dark) DarkPalette else LightPalette
    SideEffect { if (C.pal != p) C.pal = p }
    if (C.pal != p) C.pal = p
    MaterialTheme(
        colorScheme = if (dark) darkColorScheme(
            primary = p.accent, onPrimary = p.onAccent, secondary = p.accent2, tertiary = p.warn,
            background = p.bg, surface = p.surface, onSurface = p.text, onBackground = p.text,
            surfaceVariant = p.surface2, onSurfaceVariant = p.muted, outline = p.line, error = p.expense,
        ) else lightColorScheme(
            primary = p.accent, onPrimary = p.onAccent, secondary = p.accent2, tertiary = p.warn,
            background = p.bg, surface = p.surface, onSurface = p.text, onBackground = p.text,
            surfaceVariant = p.surface2, onSurfaceVariant = p.muted, outline = p.line, error = p.expense,
        ),
        typography = Typography(),
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
