package com.byluso.saldo.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.data.Movement
import com.byluso.saldo.data.SourceApp
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.NotificationParser
import java.time.YearMonth
import java.time.format.TextStyle

@Composable
fun ScreenTitle(text: String) {
    Text(
        text, color = C.Text, fontSize = 28.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth().background(C.Header).padding(20.dp),
    )
}

// ------------------------------------------------------------------ Movimientos

@Composable
fun MovementsScreen(
    month: YearMonth,
    onMonth: (YearMonth) -> Unit,
    hide: Boolean,
    onToggleHide: () -> Unit,
    movements: List<Movement>,
    onOpen: (Movement) -> Unit,
) {
    var filter by remember { mutableStateOf(0) } // 0 todos, 1 gastos, 2 ingresos
    val monthMovs = movements.filter { month.contains(it.timestamp) }
    val shown = monthMovs.filter { filter == 0 || (filter == 2) == it.isIncome }
    val byDay = shown.groupBy { toDate(it.timestamp) }

    LazyColumn {
        item { MonthHeader(month, onMonth, hide, onToggleHide, monthMovs) }
        item {
            Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("Todos", filter == 0) { filter = 0 }
                Pill("Gastos", filter == 1) { filter = 1 }
                Pill("Ingresos", filter == 2) { filter = 2 }
            }
        }
        if (shown.isEmpty()) item {
            Text("No hay movimientos en ${monthTitle(month)}.", color = C.Muted, modifier = Modifier.padding(20.dp))
        }
        byDay.forEach { (day, list) ->
            item(key = day.toString()) {
                Row(Modifier.padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 6.dp)) {
                    Text(relativeDay(list.first().timestamp), color = C.Muted, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Text(euros(list.sumOf { it.signed }, signed = true, hide = hide), color = C.Muted, fontSize = 14.sp)
                }
                Column(
                    Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(C.Card)
                ) {
                    list.forEachIndexed { i, m ->
                        if (i > 0) HorizontalDivider(color = C.Border)
                        MovementRow(m, hide) { onOpen(m) }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(96.dp)) }
    }
}

// ------------------------------------------------------------------ Gráficas

@Composable
fun ChartsScreen(movements: List<Movement>, hide: Boolean) {
    val now = YearMonth.now()
    val months = (5 downTo 0).map { now.minusMonths(it.toLong()) }
    val data = months.map { ym ->
        val list = movements.filter { ym.contains(it.timestamp) }
        Triple(ym, list.filter { it.isIncome }.sumOf { it.amount }, list.filter { !it.isIncome }.sumOf { it.amount })
    }
    val max = data.maxOf { maxOf(it.second, it.third) }.takeIf { it > 0 } ?: 1.0

    LazyColumn {
        item { ScreenTitle("Gráficas") }
        item {
            SectionCard(Modifier.padding(16.dp)) {
                Text("Ingresos vs gastos · 6 meses", color = C.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(16.dp))
                Canvas(Modifier.fillMaxWidth().height(180.dp)) {
                    val slot = size.width / data.size
                    val barW = slot * 0.28f
                    data.forEachIndexed { i, (_, inc, exp) ->
                        val x = slot * i + slot / 2
                        val hi = (inc / max * size.height).toFloat()
                        val he = (exp / max * size.height).toFloat()
                        drawRoundRect(C.Income, Offset(x - barW - 2f, size.height - hi), Size(barW, hi), CornerRadius(8f))
                        drawRoundRect(C.Expense, Offset(x + 2f, size.height - he), Size(barW, he), CornerRadius(8f))
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    data.forEach { (ym, _, _) ->
                        Text(
                            ym.month.getDisplayName(TextStyle.SHORT, esLocale), color = C.Muted, fontSize = 12.sp,
                            textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
                        )
                    }
                }
                Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Legend("Ingresos", C.Income); Legend("Gastos", C.Expense)
                }
            }
        }
        items(data.reversed()) { (ym, inc, exp) ->
            Row(Modifier.padding(horizontal = 20.dp, vertical = 10.dp)) {
                Text(monthTitle(ym), color = C.Text, modifier = Modifier.weight(1f))
                Text(euros(inc - exp, signed = true, hide = hide), color = if (inc >= exp) C.Income else C.Expense, fontWeight = FontWeight.SemiBold)
            }
        }
        item {
            val thisMonth = movements.filter { now.contains(it.timestamp) && !it.isIncome }
            val top = thisMonth.groupBy { it.merchant }.mapValues { e -> e.value.sumOf { it.amount } }
                .entries.sortedByDescending { it.value }.take(5)
            if (top.isNotEmpty()) SectionCard(Modifier.padding(16.dp)) {
                Text("Dónde más gastas este mes", color = C.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                top.forEach { (name, v) ->
                    Row(Modifier.padding(top = 10.dp)) {
                        Text(name, color = C.Text, modifier = Modifier.weight(1f))
                        Text(euros(v, hide = hide), color = C.Text)
                    }
                }
            }
            Spacer(Modifier.height(96.dp))
        }
    }
}

@Composable
private fun Legend(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(color))
        Text("  $label", color = C.Muted, fontSize = 13.sp)
    }
}

// ------------------------------------------------------------------ Ajustes

@Composable
fun SettingsScreen(
    listenerEnabled: Boolean,
    onOpenListenerSettings: () -> Unit,
    apps: List<SourceApp>,
    onToggleApp: (String, Boolean) -> Unit,
    onSetBalance: () -> Unit,
) {
    var test by remember { mutableStateOf("") }
    LazyColumn {
        item { ScreenTitle("Ajustes") }
        item {
            SectionCard(Modifier.padding(16.dp)) {
                Text("Lectura de notificaciones", color = C.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    if (listenerEnabled) "✅ Activada. Saldo registra los movimientos de tus apps bancarias."
                    else "⚠️ Desactivada. Actívala para registrar los movimientos automáticamente.",
                    color = C.Muted, modifier = Modifier.padding(vertical = 8.dp),
                )
                Pill(if (listenerEnabled) "Abrir ajustes del sistema" else "Activar", !listenerEnabled, onOpenListenerSettings)
            }
        }
        item {
            SectionCard(Modifier.padding(horizontal = 16.dp)) {
                Text("Saldo", color = C.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    "Indica tu saldo actual y Saldo lo irá actualizando con cada gasto e ingreso detectado.",
                    color = C.Muted, modifier = Modifier.padding(vertical = 8.dp),
                )
                Pill("Ajustar saldo actual", true, onSetBalance)
            }
        }
        item {
            Text(
                "Apps escuchadas", color = C.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 20.dp, top = 24.dp, bottom = 4.dp),
            )
            Text(
                "Los bancos conocidos se activan solos. Si otra app envía una notificación con importes, aparecerá aquí para que decidas.",
                color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
            )
            if (apps.isEmpty()) Text(
                "Todavía no se ha recibido ninguna notificación bancaria.",
                color = C.Muted, modifier = Modifier.padding(20.dp),
            )
        }
        items(apps, key = { it.pkg }) { app ->
            Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(app.label, color = C.Text, fontSize = 16.sp)
                    Text("${app.hits} avisos · ${relativeDay(app.lastSeen)}", color = C.Muted, fontSize = 12.sp)
                }
                Switch(
                    checked = app.enabled, onCheckedChange = { onToggleApp(app.pkg, it) },
                    colors = SwitchDefaults.colors(checkedTrackColor = C.Accent, checkedThumbColor = C.OnAccent),
                )
            }
        }
        item {
            SectionCard(Modifier.padding(16.dp)) {
                Text("Probar detector", color = C.Text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Text("Pega el texto de una notificación de tu banco para ver qué detecta.", color = C.Muted, fontSize = 13.sp)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(test, { test = it }, Modifier.fillMaxWidth(), placeholder = { Text("Compra de 12,30 € en Mercadona") })
                val r = test.takeIf { it.isNotBlank() }?.let { NotificationParser.parse(null, it) }
                if (test.isNotBlank()) Text(
                    when {
                        r == null -> "No se detecta ningún movimiento."
                        r.category == Categories.BALANCE_ONLY -> "Saldo informado: ${euros(r.balance!!)}"
                        else -> buildString {
                            append(if (r.isIncome) "Ingreso" else "Gasto")
                            append(" de ${euros(r.amount)} · ${r.merchant} · ${r.category}")
                            r.balance?.let { append("\nSaldo informado: ${euros(it)}") }
                        }
                    },
                    color = if (r == null) C.Expense else C.Income, modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        item {
            Text(
                "🔒 Tus datos no salen del móvil: Saldo no tiene acceso a internet ni lee tus credenciales bancarias.",
                color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(20.dp),
            )
            Spacer(Modifier.height(96.dp))
        }
    }
}
