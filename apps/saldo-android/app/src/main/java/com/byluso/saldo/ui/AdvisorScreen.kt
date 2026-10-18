package com.byluso.saldo.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.advisor.Analysis
import com.byluso.saldo.advisor.BudgetGroup
import com.byluso.saldo.advisor.FinanceAdvisor
import com.byluso.saldo.advisor.GroupAnalysis
import com.byluso.saldo.advisor.IncomeSource
import com.byluso.saldo.advisor.Period
import com.byluso.saldo.advisor.Tip
import com.byluso.saldo.advisor.Tips
import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.NotificationParser
import java.text.Normalizer
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

private fun pct(v: Double) = "${v.roundToInt()} %"

@Composable
fun AdvisorScreen(
    movements: List<Movement>,
    balance: Double?,
    salary: Double?,
    onSetSalary: (Double?) -> Unit,
    hide: Boolean,
    listState: LazyListState = rememberLazyListState(),
) {
    var period by rememberSaveable { mutableStateOf(Period.LAST_30) }
    var selected by remember { mutableStateOf<BudgetGroup?>(null) }
    var editingSalary by remember { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var topic by rememberSaveable { mutableStateOf<String?>(null) }
    var expandedTip by remember { mutableStateOf<String?>(null) }

    val a = remember(movements, period, salary, balance) { FinanceAdvisor.analyze(movements, period, salary, balance) }
    val personal = remember(a) { Tips.personal(a) }
    val allTips = personal + Tips.general
    val needle = remember(query) { normalize(query) }
    val shown = allTips.filter { t ->
        (topic == null || (topic == PARA_TI && t.personal) || t.topic == topic) &&
            (needle.isEmpty() || normalize(t.title + " " + t.body + " " + t.topic).contains(needle))
    }

    LazyColumn(state = listState) {
        item { ScreenTitle("tu economía de un vistazo", "Asesor") }
        item {
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) { Period.entries.forEach { p -> Pill(p.label, period == p) { period = p } } }
        }
        item { SalaryCard(a, hide, Modifier.padding(16.dp).enterStagger(1)) { editingSalary = true } }

        if (a.income > 0) {
            item { ScoreCard(a, Modifier.padding(horizontal = 16.dp).enterStagger(2)) }
            item {
                SectionCard(Modifier.padding(16.dp).enterStagger(3)) {
                    HudLabel("reparto de tu sueldo", C.Cyan)
                    Text("Exterior: lo recomendado · Interior: lo que gastas", color = C.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
                    Spacer(Modifier.height(12.dp))
                    DualReactor(a, selected, { selected = it }, hide, Modifier.align(Alignment.CenterHorizontally))
                    Text(
                        "Toca el gráfico o una partida para ver el detalle", color = C.Muted.copy(alpha = 0.6f), fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp, bottom = 8.dp),
                    )
                    a.groups.forEach { g ->
                        GroupRow(g, a, hide, selected == g.group, selected != null && selected != g.group) {
                            selected = if (selected == g.group) null else g.group
                        }
                    }
                }
            }
            item { SavingsCard(a, hide, Modifier.padding(horizontal = 16.dp).enterStagger(4)) }
            item { AffordCard(a, hide, Modifier.padding(16.dp).enterStagger(5)) }
        }

        // ---- Consejos con buscador
        item {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp)) {
                HudLabel("consejos · ${shown.size} de ${allTips.size}", C.Cyan)
                Text("Mejora tu economía", color = C.Text, fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    query, { query = it }, Modifier.fillMaxWidth(), singleLine = true,
                    placeholder = { Text("Buscar: hipoteca, coche, ahorro…", fontSize = 14.sp) },
                    leadingIcon = { Icon(Icons.Filled.Search, null, tint = C.Cyan) },
                    trailingIcon = {
                        if (query.isNotEmpty()) Icon(Icons.Filled.Close, "Borrar", tint = C.Muted, modifier = Modifier.bounceClick { query = "" })
                    },
                    colors = holoFieldColors(), shape = CutCornerShape(topStart = 12.dp, bottomEnd = 12.dp),
                )
            }
        }
        item {
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Pill("Todos", topic == null) { topic = null }
                Pill("★ Para ti", topic == PARA_TI) { topic = PARA_TI }
                Tips.topics.forEach { t -> Pill(t, topic == t) { topic = if (topic == t) null else t } }
            }
        }
        if (shown.isEmpty()) item {
            Text("Sin resultados para \"$query\".", color = C.Muted, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.padding(20.dp))
        }
        items(shown, key = { it.id }) { t ->
            TipCard(t, expandedTip == t.id, hide, Modifier.padding(horizontal = 16.dp, vertical = 5.dp).animateItem()) {
                expandedTip = if (expandedTip == t.id) null else t.id
            }
        }
        item {
            Text(
                "Cálculos orientativos basados en la regla 50/30/20 y en supuestos generales (hipoteca al ${(FinanceAdvisor.MORTGAGE_RATE * 100).roundToInt()} % a ${FinanceAdvisor.MORTGAGE_YEARS} años con el ${(FinanceAdvisor.MORTGAGE_LTV * 100).roundToInt()} % financiado). No es asesoramiento financiero profesional.",
                color = C.Muted, fontSize = 11.sp, modifier = Modifier.padding(20.dp),
            )
            Spacer(Modifier.height(120.dp))
        }
    }

    if (editingSalary) SalaryDialog(salary ?: a.income.takeIf { it > 0 }, onDismiss = { editingSalary = false }) {
        onSetSalary(it); editingSalary = false
    }
}

private const val PARA_TI = "__para_ti__"

private fun normalize(s: String): String =
    Normalizer.normalize(s.lowercase(esLocale), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").trim()

// ================================================================== Sueldo

@Composable
private fun SalaryCard(a: Analysis, hide: Boolean, modifier: Modifier, onEdit: () -> Unit) {
    val shown = rememberCountUp(a.income)
    Row(
        modifier
            .fillMaxWidth()
            .holoPanel(18.dp)
            .bounceClick(onClick = onEdit)
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            HudLabel("sueldo neto mensual", C.Cyan)
            if (a.income > 0) GlowText(euros(shown, hide = hide), C.Text, 26.sp)
            else Text("Toca para indicarlo", color = C.Accent, fontWeight = FontWeight.Medium, fontSize = 17.sp)
            Text(
                when (a.incomeSource) {
                    IncomeSource.MANUAL -> "indicado por ti · toca para cambiar"
                    IncomeSource.DETECTED -> "detectado en tus ingresos · toca para ajustar"
                    IncomeSource.NONE -> "sin ingresos en este periodo"
                },
                color = C.Muted, fontFamily = Mono, fontSize = 12.sp,
            )
        }
        Text("Editar", color = C.Accent, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SalaryDialog(current: Double?, onDismiss: () -> Unit, onSave: (Double?) -> Unit) {
    var text by remember { mutableStateOf(current?.let { euros(it).removeSuffix(" €") } ?: "") }
    val value = NotificationParser.parseNumber(text.trim())
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Deep,
        shape = chamfer(22.dp),
        modifier = Modifier.border(1.dp, C.holoSoft, chamfer(22.dp)),
        title = {
            Column {
                HudLabel("sueldo", C.Cyan)
                Text("Sueldo neto mensual", color = C.Text, fontFamily = Display, fontSize = 18.sp)
            }
        },
        text = {
            Column {
                Text("Lo que cobras al mes en tu cuenta, después de impuestos. Si tienes pagas extra prorrateadas, inclúyelas.", color = C.Muted, fontSize = 13.sp)
                OutlinedTextField(
                    text, { text = it }, singleLine = true, label = { Text("€ al mes") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = TextStyle(fontFamily = Mono, fontSize = 20.sp), colors = holoFieldColors(),
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        },
        confirmButton = {
            TextButton(enabled = value != null && value > 0, onClick = { onSave(value) }) {
                Text("Guardar", color = C.Cyan, fontFamily = Mono, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            Row {
                TextButton(onClick = { onSave(null) }) { Text("Detectar", color = C.Muted, fontFamily = Mono) }
                TextButton(onClick = onDismiss) { Text("Cancelar", color = C.Muted, fontFamily = Mono) }
            }
        },
    )
}

// ================================================================== Puntuación

@Composable
private fun ScoreCard(a: Analysis, modifier: Modifier) {
    val score = a.score ?: return
    val preview = LocalInspectionMode.current
    val fill = remember { Animatable(if (preview) score / 100f else 0f) }
    LaunchedEffect(score) { fill.animateTo(score / 100f, tween(1400, easing = FastOutSlowInEasing)) }
    val color = when {
        score >= 80 -> C.Income
        score >= 60 -> C.Accent
        score >= 40 -> C.Magenta
        else -> C.Expense
    }
    Row(modifier.fillMaxWidth().holoPanel(18.dp).padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(120.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(120.dp)) {
                val stroke = 12.dp.toPx()
                val inset = stroke / 2 + 4.dp.toPx()
                val arc = Size(size.width - inset * 2, size.height - inset * 2)
                drawArc(C.Track, 150f, 240f, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
                val sweep = 240f * fill.value
                drawArc(color, 150f, sweep, false, Offset(inset, inset), arc, style = Stroke(stroke, cap = StrokeCap.Round))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                GlowText("${(fill.value * 100).roundToInt()}", color, 30.sp)
                Text("de 100", color = C.Muted, fontSize = 11.sp)
            }
        }
        Column(Modifier.padding(start = 16.dp).weight(1f)) {
            HudLabel("salud financiera")
            Text(FinanceAdvisor.scoreLabel(score), color = C.Text, fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
            Text(
                "Ahorras el ${pct(max(0.0, a.savingsPct))} de tu sueldo. " +
                    (a.monthsCovered?.let { "Tu saldo cubre ${"%.1f".format(esLocale, it)} meses de gastos." } ?: ""),
                color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

// ================================================================== Rueda doble

/**
 * Dos anillos concéntricos: el exterior es el reparto recomendado y el interior el real.
 * Se dibujan con animación de entrada, resplandor que late, marcas giratorias y una partícula
 * en órbita. Tocar un sector lo destaca y muestra la comparación en el centro.
 */
@Composable
private fun DualReactor(a: Analysis, selected: BudgetGroup?, onSelect: (BudgetGroup?) -> Unit, hide: Boolean, modifier: Modifier) {
    val preview = LocalInspectionMode.current
    val outerIn = remember { Animatable(if (preview) 1f else 0f) }
    val innerIn = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(a.income, a.expenses, a.period) {
        if (preview) return@LaunchedEffect
        outerIn.snapTo(0f); innerIn.snapTo(0f)
        outerIn.animateTo(1f, tween(1000, easing = FastOutSlowInEasing))
    }
    LaunchedEffect(a.income, a.expenses, a.period, "inner") {
        if (preview) return@LaunchedEffect
        kotlinx.coroutines.delay(350)
        innerIn.animateTo(1f, tween(1200, easing = FastOutSlowInEasing))
    }
    val pulse = 0f
    val dim by animateFloatAsState(if (selected != null) 1f else 0f, spring(stiffness = 300f), label = "dim")
    val haptic = LocalHapticFeedback.current

    // Interior: lo real sobre el sueldo (o sobre el gasto si gastas más de lo que ingresas)
    val innerTotal = max(a.income, a.expenses)
    val outer = a.groups.map { it.group to it.recommendedPct / 100.0 }
    val inner = a.groups.map { it.group to (if (innerTotal > 0) it.actual / innerTotal else 0.0) }
    val deficit = a.expenses > a.income

    fun groupAt(list: List<Pair<BudgetGroup, Double>>, angle: Float): BudgetGroup? {
        var acc = 0.0
        list.forEach { (g, f) -> acc += f * 360; if (angle <= acc) return g }
        return null
    }

    Box(modifier.size(280.dp), contentAlignment = Alignment.Center) {
        Canvas(
            Modifier.size(280.dp).pointerInput(a) {
                detectTapGestures { pos ->
                    val dx = pos.x - size.width / 2f
                    val dy = pos.y - size.height / 2f
                    val dist = sqrt(dx * dx + dy * dy)
                    val outerR = size.width / 2f - 30.dp.toPx()
                    val innerR = outerR - 34.dp.toPx()
                    if (dist < innerR - 24.dp.toPx() || dist > outerR + 20.dp.toPx()) { onSelect(null); return@detectTapGestures }
                    val ang = ((Math.toDegrees(atan2(dy, dx).toDouble()) + 90 + 360) % 360).toFloat()
                    val g = if (kotlin.math.abs(dist - innerR) < kotlin.math.abs(dist - outerR)) groupAt(inner, ang) else groupAt(outer, ang)
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onSelect(if (g == selected) null else g)
                }
            }
        ) {
            val c = center
            val R = size.minDimension / 2
            val outerR = R - 30.dp.toPx()
            val innerR = outerR - 34.dp.toPx()
            ring(outer, outerR, 16.dp.toPx(), outerIn.value, selected, dim, pulse, alphaBase = 0.75f)
            ring(inner, innerR, 22.dp.toPx(), innerIn.value, selected, dim, pulse, alphaBase = 1f)
            if (deficit) {
                drawCircle(C.Expense.copy(alpha = 0.5f), innerR - 18.dp.toPx(), c, style = Stroke(1.5f))
            }
        }
        AnimatedContent(
            targetState = selected,
            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(120)) },
            label = "dualCenter",
        ) { sel ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(130.dp)) {
                if (sel == null) {
                    val sp = max(0.0, a.savingsPct)
                    Text(if (deficit) "Déficit" else "Ahorro", color = C.Muted, fontSize = 12.sp)
                    GlowText(if (deficit) pct(a.pctOfIncome(a.expenses - a.income)) else pct(sp), if (deficit) C.Expense else C.Text, 26.sp)
                    Text(euros(a.savings, signed = true, hide = hide), color = C.Muted, fontSize = 13.sp)
                    Text("Ideal: 20 %", color = C.Muted, fontSize = 11.sp)
                } else {
                    val g = a.groups.first { it.group == sel }
                    val col = Color(sel.color)
                    Text("${sel.emoji} ${sel.label}", color = C.Muted, fontSize = 12.sp, textAlign = TextAlign.Center, maxLines = 2)
                    GlowText(pct(a.pctOfIncome(g.actual)), C.Text, 24.sp)
                    Text(euros(g.actual, hide = hide), color = C.Muted, fontSize = 13.sp)
                    Text("Ideal: ${sel.recommendedPct} % · ${euros(g.recommended, hide = hide)}", color = C.Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

private fun DrawScope.ring(
    parts: List<Pair<BudgetGroup, Double>>,
    radius: Float,
    stroke: Float,
    appear: Float,
    selected: BudgetGroup?,
    dim: Float,
    pulse: Float,
    alphaBase: Float,
) {
    val c = center
    val topLeft = Offset(c.x - radius, c.y - radius)
    val size = Size(radius * 2, radius * 2)
    drawCircle(C.Track, radius, c, style = Stroke(stroke))
    var start = -90f
    val gap = 2f
    parts.forEach { (g, f) ->
        val sweep = (f * 360).toFloat() * appear
        if (sweep > 0.3f) {
            val isSel = g == selected
            val alpha = alphaBase * (1f - 0.65f * dim * if (isSel) 0f else 1f)
            val w = if (isSel) stroke * 1.45f else stroke
            val col = Color(g.color)
            drawArc(col.copy(alpha = 0.22f * alpha * pulse), start + gap / 2, (sweep - gap).coerceAtLeast(0.3f), false, topLeft, size, style = Stroke(w * 2f))
            drawArc(col.copy(alpha = alpha), start + gap / 2, (sweep - gap).coerceAtLeast(0.3f), false, topLeft, size, style = Stroke(w))
            drawArc(Color.White.copy(alpha = 0.3f * alpha), start + gap / 2, (sweep - gap).coerceAtLeast(0.3f), false,
                Offset(topLeft.x + w / 2 - 1, topLeft.y + w / 2 - 1), Size(size.width - w + 2, size.height - w + 2), style = Stroke(1.2f))
        }
        start += sweep
    }
}

// ================================================================== Partidas

@Composable
private fun GroupRow(g: GroupAnalysis, a: Analysis, hide: Boolean, selected: Boolean, dimmed: Boolean, onClick: () -> Unit) {
    val col = Color(g.group.color)
    val isSavings = g.group == BudgetGroup.SAVINGS
    val actualPct = a.pctOfIncome(g.actual)
    val glow by animateFloatAsState(if (selected) 1f else 0f, tween(300), label = "glow")
    val fade by animateFloatAsState(if (dimmed) 0.45f else 1f, tween(300), label = "fade")
    val preview = LocalInspectionMode.current
    val grow = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(g.actual, g.recommended) {
        if (preview) return@LaunchedEffect
        grow.snapTo(0f); grow.animateTo(1f, tween(1000, easing = FastOutSlowInEasing))
    }
    val good = !g.over

    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .clip(CutCornerShape(topStart = 10.dp, bottomEnd = 10.dp))
            .background(col.copy(alpha = 0.10f * glow + 0.03f))
            .bounceClick(onClick = onClick)
            .animateContentSize()
            .padding(horizontal = 10.dp, vertical = 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.graphicsAlpha(fade)) {
            Text(g.group.emoji, fontSize = 18.sp)
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Text(g.group.label, color = C.Text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(
                    "Real ${pct(actualPct)} · ideal ${g.group.recommendedPct} %", color = C.Muted, fontFamily = Mono,
                    fontSize = 12.sp, maxLines = 1,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(euros(g.actual, hide = hide), color = C.Text, fontFamily = Mono, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text("/ ${euros(g.recommended, hide = hide)}", color = C.Muted, fontFamily = Mono, fontSize = 12.sp, maxLines = 1)
            }
        }
        Spacer(Modifier.height(7.dp))
        // Barra: relleno = real; marca blanca = ideal; exceso en rojo
        Canvas(Modifier.fillMaxWidth().height(10.dp).graphicsAlpha(fade)) {
            val scale = max(g.recommended, g.actual).let { if (it <= 0) 1.0 else it * 1.15 }
            val y = size.height / 2
            drawLine(C.Track, Offset(0f, y), Offset(size.width, y), 4f, StrokeCap.Round)
            val idealX = (g.recommended / scale * size.width).toFloat()
            val actX = (g.actual / scale * size.width).toFloat() * grow.value
            val normal = if (isSavings) actX else minOf(actX, idealX)
            drawLine(col, Offset(0f, y), Offset(max(normal, 1f), y), 4f, StrokeCap.Round)
            if (!isSavings && actX > idealX) drawLine(C.Expense, Offset(idealX, y), Offset(actX, y), 4f, StrokeCap.Round)
            drawLine(C.Muted, Offset(idealX, 0f), Offset(idealX, size.height), 2f)
        }
        AnimatedVisibility(selected, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            Column(Modifier.padding(top = 8.dp)) {
                Text(g.group.hint, color = C.Muted, fontSize = 12.sp)
                val d = g.delta
                Text(
                    when {
                        isSavings && g.over -> "Te faltan ${euros(-d, hide = hide)} al mes para llegar al 20 %."
                        isSavings -> "Ahorras ${euros(d, hide = hide)} más de lo recomendado. ¡Bien!"
                        g.over -> "Te pasas ${euros(d, hide = hide)} al mes (${euros(d * 12, hide = hide)} al año)."
                        else -> "Te sobran ${euros(-d, hide = hide)} respecto a lo recomendado."
                    },
                    color = if (g.over) C.Expense else C.Income, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

private fun Modifier.graphicsAlpha(a: Float) = graphicsLayer { alpha = a }

// ================================================================== Ahorro

@Composable
private fun SavingsCard(a: Analysis, hide: Boolean, modifier: Modifier) {
    val rec = a.income * 0.20
    val real = max(0.0, a.savings)
    val cushion = a.emergencyTarget
    val bal = a.balance ?: 0.0
    val preview = LocalInspectionMode.current
    val p = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(real, bal) {
        if (preview) return@LaunchedEffect
        p.snapTo(0f); p.animateTo(1f, tween(1200, easing = FastOutSlowInEasing))
    }
    Column(modifier.fillMaxWidth().holoPanel(18.dp).padding(18.dp)) {
        HudLabel("ahorro", C.Income)
        Row(Modifier.padding(top = 8.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Deberías ahorrar", color = C.Muted, fontFamily = Mono, fontSize = 12.sp)
                GlowText(euros(rec, hide = hide), C.Income, 18.sp)
                Text("20 % · al mes", color = C.Muted, fontFamily = Mono, fontSize = 12.sp)
            }
            Column(Modifier.weight(1f)) {
                Text("Ahorras", color = C.Muted, fontFamily = Mono, fontSize = 12.sp)
                GlowText(euros(a.savings, hide = hide), if (a.savings >= rec) C.Income else if (a.savings > 0) C.Magenta else C.Expense, 18.sp)
                Text("${pct(a.savingsPct)} · al mes", color = C.Muted, fontFamily = Mono, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        Text("Al año: ${euros(rec * 12, hide = hide)} recomendado · ${euros(a.savings * 12, hide = hide)} a tu ritmo", color = C.Muted, fontSize = 12.sp)
        Spacer(Modifier.height(16.dp))
        HudLabel("colchón de emergencia · 6 meses")
        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.Bottom) {
            Text(euros(bal, hide = hide), color = C.Text, fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text("  /  ${euros(cushion, hide = hide)}", color = C.Muted, fontFamily = Mono, fontSize = 12.sp)
        }
        Canvas(Modifier.fillMaxWidth().height(14.dp).padding(top = 6.dp)) {
            val f = (bal / cushion).coerceIn(0.0, 1.0).toFloat() * p.value
            val y = size.height / 2
            drawLine(C.Track, Offset(0f, y), Offset(size.width, y), 6f, StrokeCap.Round)
            drawLine(Brush.horizontalGradient(listOf(C.Cyan, C.Income)), Offset(0f, y), Offset(size.width * f, y), 6f, StrokeCap.Round)
            for (i in 1..5) drawLine(C.Void, Offset(size.width * i / 6, 0f), Offset(size.width * i / 6, size.height), 2f)
        }
        Text(
            if (bal >= cushion) "Cubierto. Tu saldo aguanta ${a.monthsCovered?.let { "%.1f".format(esLocale, it) } ?: "6+"} meses de gastos."
            else FinanceAdvisor.monthsToReach(cushion - bal, max(rec, a.savings))?.let { "Te faltan ${euros(cushion - bal, hide = hide)}: unos $it meses ahorrando ${euros(max(rec, a.savings), hide = hide)}/mes." }
                ?: "Te faltan ${euros(cushion - bal, hide = hide)}.",
            color = C.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp),
        )
    }
}

// ================================================================== Vivienda y coche

@Composable
private fun AffordCard(a: Analysis, hide: Boolean, modifier: Modifier) {
    Column(modifier.fillMaxWidth().holoPanel(18.dp, fill = C.Cyan.copy(alpha = 0.05f)).padding(18.dp)) {
        HudLabel("¿cuánto te puedes permitir?", C.Cyan)
        Spacer(Modifier.height(12.dp))
        AffordBlock(
            "🏠", "Vivienda", Color(BudgetGroup.HOUSING.color),
            listOf(
                "Alquiler máximo" to "${euros(a.housing.maxRent, hide = hide)}/mes",
                "Cuota de hipoteca máx." to "${euros(a.housing.maxMortgagePayment, hide = hide)}/mes",
                "Precio de vivienda" to "≈ ${euros(a.housing.maxHomePrice, hide = hide)}",
                "Ahorro necesario" to "${euros(a.housing.cashNeeded, hide = hide)} (entrada + gastos)",
            ),
            "Máx. 30 % del sueldo. Hipoteca a ${FinanceAdvisor.MORTGAGE_YEARS} años al ${(FinanceAdvisor.MORTGAGE_RATE * 100).roundToInt()} % TIN, financiando el ${(FinanceAdvisor.MORTGAGE_LTV * 100).roundToInt()} %.",
        )
        Spacer(Modifier.height(14.dp))
        AffordBlock(
            "🚗", "Coche", Color(BudgetGroup.TRANSPORT.color),
            listOf(
                "Precio máximo" to euros(a.car.maxCarPrice, hide = hide),
                "Coste total al mes" to "${euros(a.car.maxMonthlyCost, hide = hide)}/mes",
                "Cuota si lo financias" to "${euros(a.car.maxLoanPayment, hide = hide)}/mes",
            ),
            "Regla 20/4/10: 20 % de entrada, máx. 4 años y todo el coste del coche por debajo del 10 % del sueldo.",
        )
    }
}

@Composable
private fun AffordBlock(emoji: String, title: String, color: Color, rows: List<Pair<String, String>>, note: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(36.dp).clip(CutCornerShape(30)).background(color.copy(alpha = 0.2f)).border(1.dp, color.copy(alpha = 0.6f), CutCornerShape(30)),
            contentAlignment = Alignment.Center,
        ) { Text(emoji, fontSize = 18.sp) }
        Text(title, color = C.Text, fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.padding(start = 10.dp))
    }
    rows.forEach { (k, v) ->
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(k, color = C.Muted, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(v, color = C.Text, fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.End)
        }
    }
    Text(note, color = C.Muted.copy(alpha = 0.8f), fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
}

// ================================================================== Consejos

@Composable
private fun TipCard(t: Tip, expanded: Boolean, hide: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .holoPanel(12.dp, fill = if (t.personal) C.Accent else C.Glass)
            .bounceClick(onClick = onClick)
            .animateContentSize(spring(dampingRatio = 0.8f, stiffness = 400f))
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                (if (t.personal) "Para ti · " else "") + t.topic,
                color = if (t.personal) C.Accent else C.Muted, fontSize = 12.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            t.monthlySaving?.takeIf { it >= 1 }?.let {
                Text(
                    "+${euros(it, hide = hide)}/mes", color = C.Income, fontSize = 12.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(C.Income.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
        Text(t.title, color = C.Text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
        if (expanded) {
            Text(t.body, color = C.Muted, fontSize = 14.sp, modifier = Modifier.padding(top = 6.dp))
            t.source?.let { Text("Fuente: $it", color = C.Muted.copy(alpha = 0.8f), fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp)) }
        } else {
            Text(t.body, color = C.Muted, fontSize = 13.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
        }
    }
}
