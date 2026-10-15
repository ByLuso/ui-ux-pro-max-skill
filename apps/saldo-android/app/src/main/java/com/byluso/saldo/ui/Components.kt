package com.byluso.saldo.ui

import android.graphics.BlurMaskFilter
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CutCornerShape
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
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
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.NotificationParser
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

// ======================================================================= Superficies

/** Forma de panel con dos esquinas cortadas a 45°. */
fun chamfer(cut: Dp = 18.dp): Shape = CutCornerShape(topStart = cut, topEnd = 0.dp, bottomEnd = cut, bottomStart = 0.dp)

/** Panel de cristal con borde iridiscente. */
fun Modifier.holoPanel(cut: Dp = 18.dp, border: Brush = C.holoSoft, fill: Color = C.Glass): Modifier {
    val shape = chamfer(cut)
    return this
        .clip(shape)
        .background(Brush.verticalGradient(listOf(fill, fill.copy(alpha = fill.alpha * 0.4f))), shape)
        .border(1.dp, border, shape)
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().holoPanel().padding(20.dp), content = content)
}

/** Etiqueta técnica: "// INGRESOS". */
@Composable
fun HudLabel(text: String, color: Color = C.Muted, modifier: Modifier = Modifier) {
    Text(
        "// " + text.uppercase(esLocale), color = color, fontFamily = Mono, fontSize = 11.sp,
        letterSpacing = 2.5.sp, modifier = modifier,
    )
}

/** Texto con resplandor de neón. */
@Composable
fun GlowText(
    text: String,
    color: Color,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
    brush: Brush? = null,
    fontWeight: FontWeight = FontWeight.Bold,
) {
    Text(
        text, modifier = modifier, maxLines = 1,
        style = TextStyle(
            fontFamily = Display, fontWeight = fontWeight, fontSize = fontSize, color = color,
            shadow = Shadow(color.copy(alpha = 0.65f), Offset.Zero, 28f),
        ).let { if (brush != null) it.merge(TextStyle(brush = brush)) else it },
    )
}

/** Cuenta animada hacia el nuevo valor (efecto "contador"). */
@Composable
fun rememberCountUp(target: Double): Double {
    // En las vistas previas (Android Studio / capturas) se muestra el valor final directamente.
    val preview = LocalInspectionMode.current
    var from by remember { mutableDoubleStateOf(if (preview) target else 0.0) }
    var to by remember { mutableDoubleStateOf(target) }
    val progress = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(target) {
        if (preview) return@LaunchedEffect
        from += (to - from) * progress.value
        to = target
        progress.snapTo(0f)
        progress.animateTo(1f, tween(1100, easing = FastOutSlowInEasing))
    }
    return from + (to - from) * progress.value
}

// ======================================================================= Fondo

/** Fondo vivo: auroras que se desplazan, estrellas y una rejilla en perspectiva. */
@Composable
fun CosmicBackground(content: @Composable BoxScope.() -> Unit) {
    val t = rememberInfiniteTransition(label = "cosmos")
    val phase by t.animateFloat(0f, 1f, infiniteRepeatable(tween(18000, easing = LinearEasing)), label = "phase")
    val gridShift by t.animateFloat(0f, 1f, infiniteRepeatable(tween(4000, easing = LinearEasing)), label = "grid")
    val stars = remember {
        val r = Random(2100)
        List(90) { Triple(r.nextFloat(), r.nextFloat(), r.nextFloat()) }
    }
    Box(
        Modifier
            .fillMaxSize()
            .background(C.Void)
            .drawBehind {
                val a = phase * 2 * Math.PI.toFloat()
                aurora(C.Violet, Offset(size.width * (0.2f + 0.15f * sin(a)), size.height * (0.12f + 0.05f * cos(a))), size.width * 0.9f, 0.32f)
                aurora(C.Cyan, Offset(size.width * (0.9f + 0.1f * cos(a)), size.height * (0.38f + 0.08f * sin(a))), size.width * 0.8f, 0.18f)
                aurora(C.Magenta, Offset(size.width * (0.1f + 0.1f * cos(a + 1f)), size.height * (0.85f + 0.04f * sin(a))), size.width * 0.9f, 0.16f)
                stars.forEach { (x, y, z) ->
                    val twinkle = 0.35f + 0.65f * ((sin(a * 3 + z * 20) + 1) / 2)
                    drawCircle(Color.White.copy(alpha = 0.10f + 0.35f * z * twinkle), 0.6f + z * 1.4f, Offset(x * size.width, y * size.height))
                }
                perspectiveGrid(gridShift)
            },
        content = content,
    )
}

private fun DrawScope.aurora(color: Color, center: Offset, radius: Float, alpha: Float) {
    drawCircle(Brush.radialGradient(listOf(color.copy(alpha = alpha), Color.Transparent), center, radius), radius, center)
}

/** Suelo de rejilla tipo horizonte que avanza hacia el usuario. */
private fun DrawScope.perspectiveGrid(shift: Float) {
    val horizon = size.height * 0.72f
    val bottom = size.height
    val vanishX = size.width / 2
    val line = C.Cyan.copy(alpha = 0.10f)
    for (i in -10..10) {
        val x = vanishX + i * size.width / 6
        drawLine(line, Offset(vanishX + i * 6f, horizon), Offset(x, bottom), 1f)
    }
    for (i in 0 until 10) {
        val p = ((i + shift) / 10f)
        val y = horizon + (bottom - horizon) * p * p
        drawLine(C.Cyan.copy(alpha = 0.03f + 0.10f * p), Offset(0f, y), Offset(size.width, y), 1f)
    }
}

// ======================================================================= Gráficos

data class Slice(val label: String, val value: Double, val color: Color)

private fun DrawScope.glowArc(color: Color, start: Float, sweep: Float, stroke: Float, blur: Float, inset: Float, arc: Size) {
    drawIntoCanvas { canvas ->
        val p = Paint().asFrameworkPaint().apply {
            isAntiAlias = true
            style = android.graphics.Paint.Style.STROKE
            strokeWidth = stroke
            this.color = color.copy(alpha = 0.55f).toArgb()
            maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
        }
        canvas.nativeCanvas.drawArc(inset, inset, inset + arc.width, inset + arc.height, start, sweep, false, p)
    }
}

/**
 * "Reactor": anillo segmentado con resplandor, marcas giratorias y animación de entrada.
 * Tocar un sector lo ilumina y muestra su detalle en el centro; tocarlo otra vez lo suelta.
 */
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
        appear.animateTo(1f, tween(1200, easing = FastOutSlowInEasing))
    }
    val t = rememberInfiniteTransition(label = "reactor")
    val spin by t.animateFloat(0f, 360f, infiniteRepeatable(tween(24000, easing = LinearEasing)), label = "spin")
    val pulse by t.animateFloat(0.4f, 1f, infiniteRepeatable(tween(1800), RepeatMode.Reverse), label = "pulse")
    val dim by animateFloatAsState(if (selected != null) 1f else 0f, spring(stiffness = 300f), label = "dim")
    val emph = slices.indices.map { i ->
        animateFloatAsState(if (selected == i) 1f else 0f, spring(dampingRatio = 0.5f, stiffness = 300f), label = "emph$i").value
    }
    val haptic = LocalHapticFeedback.current

    Box(modifier.size(230.dp), contentAlignment = Alignment.Center) {
        Canvas(
            Modifier
                .size(230.dp)
                .pointerInput(slices) {
                    detectTapGestures { pos ->
                        val dx = pos.x - size.width / 2f
                        val dy = pos.y - size.height / 2f
                        val dist = kotlin.math.sqrt(dx * dx + dy * dy)
                        val ringR = size.width / 2f - 26.dp.toPx() - 11.dp.toPx()
                        if (kotlin.math.abs(dist - ringR) > 26.dp.toPx() || slices.isEmpty()) {
                            onSelect(null); return@detectTapGestures
                        }
                        val ang = ((Math.toDegrees(kotlin.math.atan2(dy, dx).toDouble()) + 90 + 360) % 360).toFloat()
                        var acc = 0f
                        val idx = slices.indexOfFirst { sl -> acc += (sl.value / total * 360f).toFloat(); ang <= acc }
                            .takeIf { it >= 0 } ?: slices.lastIndex
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelect(if (idx == selected) null else idx)
                    }
                }
        ) {
            val c = center
            val outer = size.minDimension / 2
            // Marcas exteriores giratorias
            rotate(spin, c) {
                for (i in 0 until 72) {
                    val ang = Math.toRadians(i * 5.0).toFloat()
                    val len = if (i % 6 == 0) 10f else 4f
                    val r1 = outer - 2f
                    drawLine(
                        C.Cyan.copy(alpha = if (i % 6 == 0) 0.6f else 0.22f),
                        Offset(c.x + cos(ang) * r1, c.y + sin(ang) * r1),
                        Offset(c.x + cos(ang) * (r1 - len), c.y + sin(ang) * (r1 - len)), 2f,
                    )
                }
            }
            // Contra-rotación: arco discontinuo interior
            rotate(-spin * 2, c) {
                drawArc(C.Magenta.copy(alpha = 0.35f), 0f, 70f, false, Offset(outer * 0.28f + c.x - outer, outer * 0.28f + c.y - outer),
                    Size(outer * 2 * 0.72f, outer * 2 * 0.72f), style = Stroke(2f))
                drawArc(C.Cyan.copy(alpha = 0.35f), 180f, 40f, false, Offset(outer * 0.28f + c.x - outer, outer * 0.28f + c.y - outer),
                    Size(outer * 2 * 0.72f, outer * 2 * 0.72f), style = Stroke(2f))
            }
            val stroke = 22.dp.toPx()
            val inset = 26.dp.toPx()
            val arc = Size(size.width - inset * 2, size.height - inset * 2)
            drawArc(C.Track, 0f, 360f, false, Offset(inset, inset), arc, style = Stroke(stroke))
            val gap = if (slices.size > 1) 2.5f else 0f
            var start = -90f
            slices.forEachIndexed { i, s ->
                val sweep = (s.value / total * 360f).toFloat() * appear.value
                val visible = (sweep - gap).coerceAtLeast(0.8f)
                val e = emph.getOrElse(i) { 0f }
                val alpha = 1f - 0.6f * dim * (1f - e)
                val w = stroke + 12.dp.toPx() * e
                val col = s.color.copy(alpha = alpha)
                glowArc(col, start + gap / 2, visible, w, 18f * pulse + 6f + 14f * e, inset, arc)
                drawArc(col, start + gap / 2, visible, false, Offset(inset, inset), arc, style = Stroke(w, cap = StrokeCap.Butt))
                drawArc(Color.White.copy(alpha = 0.35f * alpha), start + gap / 2, visible, false, Offset(inset + w / 2 - 1.5f, inset + w / 2 - 1.5f),
                    Size(arc.width - w + 3f, arc.height - w + 3f), style = Stroke(1.5f))
                start += sweep
            }
            drawCircle(C.Violet.copy(alpha = 0.35f), outer - inset - stroke - 10.dp.toPx(), c, style = Stroke(1f))
        }
        AnimatedContent(
            targetState = selected?.takeIf { it in slices.indices },
            transitionSpec = {
                (fadeIn(tween(220)) + scaleIn(initialScale = 0.8f)) togetherWith (fadeOut(tween(150)) + scaleOut(targetScale = 1.15f))
            },
            label = "center",
        ) { sel ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                if (sel == null) {
                    GlowText(centerTop, C.Text, 19.sp)
                    Text(centerBottom, color = C.Cyan.copy(alpha = 0.8f), fontFamily = Mono, fontSize = 10.sp, letterSpacing = 3.sp)
                } else {
                    val s = slices[sel]
                    Text(s.label.uppercase(esLocale), color = s.color, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 2.sp, maxLines = 1)
                    GlowText(euros(s.value, hide = hide), s.color, 19.sp)
                    Text("${(s.value / total * 100).roundToInt()}% DEL TOTAL", color = C.Muted, fontFamily = Mono, fontSize = 9.sp, letterSpacing = 2.sp)
                }
            }
        }
    }
}

/** Barra de categoría: línea de neón con punto luminoso al final. */
@Composable
fun CategoryBar(
    name: String, amount: Double, pct: Int, color: Color, hide: Boolean,
    selected: Boolean = false, dimmed: Boolean = false, onClick: () -> Unit = {},
) {
    val glow by animateFloatAsState(if (selected) 1f else 0f, tween(300), label = "glow")
    val fade by animateFloatAsState(if (dimmed) 0.4f else 1f, tween(300), label = "fade")
    val preview = LocalInspectionMode.current
    val grow = remember { Animatable(if (preview) pct / 100f else 0f) }
    LaunchedEffect(pct) { grow.animateTo(pct / 100f, tween(1000, easing = FastOutSlowInEasing)) }
    Column(
        Modifier
            .fillMaxWidth()
            .graphicsLayer { alpha = fade }
            .clip(CutCornerShape(topStart = 10.dp, bottomEnd = 10.dp))
            .background(color.copy(alpha = 0.12f * glow))
            .bounceClick(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CutCornerShape(50)).background(color))
            Text(name, color = C.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 10.dp).weight(1f))
            Text(euros(amount, hide = hide), color = C.Text, fontFamily = Mono, fontSize = 13.sp)
            Text("${pct}%", color = color, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.width(48.dp).padding(start = 10.dp))
        }
        Spacer(Modifier.height(8.dp))
        Canvas(Modifier.fillMaxWidth().height(10.dp)) {
            val y = size.height / 2
            drawLine(C.Track, Offset(0f, y), Offset(size.width, y), 3f)
            val end = (size.width * grow.value).coerceAtLeast(6f)
            drawLine(Brush.horizontalGradient(listOf(color.copy(alpha = 0.15f), color), 0f, end), Offset(0f, y), Offset(end, y), 3f, StrokeCap.Round)
            drawCircle(color.copy(alpha = 0.35f), 9f, Offset(end, y))
            drawCircle(color, 4f, Offset(end, y))
        }
    }
}

// ======================================================================= Filas y controles

@Composable
fun MovementRow(m: Movement, hide: Boolean, onClick: () -> Unit) {
    val cat = Categories.byName(m.category)
    val color = Color(cat.color)
    Row(
        Modifier.fillMaxWidth().bounceClick(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(46.dp)
                .clip(CutCornerShape(30))
                .background(Brush.linearGradient(listOf(color.copy(alpha = 0.30f), color.copy(alpha = 0.05f))))
                .border(1.dp, color.copy(alpha = 0.6f), CutCornerShape(30)),
            contentAlignment = Alignment.Center,
        ) { Text(cat.emoji, fontSize = 20.sp) }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(m.merchant, color = C.Text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                (relativeDay(m.timestamp) + " · " + m.category + if (m.sourceApp != null) " · auto" else "").uppercase(esLocale),
                color = C.Muted, fontFamily = Mono, fontSize = 10.sp, letterSpacing = 1.sp, maxLines = 1,
            )
        }
        Text(
            euros(if (m.isIncome) m.amount else -m.amount, signed = true, hide = hide),
            color = if (m.isIncome) C.Income else C.Text,
            fontFamily = Mono, fontSize = 15.sp, fontWeight = FontWeight.Bold,
        )
    }
}

/** Chip con esquinas cortadas; seleccionado = relleno holográfico. */
@Composable
fun Pill(label: String, selected: Boolean, onClick: () -> Unit) {
    val shape = CutCornerShape(topStart = 10.dp, bottomEnd = 10.dp)
    val on by animateFloatAsState(if (selected) 1f else 0f, tween(260), label = "pill")
    Box(
        Modifier
            .bounceClick(onClick = onClick)
            .clip(shape)
            .background(C.Glass)
            .border(1.dp, C.Line, shape)
            .drawBehind { drawRect(C.holo, alpha = on) }
            .padding(horizontal = 16.dp, vertical = 9.dp),
    ) {
        Text(
            label.uppercase(esLocale), color = lerp(C.Muted, C.Void, on), fontFamily = Mono,
            fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 1.5.sp,
        )
    }
}

/** Botón de acción principal en forma de rombo con pulso de luz. */
@Composable
fun DiamondButton(onClick: () -> Unit, content: @Composable BoxScope.() -> Unit) {
    val t = rememberInfiniteTransition(label = "fab")
    val pulse by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2200, easing = LinearEasing)), label = "pulse")
    val turn by t.animateFloat(0f, 360f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "turn")
    val burst = remember { Animatable(1f) }
    val spinIn = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val particles = remember { List(18) { i -> Triple(i * 20f + Random.nextFloat() * 12f, 0.7f + Random.nextFloat() * 0.6f, if (i % 2 == 0) C.Cyan else C.Magenta) } }
    Box(Modifier.size(96.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(96.dp)) {
            val r = size.minDimension / 2 * (0.55f + 0.45f * pulse)
            drawCircle(C.Cyan.copy(alpha = 0.35f * (1 - pulse)), r, style = Stroke(2f))
            // Órbita discontinua
            rotate(turn) {
                drawArc(C.holoSoft, 0f, 80f, false, Offset(8f, 8f), Size(size.width - 16f, size.height - 16f), style = Stroke(1.5f))
                drawArc(C.holoSoft, 180f, 80f, false, Offset(8f, 8f), Size(size.width - 16f, size.height - 16f), style = Stroke(1.5f))
            }
            // Partículas al pulsar
            if (burst.value < 1f) {
                val b = burst.value
                particles.forEach { (deg, speed, col) ->
                    val a = Math.toRadians(deg.toDouble())
                    val d = size.minDimension / 2 * (0.3f + 0.9f * b * speed)
                    drawCircle(col.copy(alpha = 1f - b), 3.5f * (1f - b) + 1f,
                        Offset(center.x + (d * cos(a)).toFloat(), center.y + (d * sin(a)).toFloat()))
                }
                drawCircle(Color.White.copy(alpha = 0.5f * (1f - b)), size.minDimension / 2 * (0.4f + 0.6f * b), style = Stroke(3f * (1 - b)))
            }
        }
        Box(
            Modifier
                .size(58.dp)
                .graphicsLayer { rotationZ = 45f + spinIn.value * 180f }
                .clip(CutCornerShape(14))
                .background(C.holo)
                .bounceClick {
                    scope.launch {
                        launch { burst.snapTo(0f); burst.animateTo(1f, tween(650, easing = FastOutSlowInEasing)) }
                        launch { spinIn.snapTo(0f); spinIn.animateTo(1f, tween(500, easing = FastOutSlowInEasing)) }
                    }
                    onClick()
                },
            contentAlignment = Alignment.Center,
        ) { Box(Modifier.graphicsLayer { rotationZ = -45f - spinIn.value * 180f }, contentAlignment = Alignment.Center, content = content) }
    }
}

@Composable
fun holoFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = C.Cyan, unfocusedBorderColor = C.Line,
    focusedLabelColor = C.Cyan, unfocusedLabelColor = C.Muted,
    cursorColor = C.Cyan, focusedTextColor = C.Text, unfocusedTextColor = C.Text,
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

    val parsedAmount = NotificationParser.parseNumber(amount.trim())
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Deep,
        shape = chamfer(22.dp),
        modifier = Modifier.border(1.dp, C.holoSoft, chamfer(22.dp)),
        title = {
            Column {
                HudLabel(if (initial == null) "nueva entrada" else "editar registro", C.Cyan)
                Text(if (initial == null) "Movimiento" else initial.merchant, color = C.Text, fontFamily = Display, fontSize = 20.sp)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Gasto", !isIncome) { isIncome = false; if (category == Categories.INCOME) category = Categories.OTHER }
                    Pill("Ingreso", isIncome) { isIncome = true; category = Categories.INCOME }
                }
                OutlinedTextField(
                    value = amount, onValueChange = { amount = it }, label = { Text("Importe (€)") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = TextStyle(fontFamily = Mono, fontSize = 18.sp), colors = holoFieldColors(),
                )
                OutlinedTextField(
                    value = merchant, onValueChange = { merchant = it }, label = { Text("Concepto / comercio") },
                    singleLine = true, colors = holoFieldColors(),
                )
                if (!isIncome) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Categories.expenseNames.forEach { name ->
                            val c = Categories.byName(name)
                            val sel = category == name
                            val shape = CutCornerShape(topStart = 8.dp, bottomEnd = 8.dp)
                            Text(
                                "${c.emoji} $name",
                                color = if (sel) C.Text else C.Muted, fontSize = 13.sp,
                                modifier = Modifier
                                    .clip(shape)
                                    .background(if (sel) Color(c.color).copy(alpha = 0.28f) else C.Glass)
                                    .border(1.dp, if (sel) Color(c.color) else C.Line, shape)
                                    .clickable { category = name }
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                            )
                        }
                    }
                }
                initial?.rawText?.let {
                    HudLabel("señal original")
                    Text(it, color = C.Muted, fontFamily = Mono, fontSize = 11.sp)
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
                            category = if (isIncome) Categories.INCOME else category,
                        )
                    )
                },
            ) { Text("GUARDAR", color = C.Cyan, fontFamily = Mono, fontWeight = FontWeight.Bold, letterSpacing = 2.sp) }
        },
        dismissButton = {
            Row {
                if (initial != null && onDelete != null) {
                    TextButton(onClick = { onDelete(initial) }) { Text("BORRAR", color = C.Expense, fontFamily = Mono, letterSpacing = 2.sp) }
                }
                TextButton(onClick = onDismiss) { Text("CANCELAR", color = C.Muted, fontFamily = Mono, letterSpacing = 2.sp) }
            }
        },
    )
}

/** Punto "en directo" que late. */
@Composable
fun LiveDot(color: Color = C.Income) {
    val t = rememberInfiniteTransition(label = "live")
    val a by t.animateFloat(0.25f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a")
    Box(Modifier.size(14.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(14.dp).clip(CircleShape).background(color.copy(alpha = 0.25f * a)))
        Box(Modifier.size(6.dp).clip(CircleShape).background(color.copy(alpha = 0.5f + 0.5f * a)))
    }
}
