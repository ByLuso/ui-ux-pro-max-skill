package com.byluso.saldo.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.data.Movement
import com.byluso.saldo.data.Repository
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.NotificationParser
import kotlin.math.roundToInt

// ======================================================================= Superficies

/** Forma de las tarjetas: esquinas redondeadas suaves. (Nombre heredado del diseño anterior.) */
fun chamfer(cut: Dp = 18.dp): Shape = RoundedCornerShape((cut.value * 0.9f).coerceIn(10f, 20f).dp)

/**
 * Tarjeta plana: superficie, borde fino y, si se pasa [fill], un tinte muy suave encima.
 * [border] se respeta para destacar alguna tarjeta con el color de acento.
 */
fun Modifier.holoPanel(cut: Dp = 18.dp, border: Brush = C.holoSoft, fill: Color = C.Glass): Modifier {
    val shape = chamfer(cut)
    val tint = if (fill == C.Glass) Color.Transparent else fill.copy(alpha = (fill.alpha * 0.6f).coerceAtMost(0.08f))
    return this
        .clip(shape)
        .background(C.Card, shape)
        .background(tint, shape)
        .border(1.dp, border, shape)
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().holoPanel().padding(20.dp), content = content)
}

/** Etiqueta pequeña de sección, en tono apagado. */
@Composable
fun HudLabel(text: String, color: Color = C.Muted, modifier: Modifier = Modifier) {
    Text(
        text.replaceFirstChar { it.titlecase(esLocale) },
        color = if (color == C.Muted) C.Muted else color.copy(alpha = 0.9f),
        fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = modifier,
    )
}

/** Cifra destacada (antes con brillo; ahora texto limpio en semibold). */
@Composable
fun GlowText(
    text: String,
    color: Color,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
    @Suppress("UNUSED_PARAMETER") brush: Brush? = null,
    fontWeight: FontWeight = FontWeight.SemiBold,
) {
    Text(text, modifier = modifier, maxLines = 1, style = TextStyle(fontWeight = fontWeight, fontSize = fontSize, color = color, letterSpacing = (-0.3).sp))
}

/** Cuenta animada hacia el nuevo valor. */
@Composable
fun rememberCountUp(target: Double): Double {
    val preview = LocalInspectionMode.current
    var from by remember { mutableDoubleStateOf(if (preview) target else 0.0) }
    var to by remember { mutableDoubleStateOf(target) }
    val progress = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(target) {
        if (preview) return@LaunchedEffect
        from += (to - from) * progress.value
        to = target
        progress.snapTo(0f)
        progress.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
    }
    return from + (to - from) * progress.value
}

/** Fondo de la app: color liso. (Nombre heredado.) */
@Composable
fun CosmicBackground(content: @Composable BoxScope.() -> Unit) {
    Box(Modifier.fillMaxSize().background(C.Void), content = content)
}

// ======================================================================= Gráficos

data class Slice(val label: String, val value: Double, val color: Color)

/** Anillo de reparto: se dibuja al aparecer; tocar un sector lo destaca y muestra su detalle. */
@Composable
fun Donut(
    slices: List<Slice>,
    centerTop: String,
    centerBottom: String,
    modifier: Modifier = Modifier,
    selected: Int? = null,
    onSelect: (Int?) -> Unit = {},
    hide: Boolean = false,
) {
    val total = slices.sumOf { it.value }.takeIf { it > 0 } ?: 1.0
    val preview = LocalInspectionMode.current
    val appear = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(slices.map { it.label to it.value }) {
        if (preview) return@LaunchedEffect
        appear.snapTo(0f)
        appear.animateTo(1f, tween(900, easing = FastOutSlowInEasing))
    }
    val dim by animateFloatAsState(if (selected != null) 1f else 0f, tween(250), label = "dim")
    val emph = slices.indices.map { i -> animateFloatAsState(if (selected == i) 1f else 0f, spring(stiffness = 400f), label = "e$i").value }
    val haptic = LocalHapticFeedback.current

    Box(modifier.size(210.dp), contentAlignment = Alignment.Center) {
        Canvas(
            Modifier.size(210.dp).pointerInput(slices) {
                detectTapGestures { pos ->
                    val dx = pos.x - size.width / 2f
                    val dy = pos.y - size.height / 2f
                    val dist = kotlin.math.sqrt(dx * dx + dy * dy)
                    val ringR = size.width / 2f - 16.dp.toPx()
                    if (kotlin.math.abs(dist - ringR) > 24.dp.toPx() || slices.isEmpty()) { onSelect(null); return@detectTapGestures }
                    val ang = ((Math.toDegrees(kotlin.math.atan2(dy, dx).toDouble()) + 90 + 360) % 360).toFloat()
                    var acc = 0f
                    val idx = slices.indexOfFirst { sl -> acc += (sl.value / total * 360f).toFloat(); ang <= acc }.takeIf { it >= 0 } ?: slices.lastIndex
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onSelect(if (idx == selected) null else idx)
                }
            }
        ) {
            val stroke = 14.dp.toPx()
            val inset = 16.dp.toPx()
            val arc = Size(size.width - inset * 2, size.height - inset * 2)
            drawArc(C.Track, 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
            val gap = if (slices.size > 1) 2f else 0f
            var start = -90f
            slices.forEachIndexed { i, s ->
                val sweep = (s.value / total * 360f).toFloat() * appear.value
                val e = emph.getOrElse(i) { 0f }
                val alpha = 1f - 0.55f * dim * (1f - e)
                drawArc(
                    s.color.copy(alpha = alpha), start + gap / 2, (sweep - gap).coerceAtLeast(0.6f), false,
                    Offset(inset, inset), arc, style = Stroke(stroke + 6.dp.toPx() * e, cap = StrokeCap.Butt),
                )
                start += sweep
            }
        }
        AnimatedContent(
            targetState = selected?.takeIf { it in slices.indices },
            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(120)) },
            label = "center",
        ) { sel ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                if (sel == null) {
                    Text(centerTop, color = C.Text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text(centerBottom.lowercase(esLocale).replaceFirstChar { it.titlecase(esLocale) }, color = C.Muted, fontSize = 12.sp)
                } else {
                    val s = slices[sel]
                    Text(s.label, color = C.Muted, fontSize = 12.sp, maxLines = 1)
                    Text(euros(s.value, hide = hide), color = C.Text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text("${(s.value / total * 100).roundToInt()} % del total", color = C.Muted, fontSize = 11.sp)
                }
            }
        }
    }
}

/** Barra de categoría: línea fina con el porcentaje. */
@Composable
fun CategoryBar(
    name: String, amount: Double, pct: Int, color: Color, hide: Boolean,
    selected: Boolean = false, dimmed: Boolean = false, onClick: () -> Unit = {},
) {
    val fade by animateFloatAsState(if (dimmed) 0.45f else 1f, tween(250), label = "fade")
    val bg by animateColorAsState(if (selected) color.copy(alpha = 0.10f) else Color.Transparent, tween(250), label = "bg")
    val preview = LocalInspectionMode.current
    val target = (pct / 100f).coerceIn(0f, 1f)
    val grow = remember { Animatable(if (preview) target else 0f) }
    LaunchedEffect(pct) { if (!preview) grow.animateTo(target, tween(800, easing = FastOutSlowInEasing)) }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .bounceClick(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.graphicsAlpha(fade)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(color))
            Text(name, color = C.Text, fontSize = 15.sp, modifier = Modifier.padding(start = 10.dp).weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(euros(amount, hide = hide), color = C.Text, fontSize = 14.sp)
            Text("$pct %", color = C.Muted, fontSize = 13.sp, modifier = Modifier.width(52.dp).padding(start = 10.dp))
        }
        Spacer(Modifier.height(8.dp))
        Canvas(Modifier.fillMaxWidth().height(4.dp).graphicsAlpha(fade)) {
            val y = size.height / 2
            drawLine(C.Track, Offset(0f, y), Offset(size.width, y), size.height, StrokeCap.Round)
            drawLine(color, Offset(0f, y), Offset((size.width * grow.value).coerceAtLeast(size.height), y), size.height, StrokeCap.Round)
        }
    }
}

private fun Modifier.graphicsAlpha(a: Float) = graphicsLayer { alpha = a }

// ======================================================================= Filas y controles

@Composable
fun MovementRow(m: Movement, hide: Boolean, onClick: () -> Unit) {
    val cat = Categories.byName(m.category)
    val color = Color(cat.color)
    Row(
        Modifier.fillMaxWidth().bounceClick(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) { Text(cat.emoji, fontSize = 19.sp) }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(m.merchant, color = C.Text, fontSize = 16.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                relativeDay(m.timestamp) + " · " + m.category + when (m.sourceApp) {
                    null -> ""
                    Repository.SOURCE_PDF -> " · extracto"
                    else -> " · automático"
                },
                color = C.Muted, fontSize = 12.sp, maxLines = 1,
            )
        }
        Text(
            euros(if (m.isIncome) m.amount else -m.amount, signed = true, hide = hide),
            color = if (m.isIncome) C.Income else C.Text,
            fontSize = 15.sp, fontWeight = FontWeight.Medium,
        )
    }
}

/** Chip de selección: relleno con el acento cuando está activo. */
@Composable
fun Pill(label: String, selected: Boolean, onClick: () -> Unit) {
    val bg by animateColorAsState(if (selected) C.Accent else C.CardAlt, tween(220), label = "pillBg")
    val fg by animateColorAsState(if (selected) C.OnAccent else C.Muted, tween(220), label = "pillFg")
    Box(
        Modifier
            .bounceClick(onClick = onClick)
            .clip(CircleShape)
            .background(bg)
            .padding(horizontal = 16.dp, vertical = 9.dp),
    ) {
        Text(label.replaceFirstChar { it.titlecase(esLocale) }, color = fg, fontWeight = FontWeight.Medium, fontSize = 14.sp, maxLines = 1)
    }
}

/** Botón de añadir: circular, con el color de acento. (Nombre heredado.) */
@Composable
fun DiamondButton(onClick: () -> Unit, content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier
            .padding(bottom = 4.dp)
            .size(58.dp)
            .shadow(6.dp, CircleShape)
            .clip(CircleShape)
            .background(C.Accent)
            .bounceClick(onClick = onClick),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

@Composable
fun holoFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = C.Accent, unfocusedBorderColor = C.Line,
    focusedLabelColor = C.Accent, unfocusedLabelColor = C.Muted,
    cursorColor = C.Accent, focusedTextColor = C.Text, unfocusedTextColor = C.Text,
)

/** Diálogo para añadir o editar un movimiento a mano. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MovementDialog(
    initial: Movement?,
    onDismiss: () -> Unit,
    onSave: (Movement) -> Unit,
    onDelete: ((Movement) -> Unit)? = null,
) {
    var isIncome by remember { mutableStateOf(initial?.isIncome ?: false) }
    var amount by remember { mutableStateOf(initial?.amount?.let { euros(it).removeSuffix(" €") } ?: "") }
    var merchant by remember { mutableStateOf(initial?.merchant ?: "") }
    var category by remember { mutableStateOf(initial?.category ?: Categories.OTHER) }
    var confirmDelete by remember { mutableStateOf(false) }

    val parsedAmount = NotificationParser.parseNumber(amount.trim())
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Card,
        shape = RoundedCornerShape(20.dp),
        title = { Text(if (initial == null) "Nuevo movimiento" else initial.merchant, color = C.Text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Gasto", !isIncome) { isIncome = false; if (Categories.isIncomeCategory(category)) category = Categories.OTHER }
                    Pill("Ingreso", isIncome) { isIncome = true; if (!Categories.isIncomeCategory(category)) category = Categories.INCOME }
                }
                if (isIncome) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("💼 Nómina", category == Categories.SALARY) { category = Categories.SALARY }
                        Pill("Otro ingreso", category == Categories.INCOME) { category = Categories.INCOME }
                    }
                    Text(
                        "Los cálculos del Asesor se hacen sobre los ingresos marcados como nómina.",
                        color = C.Muted, fontSize = 12.sp,
                    )
                }
                OutlinedTextField(
                    value = amount, onValueChange = { amount = it }, label = { Text("Importe (€)") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = TextStyle(fontSize = 18.sp), colors = holoFieldColors(), shape = RoundedCornerShape(12.dp),
                )
                OutlinedTextField(
                    value = merchant, onValueChange = { merchant = it }, label = { Text("Concepto o comercio") },
                    singleLine = true, colors = holoFieldColors(), shape = RoundedCornerShape(12.dp),
                )
                if (!isIncome) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Categories.expenseNames.forEach { name ->
                            val c = Categories.byName(name)
                            val sel = category == name
                            Text(
                                "${c.emoji} $name",
                                color = if (sel) C.Text else C.Muted, fontSize = 13.sp,
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(if (sel) Color(c.color).copy(alpha = 0.22f) else C.CardAlt)
                                    .clickable { category = name }
                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                            )
                        }
                    }
                }
                initial?.rawText?.let {
                    Text("Texto original", color = C.Muted, fontSize = 12.sp)
                    Text(it, color = C.Muted, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = parsedAmount != null && parsedAmount > 0,
                onClick = {
                    val base = initial ?: Movement(
                        amount = 0.0, isIncome = false, merchant = "", category = Categories.OTHER,
                        timestamp = System.currentTimeMillis(),
                    )
                    onSave(
                        base.copy(
                            amount = parsedAmount!!, isIncome = isIncome,
                            merchant = merchant.ifBlank { if (isIncome) "Ingreso" else "Gasto" },
                            category = if (isIncome) (if (category == Categories.SALARY) Categories.SALARY else Categories.INCOME) else category,
                        )
                    )
                },
            ) { Text("Guardar", color = C.Accent, fontWeight = FontWeight.SemiBold) }
        },
        dismissButton = {
            Row {
                if (initial != null && onDelete != null) {
                    TextButton(onClick = { if (confirmDelete) onDelete(initial) else confirmDelete = true }) {
                        Text(if (confirmDelete) "Confirmar borrado" else "Borrar", color = C.Expense)
                    }
                }
                TextButton(onClick = onDismiss) { Text("Cancelar", color = C.Muted) }
            }
        },
    )
}

/** Punto de estado (sincronización activa). */
@Composable
fun LiveDot(color: Color = C.Income) {
    Box(Modifier.size(8.dp).clip(CircleShape).background(color))
}
