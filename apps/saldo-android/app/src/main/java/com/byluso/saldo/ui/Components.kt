package com.byluso.saldo.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.NotificationParser

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(C.Card)
            .padding(20.dp),
        content = content,
    )
}

data class Slice(val label: String, val value: Double, val color: Color)

@Composable
fun Donut(slices: List<Slice>, centerTop: String, centerBottom: String, modifier: Modifier = Modifier) {
    val total = slices.sumOf { it.value }.takeIf { it > 0 } ?: 1.0
    Box(modifier.size(200.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(200.dp)) {
            val stroke = 34.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            if (slices.isEmpty()) {
                drawArc(C.Track, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
                return@Canvas
            }
            // Se dibuja en orden inverso para que los extremos redondeados se solapen bien.
            val sweeps = slices.map { (it.value / total * 360f).toFloat() }
            val starts = sweeps.runningFold(-90f) { acc, s -> acc + s }
            for (i in slices.indices.reversed()) {
                drawArc(
                    slices[i].color, starts[i], sweeps[i].coerceAtLeast(0.5f), false,
                    Offset(inset, inset), arcSize, style = Stroke(stroke, cap = StrokeCap.Round),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(centerTop, color = C.Text, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(centerBottom, color = C.Muted, fontSize = 12.sp, letterSpacing = 1.sp)
        }
    }
}

@Composable
fun CategoryBar(name: String, amount: Double, pct: Int, color: Color, hide: Boolean) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(C.CardAlt),
    ) {
        Box(Modifier.width(4.dp).height(64.dp).padding(vertical = 10.dp).background(color))
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, color = C.Text, fontSize = 16.sp, modifier = Modifier.weight(1f))
                Text(euros(amount, hide = hide), color = C.Text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text("$pct%", color = color, fontSize = 15.sp, modifier = Modifier.width(52.dp).padding(start = 10.dp))
            }
            Spacer(Modifier.height(8.dp))
            Box(
                Modifier.fillMaxWidth().height(8.dp).clip(CircleShape).background(color.copy(alpha = 0.18f))
            ) {
                Box(Modifier.fillMaxWidth((pct / 100f).coerceIn(0.02f, 1f)).fillMaxHeight().clip(CircleShape).background(color))
            }
        }
    }
}

@Composable
fun MovementRow(m: Movement, hide: Boolean, onClick: () -> Unit) {
    val cat = Categories.byName(m.category)
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(48.dp).clip(CircleShape).background(Color(cat.color).copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) { Text(cat.emoji, fontSize = 22.sp) }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(m.merchant, color = C.Text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                relativeDay(m.timestamp) + " · " + m.category + if (m.sourceApp != null) " · auto" else "",
                color = C.Muted, fontSize = 13.sp, maxLines = 1,
            )
        }
        Text(
            euros(m.amount, signed = m.isIncome, hide = hide),
            color = if (m.isIncome) C.Income else C.Text,
            fontSize = 17.sp, fontWeight = FontWeight.SemiBold,
        )
    }
}

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
        containerColor = C.Card,
        title = { Text(if (initial == null) "Nuevo movimiento" else "Editar movimiento", color = C.Text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Gasto", !isIncome) { isIncome = false; if (category == Categories.INCOME) category = Categories.OTHER }
                    Pill("Ingreso", isIncome) { isIncome = true; category = Categories.INCOME }
                }
                OutlinedTextField(
                    value = amount, onValueChange = { amount = it }, label = { Text("Importe (€)") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    value = merchant, onValueChange = { merchant = it }, label = { Text("Concepto / comercio") },
                    singleLine = true,
                )
                if (!isIncome) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Categories.expenseNames.forEach { name ->
                            val c = Categories.byName(name)
                            FilterChip(
                                selected = category == name, onClick = { category = name },
                                label = { Text("${c.emoji} $name") },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(c.color).copy(alpha = 0.3f),
                                    labelColor = C.Muted, selectedLabelColor = C.Text,
                                ),
                            )
                        }
                    }
                }
                initial?.rawText?.let {
                    Text("Notificación original:\n$it", color = C.Muted, fontSize = 12.sp)
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
            ) { Text("Guardar") }
        },
        dismissButton = {
            Row {
                if (initial != null && onDelete != null) {
                    TextButton(onClick = { onDelete(initial) }) { Text("Borrar", color = C.Expense) }
                }
                TextButton(onClick = onDismiss) { Text("Cancelar", color = C.Muted) }
            }
        },
    )
}

@Composable
fun Pill(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(CircleShape)
            .background(if (selected) C.Accent else C.CardAlt)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) {
        Text(label, color = if (selected) C.OnAccent else C.Muted, fontWeight = FontWeight.SemiBold)
    }
}
