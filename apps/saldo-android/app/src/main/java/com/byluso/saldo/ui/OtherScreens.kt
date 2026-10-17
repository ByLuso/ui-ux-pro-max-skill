package com.byluso.saldo.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.data.Movement
import com.byluso.saldo.data.SourceApp
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.NotificationParser
import java.time.YearMonth
import java.time.format.TextStyle as DateTextStyle

@Composable
fun ScreenTitle(code: String, text: String) {
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 8.dp)) {
        HudLabel(code, C.Cyan)
        GlitchText(
            rememberScramble(text.uppercase(esLocale), text),
            TextStyle(brush = C.holo, fontFamily = Display, fontWeight = FontWeight.Black, fontSize = 26.sp, letterSpacing = 3.sp),
        )
    }
}

// ------------------------------------------------------------------ Movimientos

@Composable
fun MovementsScreen(
    month: YearMonth,
    onMonth: (YearMonth) -> Unit,
    hide: Boolean,
    onToggleHide: () -> Unit,
    movements: List<Movement>,
    onImport: () -> Unit = {},
    onOpen: (Movement) -> Unit,
) {
    var filter by remember { mutableIntStateOf(0) } // 0 todos, 1 gastos, 2 ingresos
    val monthMovs = movements.filter { month.contains(it.timestamp) }
    val shown = monthMovs.filter { filter == 0 || (filter == 2) == it.isIncome }
    val byDay = shown.groupBy { toDate(it.timestamp) }

    LazyColumn {
        item { MonthHeader(month, onMonth, hide, onToggleHide, monthMovs) }
        item {
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Pill("Todo", filter == 0) { filter = 0 }
                Pill("Gastos", filter == 1) { filter = 1 }
                Pill("Ingresos", filter == 2) { filter = 2 }
                Pill("⇪ PDF", false, onImport)
            }
        }
        if (shown.isEmpty()) item {
            Text("Sin registros en ${monthTitle(month)}.", color = C.Muted, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.padding(20.dp))
        }
        byDay.entries.forEachIndexed { idx, (day, list) ->
            item(key = "$filter-$day") {
              Column(Modifier.enterStagger(idx + 1)) {
                Row(Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    HudLabel(relativeDay(list.first().timestamp), C.Cyan, Modifier.weight(1f))
                    Text(euros(list.sumOf { it.signed }, signed = true, hide = hide), color = C.Muted, fontFamily = Mono, fontSize = 12.sp)
                }
                Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().holoPanel()) {
                    list.forEachIndexed { i, m ->
                        if (i > 0) Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(C.Line))
                        MovementRow(m, hide) { onOpen(m) }
                    }
                }
              }
            }
        }
        item { Spacer(Modifier.height(120.dp)) }
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
    val preview = LocalInspectionMode.current
    val grow = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(Unit) { grow.animateTo(1f, tween(1200, easing = FastOutSlowInEasing)) }

    LazyColumn {
        item { ScreenTitle("análisis", "Gráficas") }
        item {
            SectionCard(Modifier.padding(16.dp).enterStagger(1).holoShimmer(6000, 0.05f)) {
                HudLabel("entrada vs salida · 6 ciclos")
                Spacer(Modifier.height(18.dp))
                Canvas(Modifier.fillMaxWidth().height(200.dp)) {
                    // Rejilla horizontal punteada
                    val dash = PathEffect.dashPathEffect(floatArrayOf(6f, 8f))
                    for (i in 0..4) {
                        val y = size.height * i / 4
                        drawLine(C.Line, Offset(0f, y), Offset(size.width, y), 1f, pathEffect = dash)
                    }
                    val slot = size.width / data.size
                    val barW = slot * 0.22f
                    data.forEachIndexed { i, (_, inc, exp) ->
                        val x = slot * i + slot / 2
                        listOf(inc to C.Income, exp to C.Expense).forEachIndexed { j, (v, color) ->
                            val local = ((grow.value * 1.6f) - i * 0.12f).coerceIn(0f, 1f)
                            val h = (v / max * size.height).toFloat() * FastOutSlowInEasing.transform(local)
                            val left = if (j == 0) x - barW - 3f else x + 3f
                            // Halo
                            drawRoundRect(color.copy(alpha = 0.18f), Offset(left - 4f, size.height - h - 4f), Size(barW + 8f, h + 4f), CornerRadius(6f))
                            drawRoundRect(
                                Brush.verticalGradient(listOf(color, color.copy(alpha = 0.15f)), size.height - h, size.height),
                                Offset(left, size.height - h), Size(barW, h), CornerRadius(4f),
                            )
                            if (h > 2f) drawLine(Color.White.copy(alpha = 0.9f), Offset(left, size.height - h), Offset(left + barW, size.height - h), 2f)
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                    data.forEach { (ym, _, _) ->
                        Text(
                            ym.month.getDisplayName(DateTextStyle.SHORT, esLocale).uppercase(esLocale).take(3), color = C.Muted,
                            fontFamily = Mono, fontSize = 10.sp, letterSpacing = 1.sp,
                            textAlign = TextAlign.Center, modifier = Modifier.weight(1f),
                        )
                    }
                }
                Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    Legend("Ingresos", C.Income); Legend("Gastos", C.Expense)
                }
            }
        }
        item { HudLabel("resultado por ciclo", modifier = Modifier.padding(start = 20.dp, top = 8.dp, bottom = 4.dp)) }
        items(data.reversed().withIndex().toList()) { (i, row) ->
            val (ym, inc, exp) = row
            Row(Modifier.enterStagger(2 + i).padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(monthTitle(ym), color = C.Text, modifier = Modifier.weight(1f))
                Text(
                    euros(inc - exp, signed = true, hide = hide), color = if (inc >= exp) C.Income else C.Expense,
                    fontFamily = Mono, fontWeight = FontWeight.Bold,
                )
            }
        }
        item {
            val thisMonth = movements.filter { now.contains(it.timestamp) && !it.isIncome }
            val top = thisMonth.groupBy { it.merchant }.mapValues { e -> e.value.sumOf { it.amount } }
                .entries.sortedByDescending { it.value }.take(5)
            if (top.isNotEmpty()) SectionCard(Modifier.padding(16.dp).enterStagger(8)) {
                HudLabel("mayores destinos · este ciclo")
                val maxTop = top.first().value
                top.forEachIndexed { i, (name, v) ->
                    Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("0${i + 1}", color = C.Cyan, fontFamily = Mono, fontSize = 12.sp)
                        Text(name, color = C.Text, modifier = Modifier.padding(start = 12.dp).weight(1f))
                        Text(euros(v, hide = hide), color = C.Text, fontFamily = Mono)
                    }
                    Canvas(Modifier.fillMaxWidth().height(4.dp).padding(top = 2.dp)) {
                        val w = size.width * (v / maxTop).toFloat() * grow.value
                        drawLine(C.holo, Offset(0f, size.height / 2), Offset(w, size.height / 2), 2f)
                    }
                }
            }
            Spacer(Modifier.height(120.dp))
        }
    }
}

@Composable
private fun Legend(label: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CutCornerShape(50)).background(color))
        Text("  " + label.uppercase(esLocale), color = C.Muted, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 1.sp)
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
    onImport: () -> Unit = {},
) {
    var test by remember { mutableStateOf("") }
    LazyColumn {
        item { ScreenTitle("sistema", "Ajustes") }
        item {
            SectionCard(Modifier.padding(16.dp).enterStagger(1)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HudLabel("enlace de notificaciones", if (listenerEnabled) C.Income else C.Magenta, Modifier.weight(1f))
                    if (listenerEnabled) LiveDot()
                }
                Text(
                    if (listenerEnabled) "Activo. Saldo registra los movimientos de tus apps bancarias."
                    else "Inactivo. Actívalo para registrar los movimientos automáticamente.",
                    color = C.Text, modifier = Modifier.padding(vertical = 10.dp),
                )
                Pill(if (listenerEnabled) "Ajustes del sistema" else "Conectar", !listenerEnabled, onOpenListenerSettings)
            }
        }
        item {
            SectionCard(Modifier.padding(horizontal = 16.dp).enterStagger(2)) {
                HudLabel("calibración de saldo")
                Text(
                    "Indica tu saldo actual y Saldo lo irá actualizando con cada gasto e ingreso detectado.",
                    color = C.Text, modifier = Modifier.padding(vertical = 10.dp),
                )
                Pill("Calibrar saldo", true, onSetBalance)
            }
        }
        item {
            SectionCard(Modifier.padding(16.dp).enterStagger(3).holoShimmer(5000, 0.06f)) {
                HudLabel("importar extracto", C.Cyan)
                Text(
                    "Comparte el extracto en PDF desde la app de tu banco (Compartir → Saldo) o elígelo aquí. " +
                        "Se añaden los movimientos que falten, sin duplicar, y se actualiza tu saldo.",
                    color = C.Text, modifier = Modifier.padding(vertical = 10.dp),
                )
                Pill("Elegir PDF", true, onImport)
            }
        }
        item {
            Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 4.dp)) {
                HudLabel("fuentes escuchadas", C.Cyan)
                Text(
                    "Los bancos conocidos se activan solos. Si otra app envía un aviso con importes, aparecerá aquí para que decidas.",
                    color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp),
                )
                if (apps.isEmpty()) Text(
                    "Aún no se ha recibido ningún aviso bancario.",
                    color = C.Muted, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.padding(top = 14.dp),
                )
            }
        }
        items(apps.withIndex().toList(), key = { it.value.pkg }) { (i, app) ->
            Row(
                Modifier.padding(horizontal = 16.dp, vertical = 5.dp).enterStagger(3 + i).fillMaxWidth().holoPanel(12.dp, border = Brush.linearGradient(listOf(C.Line, C.Line)))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(app.label, color = C.Text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        "${app.hits} SEÑALES · ${relativeDay(app.lastSeen).uppercase(esLocale)}",
                        color = C.Muted, fontFamily = Mono, fontSize = 10.sp, letterSpacing = 1.sp,
                    )
                }
                Switch(
                    checked = app.enabled, onCheckedChange = { onToggleApp(app.pkg, it) },
                    colors = SwitchDefaults.colors(
                        checkedTrackColor = C.Cyan, checkedThumbColor = C.Void,
                        uncheckedTrackColor = C.Glass, uncheckedThumbColor = C.Muted, uncheckedBorderColor = C.Line,
                    ),
                )
            }
        }
        item {
            SectionCard(Modifier.padding(16.dp)) {
                HudLabel("probar detector", C.Cyan)
                Text("Pega el texto de un aviso de tu banco para ver qué detecta.", color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp))
                OutlinedTextField(
                    test, { test = it }, Modifier.fillMaxWidth(),
                    placeholder = { Text("Compra de 12,30 € en Mercadona", fontFamily = Mono, fontSize = 13.sp) },
                    textStyle = TextStyle(fontFamily = Mono, fontSize = 13.sp), colors = holoFieldColors(),
                )
                val r = test.takeIf { it.isNotBlank() }?.let { NotificationParser.parse(null, it) }
                if (test.isNotBlank()) Text(
                    when {
                        r == null -> "> sin coincidencias"
                        r.category == Categories.BALANCE_ONLY -> "> saldo informado: ${euros(r.balance!!)}"
                        else -> buildString {
                            append("> ").append(if (r.isIncome) "ingreso" else "gasto")
                            append(" ${euros(r.amount)} · ${r.merchant} · ${r.category}")
                            r.balance?.let { append("\n> saldo informado: ${euros(it)}") }
                        }
                    },
                    color = if (r == null) C.Expense else C.Income, fontFamily = Mono, fontSize = 13.sp,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }
        item {
            Text(
                "🔒 Privado por diseño: Saldo no tiene acceso a internet ni lee tus credenciales. Tus datos no salen del móvil.",
                color = C.Muted, fontSize = 12.sp, modifier = Modifier.padding(20.dp),
            )
            Spacer(Modifier.height(120.dp))
        }
    }
}
