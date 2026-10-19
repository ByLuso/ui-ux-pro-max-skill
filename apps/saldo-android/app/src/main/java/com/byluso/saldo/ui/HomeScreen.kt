package com.byluso.saldo.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.data.BalanceAnchor
import com.byluso.saldo.data.Movement
import com.byluso.saldo.advisor.Spending
import com.byluso.saldo.parser.Categories
import java.time.YearMonth
import kotlin.math.roundToInt

/** Cabecera: marca, selector de mes y panel de balance del mes con contador animado. */
@Composable
fun MonthHeader(
    month: YearMonth,
    onMonth: (YearMonth) -> Unit,
    hide: Boolean,
    onToggleHide: () -> Unit,
    monthMovements: List<Movement>,
) {
    // Sin recargas a otras tarjetas ni traspasos al ahorro: solo ingresos y gastos reales
    val income = Spending.incomes(monthMovements).sumOf { it.amount }
    val expense = Spending.expenses(monthMovements).sumOf { it.amount }
    val net = rememberCountUp(income - expense)

    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Saldo", color = C.Text, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, modifier = Modifier.weight(1f))
            HudButton(if (hide) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, "Ocultar importes", onToggleHide)
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            HudButton(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Mes anterior") { onMonth(month.minusMonths(1)) }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                AnimatedContent(
                    targetState = month,
                    transitionSpec = {
                        val dir = if (targetState > initialState) 1 else -1
                        (slideInHorizontally { it / 6 * dir } + fadeIn()) togetherWith (slideOutHorizontally { -it / 6 * dir } + fadeOut())
                    },
                    label = "month",
                ) { m ->
                    Text(
                        monthTitle(m), color = C.Text,
                        fontWeight = FontWeight.Medium, fontSize = 17.sp, textAlign = TextAlign.Center,
                    )
                }
            }
            HudButton(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Mes siguiente") { onMonth(month.plusMonths(1)) }
        }
        Spacer(Modifier.height(16.dp))
        Column(Modifier.fillMaxWidth().holoPanel(22.dp).padding(20.dp)) {
            HudLabel("balance del mes")
            Spacer(Modifier.height(6.dp))
            GlowText(
                rememberScramble(euros(net, signed = true, hide = hide), hide to month),
                color = if (income - expense >= 0) C.Income else C.Expense,
                fontSize = 32.sp,
            )
            Spacer(Modifier.height(16.dp))
            FluxBar(income, expense)
            Spacer(Modifier.height(14.dp))
            Row {
                Stat("ingresos", rememberScramble(euros(income, signed = true, hide = hide), hide to month), C.Income, Modifier.weight(1f))
                Box(Modifier.width(1.dp).height(40.dp).background(C.Line))
                Stat("gastos", rememberScramble(euros(-expense, signed = true, hide = hide), hide to month), C.Expense, Modifier.weight(1f).padding(start = 16.dp))
            }
        }
    }
}

/** Barra de proporción ingresos / gastos. */
@Composable
private fun FluxBar(income: Double, expense: Double) {
    val total = (income + expense).takeIf { it > 0 } ?: 1.0
    val split = (income / total).toFloat()
    Canvas(Modifier.fillMaxWidth().height(6.dp)) {
        val y = size.height / 2
        val mid = size.width * split
        drawLine(C.Track, Offset(0f, y), Offset(size.width, y), size.height, StrokeCap.Round)
        if (income + expense > 0) {
            drawLine(C.Income, Offset(0f, y), Offset(mid, y), size.height, StrokeCap.Round)
            drawLine(C.Expense.copy(alpha = 0.8f), Offset((mid + size.height * 1.5f).coerceAtMost(size.width), y), Offset(size.width, y), size.height, StrokeCap.Round)
        }
    }
}

@Composable
private fun Stat(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier) {
        HudLabel(label.removePrefix("// "))
        Text(value, color = color, fontWeight = FontWeight.Medium, fontSize = 17.sp, maxLines = 1)
    }
}

@Composable
fun HudButton(icon: ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp).bounceClick(onClick = onClick).clip(CircleShape).background(C.CardAlt),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, description, tint = C.Text) }
}

@Composable
fun HomeScreen(
    month: YearMonth,
    onMonth: (YearMonth) -> Unit,
    hide: Boolean,
    onToggleHide: () -> Unit,
    movements: List<Movement>,
    currentBalance: Double?,
    anchor: BalanceAnchor?,
    listenerEnabled: Boolean,
    onEnableListener: () -> Unit,
    onSetBalance: () -> Unit,
    onOpen: (Movement) -> Unit,
    onSeeAll: () -> Unit,
    salaryOverride: Double? = null,
) {
    val monthMovs = movements.filter { month.contains(it.timestamp) }
    // Nómina del mes: la base de los porcentajes de cada categoría
    val (salary, _, salaryNote) = remember(movements, month, salaryOverride) {
        com.byluso.saldo.advisor.FinanceAdvisor.salaryFor(movements, month, salaryOverride)
    }
    var showIncome by remember { mutableStateOf(false) }
    var selected by remember(showIncome, month) { mutableStateOf<Int?>(null) }

    LazyColumn(Modifier.fillMaxWidth()) {
        item { MonthHeader(month, onMonth, hide, onToggleHide, monthMovs) }

        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp).enterStagger(1), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (!listenerEnabled) PermissionCard(onEnableListener)
                BalanceCard(currentBalance, anchor, hide, listenerEnabled, onSetBalance)
            }
        }

        item {
            SectionCard(Modifier.padding(16.dp).enterStagger(2)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Gastos", !showIncome) { showIncome = false }
                    Pill("Ingresos", showIncome) { showIncome = true }
                }
                Spacer(Modifier.height(18.dp))
                val list = if (showIncome) Spending.incomes(monthMovs) else Spending.expenses(monthMovs)
                val groups = list.groupBy { if (showIncome) it.merchant else it.category }
                    .mapValues { (_, v) -> v.sumOf { it.amount } }
                    .entries.sortedByDescending { it.value }
                val total = groups.sumOf { it.value }
                // Gastos: % sobre la nómina del mes. Ingresos: reparto entre ellos.
                val base = if (!showIncome && salary > 0) salary else total
                val palette = listOf(0xFF7FB79B, 0xFF6FA2AF, 0xFF9DADCB, 0xFFC9A46E, 0xFFC98E8E, 0xFFA4AAA6)
                fun colorOf(i: Int, key: String) =
                    if (showIncome) Color(palette[i % palette.size]) else Color(Categories.byName(key).color)

                Donut(
                    slices = groups.mapIndexed { i, e -> Slice(e.key, e.value, colorOf(i, e.key)) },
                    centerTop = euros(total, hide = hide),
                    centerBottom = when {
                        showIncome -> "Ingresos del mes"
                        salary > 0 -> "${(total / salary * 100).roundToInt()} % de tu nómina"
                        else -> "Gastos del mes"
                    },
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                    selected = selected, onSelect = { selected = it }, hide = hide,
                )
                Text(
                    when {
                        showIncome -> "Toca el gráfico o un ingreso"
                        salary > 0 -> "Porcentajes sobre tu nómina: ${euros(salary, hide = hide)}. $salaryNote."
                        else -> "No encuentro tu nómina: porcentajes sobre el gasto total. Márcala en el historial."
                    },
                    color = C.Muted, fontSize = 12.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp),
                )
                if (!showIncome) TransfersLine(monthMovs, hide)
                Spacer(Modifier.height(16.dp))
                if (groups.isEmpty()) {
                    Text(
                        if (showIncome) "Sin ingresos este mes" else "Sin gastos este mes",
                        color = C.Muted, fontFamily = Mono, fontSize = 12.sp,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                }
                groups.forEachIndexed { i, e ->
                    CategoryBar(
                        e.key, e.value, (e.value / base * 100).roundToInt(), colorOf(i, e.key), hide,
                        selected = selected == i, dimmed = selected != null && selected != i,
                        onClick = { selected = if (selected == i) null else i },
                    )
                }
            }
        }

        item {
            Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 10.dp).enterStagger(3), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Últimos movimientos", color = C.Text, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                }
                Text(
                    "Ver todo", color = C.Accent, fontSize = 14.sp, fontWeight = FontWeight.Medium,
                    modifier = Modifier.bounceClick(onClick = onSeeAll).padding(6.dp),
                )
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp).enterStagger(4).fillMaxWidth().holoPanel()) {
                val last = movements.take(6)
                if (last.isEmpty()) {
                    Text(
                        "Sin señales todavía. Cuando tu banco te envíe un aviso de un pago o un ingreso, aparecerá aquí. También puedes añadirlos con ◆.",
                        color = C.Muted, modifier = Modifier.padding(20.dp),
                    )
                }
                last.forEachIndexed { i, m ->
                    Column(Modifier.enterStagger(5 + i)) {
                        if (i > 0) Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(C.Line))
                        MovementRow(m, hide) { onOpen(m) }
                    }
                }
            }
            Spacer(Modifier.height(120.dp))
        }
    }
}

/** Recargas a otras tarjetas y traspasos al ahorro del mes, que no se cuentan como gasto. */
@Composable
private fun TransfersLine(monthMovs: List<Movement>, hide: Boolean) {
    val topUps = Spending.topUps(monthMovs)
    val saved = Spending.toSavings(monthMovs)
    if (topUps <= 0 && saved <= 0) return
    val detailed = Spending.hasCardDetail(monthMovs)
    Column(
        Modifier.fillMaxWidth().padding(top = 12.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .background(C.CardAlt).padding(12.dp),
    ) {
        if (topUps > 0) {
            Text("💳 Recargas a tarjetas: ${euros(topUps, hide = hide)}", color = C.Text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text(
                if (detailed) "No cuentan como gasto: cuento las compras de la tarjeta, que vienen de su extracto."
                else "Cuentan como gasto hasta que importes el extracto de la tarjeta: entonces verás en qué se gastó.",
                color = if (detailed) C.Muted else C.Magenta, fontSize = 12.sp,
            )
        }
        if (saved > 0) {
            Text(
                "💎 A ahorro o inversión: ${euros(saved, hide = hide)} (no cuenta como gasto)", color = C.Text, fontSize = 13.sp,
                modifier = Modifier.padding(top = if (topUps > 0) 8.dp else 0.dp),
            )
        }
    }
}

@Composable
private fun BalanceCard(balance: Double?, anchor: BalanceAnchor?, hide: Boolean, live: Boolean, onSet: () -> Unit) {
    val shown = rememberCountUp(balance ?: 0.0)
    Column(
        Modifier
            .fillMaxWidth()
            .holoPanel(22.dp)
            .bounceClick(onClick = onSet)
            .padding(20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            HudLabel("saldo en cuenta", modifier = Modifier.weight(1f))
            if (live) {
                LiveDot()
                Text("  Captura activa", color = C.Muted, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(8.dp))
        if (balance == null) {
            Text("Toca para indicar tu saldo", color = C.Accent, fontWeight = FontWeight.Medium, fontSize = 18.sp)
            Text(
                "Se actualizará solo con cada aviso de tu banco. Si el aviso incluye el saldo, se usará directamente.",
                color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp),
            )
        } else {
            GlowText(euros(shown, hide = hide), color = if (balance >= 0) C.Text else C.Expense, fontSize = 36.sp)
            Text(
                (anchor?.let { "Ajustado ${relativeDay(it.timestamp).lowercase(esLocale)} · toca para cambiarlo" } ?: "Según los avisos de tu banco"),
                color = C.Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun PermissionCard(onEnable: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .holoPanel(22.dp, border = androidx.compose.ui.graphics.SolidColor(C.Magenta.copy(alpha = 0.5f)), fill = C.Magenta)
            .padding(20.dp)
    ) {
        Text("Activa la captura automática", color = C.Text, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
        Text(
            "Saldo necesita leer los avisos de tu banco para registrar cada gasto e ingreso. Todo se queda en tu móvil.",
            color = C.Muted, fontSize = 14.sp, modifier = Modifier.padding(vertical = 10.dp),
        )
        Pill("Conectar", true, onEnable)
    }
}
