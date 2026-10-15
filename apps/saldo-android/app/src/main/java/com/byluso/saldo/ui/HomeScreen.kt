package com.byluso.saldo.ui

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.data.BalanceAnchor
import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.Categories
import java.time.YearMonth
import kotlin.math.roundToInt

@Composable
fun MonthHeader(
    month: YearMonth,
    onMonth: (YearMonth) -> Unit,
    hide: Boolean,
    onToggleHide: () -> Unit,
    monthMovements: List<Movement>,
) {
    val income = monthMovements.filter { it.isIncome }.sumOf { it.amount }
    val expense = monthMovements.filter { !it.isIncome }.sumOf { it.amount }
    Column(
        Modifier
            .fillMaxWidth()
            .background(C.Header)
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RoundIcon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Mes anterior") { onMonth(month.minusMonths(1)) }
            Text(
                monthTitle(month), color = C.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            RoundIcon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Mes siguiente") { onMonth(month.plusMonths(1)) }
            Spacer(Modifier.size(8.dp))
            RoundIcon(if (hide) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, "Ocultar importes", onToggleHide)
        }
        Spacer(Modifier.height(18.dp))
        SummaryLine("↑  Ingresos", euros(income, signed = true, hide = hide), C.Income)
        SummaryLine("↓  Gastos", euros(-expense, signed = true, hide = hide), C.Expense)
        HorizontalDivider(color = C.Border, modifier = Modifier.padding(vertical = 8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Balance", color = C.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(
                euros(income - expense, signed = true, hide = hide),
                color = if (income - expense >= 0) C.Income else C.Expense,
                fontSize = 28.sp, fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun SummaryLine(label: String, value: String, color: Color) {
    Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = C.Muted, fontSize = 17.sp, modifier = Modifier.weight(1f))
        Text(value, color = color, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun RoundIcon(icon: ImageVector, description: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .border(1.dp, C.Track, CircleShape)
            .clickable(onClick = onClick),
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
) {
    val monthMovs = movements.filter { month.contains(it.timestamp) }
    var showIncome by remember { mutableStateOf(false) }

    LazyColumn(Modifier.fillMaxWidth()) {
        item { MonthHeader(month, onMonth, hide, onToggleHide, monthMovs) }

        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (!listenerEnabled) PermissionCard(onEnableListener)
                BalanceCard(currentBalance, anchor, hide, onSetBalance)
            }
        }

        item {
            SectionCard(Modifier.padding(horizontal = 16.dp)) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(C.Bg).padding(4.dp)
                ) {
                    Segment("Gastos por grupo", !showIncome, Modifier.weight(1f)) { showIncome = false }
                    Segment("Ingresos", showIncome, Modifier.weight(1f)) { showIncome = true }
                }
                Spacer(Modifier.height(20.dp))
                val list = monthMovs.filter { it.isIncome == showIncome }
                val groups = list.groupBy { if (showIncome) it.merchant else it.category }
                    .mapValues { (_, v) -> v.sumOf { it.amount } }
                    .entries.sortedByDescending { it.value }
                val total = groups.sumOf { it.value }
                val palette = listOf(0xFF34D399, 0xFF38BDF8, 0xFFA78BFA, 0xFFFBBF24, 0xFFF472B6, 0xFF94A3B8)
                fun colorOf(i: Int, key: String) =
                    if (showIncome) Color(palette[i % palette.size]) else Color(Categories.byName(key).color)

                Donut(
                    slices = groups.mapIndexed { i, e -> Slice(e.key, e.value, colorOf(i, e.key)) },
                    centerTop = euros(total, hide = hide),
                    centerBottom = "ESTE MES",
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
                Spacer(Modifier.height(20.dp))
                if (groups.isEmpty()) {
                    Text(
                        if (showIncome) "Sin ingresos este mes" else "Sin gastos este mes",
                        color = C.Muted, modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    groups.forEachIndexed { i, e ->
                        CategoryBar(e.key, e.value, (e.value / total * 100).roundToInt(), colorOf(i, e.key), hide)
                    }
                }
            }
        }

        item {
            Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 28.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Últimos movimientos", color = C.Text, fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("Ver todos", color = C.Accent, fontSize = 16.sp, modifier = Modifier.clickable(onClick = onSeeAll).padding(4.dp))
            }
        }
        item {
            Column(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(C.Card)
            ) {
                val last = movements.take(6)
                if (last.isEmpty()) {
                    Text(
                        "Aún no hay movimientos. Cuando tu banco te envíe una notificación de un pago o un ingreso, aparecerá aquí. También puedes añadirlos con +.",
                        color = C.Muted, modifier = Modifier.padding(20.dp),
                    )
                }
                last.forEachIndexed { i, m ->
                    if (i > 0) HorizontalDivider(color = C.Border)
                    MovementRow(m, hide) { onOpen(m) }
                }
            }
            Spacer(Modifier.height(96.dp))
        }
    }
}

@Composable
private fun Segment(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) C.Card else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (selected) C.Text else C.Muted, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun BalanceCard(balance: Double?, anchor: BalanceAnchor?, hide: Boolean, onSet: () -> Unit) {
    SectionCard(Modifier.clickable(onClick = onSet)) {
        Text("Saldo actual", color = C.Muted, fontSize = 15.sp)
        Spacer(Modifier.height(4.dp))
        if (balance == null) {
            Text("Toca para indicar tu saldo", color = C.Accent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(
                "Lo actualizaremos solo con cada notificación. Si tu banco incluye el saldo en sus avisos, se usará automáticamente.",
                color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp),
            )
        } else {
            Text(
                euros(balance, hide = hide), color = if (balance >= 0) C.Text else C.Expense,
                fontSize = 34.sp, fontWeight = FontWeight.Bold,
            )
            Text(
                anchor?.let { "Último ajuste: ${relativeDay(it.timestamp)} · toca para corregir" } ?: "Calculado con el saldo que informa tu banco",
                color = C.Muted, fontSize = 13.sp,
            )
        }
    }
}

@Composable
private fun PermissionCard(onEnable: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(Color(0xFF13233F))
            .border(1.dp, C.Accent.copy(alpha = 0.3f), RoundedCornerShape(24.dp))
            .padding(20.dp)
    ) {
        Text("🔔  Activa la captura automática", color = C.Text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        Text(
            "Saldo necesita permiso para leer las notificaciones de tu banco y registrar cada gasto e ingreso. Todo se guarda solo en tu móvil.",
            color = C.Muted, fontSize = 14.sp, modifier = Modifier.padding(vertical = 10.dp),
        )
        Box(
            Modifier.clip(RoundedCornerShape(14.dp)).background(C.Accent).clickable(onClick = onEnable)
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) { Text("Dar permiso", color = C.OnAccent, fontWeight = FontWeight.Bold, fontSize = 16.sp) }
    }
}
