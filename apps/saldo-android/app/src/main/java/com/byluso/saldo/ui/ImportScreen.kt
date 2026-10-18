package com.byluso.saldo.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.byluso.saldo.data.ImportPlan
import com.byluso.saldo.data.ImportState
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.StatementLine
import java.time.format.DateTimeFormatter

private val shortDate = DateTimeFormatter.ofPattern("d MMM", esLocale)
private val longDate = DateTimeFormatter.ofPattern("d MMM yyyy", esLocale)

/** Capa de importación de extractos: análisis, contraseña, vista previa y errores. */
@Composable
fun ImportOverlay(
    state: ImportState,
    hide: Boolean,
    onPassword: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val visible = state !is ImportState.Idle && state !is ImportState.Done
    AnimatedVisibility(visible, enter = fadeIn(tween(250)), exit = fadeOut(tween(250))) {
        Box(
            Modifier
                .fillMaxSize()
                .background(C.Void.copy(alpha = 0.86f))
                .clickable(remember { MutableInteractionSource() }, indication = null) {
                    if (state !is ImportState.Reading) onDismiss()
                }
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(16.dp),
            contentAlignment = Alignment.Center,
        ) {
          BoxWithConstraints(contentAlignment = Alignment.Center) {
            // La tarjeta nunca puede ser más alta que la pantalla: los botones quedan siempre a la vista
            val maxPanel = maxHeight
            AnimatedContent(
                targetState = state,
                contentKey = { it::class },
                transitionSpec = {
                    (fadeIn(tween(260)) + scaleIn(spring(dampingRatio = 0.7f, stiffness = 300f), initialScale = 0.92f) +
                        slideInVertically { it / 10 }) togetherWith (fadeOut(tween(160)) + scaleOut(targetScale = 1.04f))
                },
                label = "import",
            ) { s ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(max = maxPanel)
                        .clip(chamfer(22.dp))
                        .background(C.Deep.copy(alpha = 0.97f))
                        .holoPanel(22.dp, border = C.holo, fill = C.Violet.copy(alpha = 0.08f))
                        // Evita que los toques dentro del panel lo cierren
                        .clickable(remember { MutableInteractionSource() }, indication = null) {}
                        .padding(horizontal = 20.dp, vertical = 18.dp),
                ) {
                    when (s) {
                        ImportState.Reading -> Reading()
                        is ImportState.NeedsPassword -> PasswordStep(s.wrong, onPassword, onDismiss)
                        is ImportState.Preview -> PreviewStep(s.plan, hide, onConfirm, onDismiss)
                        is ImportState.Error -> ErrorStep(s.message, onDismiss)
                        else -> Unit
                    }
                }
              }
            }
        }
    }
}

// ---------------------------------------------------------------- Análisis

@Composable
private fun Reading() {
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        androidx.compose.material3.CircularProgressIndicator(color = C.Accent, trackColor = C.Track, strokeWidth = 3.dp, modifier = Modifier.size(44.dp))
        Spacer(Modifier.height(18.dp))
        Text("Analizando el extracto…", color = C.Text, fontWeight = FontWeight.Medium, fontSize = 16.sp)
        Text("Leyendo fechas, importes y saldos", color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

// ---------------------------------------------------------------- Contraseña

@Composable
private fun PasswordStep(wrong: Boolean, onPassword: (String) -> Unit, onDismiss: () -> Unit) {
    var pw by remember { mutableStateOf("") }
    HudLabel("documento cifrado", C.Magenta)
    Text("PDF protegido", color = C.Text, fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.padding(top = 4.dp))
    Text(
        "Muchos bancos protegen el extracto con tu DNI o NIE (con letra). La contraseña solo se usa para abrir este PDF y no se guarda.",
        color = C.Muted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 10.dp),
    )
    OutlinedTextField(
        pw, { pw = it }, Modifier.fillMaxWidth(), singleLine = true,
        label = { Text("Contraseña") }, isError = wrong,
        supportingText = if (wrong) ({ Text("Contraseña incorrecta", color = C.Expense) }) else null,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        textStyle = TextStyle(fontFamily = Mono, fontSize = 16.sp), colors = holoFieldColors(),
    )
    Spacer(Modifier.height(14.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Pill("Abrir", true) { if (pw.isNotEmpty()) onPassword(pw.trim()) }
        Pill("Cancelar", false, onDismiss)
    }
}

// ---------------------------------------------------------------- Vista previa

@Composable
private fun ColumnScope.PreviewStep(plan: ImportPlan, hide: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val st = plan.statement
    val fresh = plan.fresh
    val inc = fresh.filter { it.isIncome }.sumOf { it.amount }
    val exp = fresh.filter { !it.isIncome }.sumOf { it.amount }
    // Por identidad: dos líneas iguales (p. ej. dos cafés el mismo día) pueden ser una nueva y otra ya registrada
    val freshSet = remember(plan) { java.util.Collections.newSetFromMap(java.util.IdentityHashMap<StatementLine, Boolean>()).apply { addAll(fresh) } }

    // ---- Cabecera compacta
    HudLabel("extracto detectado", C.Cyan)
    GlitchText(
        (st.bank ?: "Extracto bancario"),
        TextStyle(color = C.Text, fontWeight = FontWeight.SemiBold, fontSize = 20.sp),
        Modifier.padding(top = 2.dp),
    )
    if (st.from != null && st.to != null) {
        Text(
            "${shortDate.format(st.from)} → ${longDate.format(st.to)}",
            color = C.Muted, fontFamily = Mono, fontSize = 12.sp, maxLines = 1,
        )
    }
    Spacer(Modifier.height(10.dp))
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        BigStat("nuevos", fresh.size.toString(), C.Cyan, Modifier.weight(1f))
        BigStat("ya tenías", plan.duplicates.size.toString(), C.Muted, Modifier.weight(1f))
        BigStat("total", st.lines.size.toString(), C.Text, Modifier.weight(1f))
    }
    if (fresh.isNotEmpty()) {
        Row(Modifier.padding(top = 6.dp)) {
            Text(euros(inc, signed = true, hide = hide), color = C.Income, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
            Text(euros(-exp, signed = true, hide = hide), color = C.Expense, fontFamily = Mono, fontSize = 12.sp, maxLines = 1)
        }
    }
    st.finalBalance?.let { bal ->
        Row(
            Modifier
                .padding(top = 10.dp)
                .fillMaxWidth()
                .clip(CutCornerShape(topStart = 10.dp, bottomEnd = 10.dp))
                .background(C.Violet.copy(alpha = 0.14f))
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Nuevo saldo", color = C.Muted, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
            GlowText(euros(bal, hide = hide), C.Cyan, 15.sp)
        }
    }
    Spacer(Modifier.height(6.dp))

    // ---- Lista: ocupa el espacio que quede y se desplaza por dentro
    var showUnrecognized by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false)) {
        if (st.unrecognized.isNotEmpty()) item {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp)
                    .clip(CutCornerShape(topStart = 8.dp, bottomEnd = 8.dp))
                    .background(C.Magenta.copy(alpha = 0.10f))
                    .bounceClick { showUnrecognized = !showUnrecognized }
                    .padding(10.dp)
            ) {
                Text(
                    "⚠ ${st.unrecognized.size} líneas con importes sin reconocer · ${if (showUnrecognized) "ocultar" else "ver"}",
                    color = C.Magenta, fontFamily = Mono, fontSize = 12.sp,
                )
                if (showUnrecognized) {
                    Text(
                        "No se importarán. Si son movimientos, haz captura y envíasela al desarrollador para ajustar el lector.",
                        color = C.Muted, fontSize = 11.sp, modifier = Modifier.padding(vertical = 6.dp),
                    )
                    st.unrecognized.forEach { Text("> $it", color = C.Text, fontFamily = Mono, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp)) }
                }
            }
        }
        itemsIndexed(st.lines.reversed()) { i, l ->
            PreviewRow(l, l in freshSet, hide, Modifier.enterStagger(i))
        }
    }

    // ---- Botones fijos abajo, siempre visibles
    Spacer(Modifier.height(12.dp))
    val label = when {
        fresh.isNotEmpty() -> "Importar ${fresh.size} movimientos"
        st.finalBalance != null -> "Actualizar saldo"
        else -> null
    }
    if (label != null) {
        PrimaryButton(label, onConfirm)
        Spacer(Modifier.height(8.dp))
    } else {
        Text(
            "Todos los movimientos de este extracto ya estaban en Saldo.",
            color = C.Muted, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp),
        )
    }
    Text(
        if (label == null) "Cerrar" else "Cancelar",
        color = C.Muted, fontFamily = Mono, fontSize = 12.sp,
        modifier = Modifier.align(Alignment.CenterHorizontally).bounceClick(onClick = onDismiss).padding(horizontal = 24.dp, vertical = 8.dp),
    )
}

/** Botón principal a todo lo ancho con relleno holográfico y destello. */
@Composable
private fun PrimaryButton(label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .bounceClick(onClick = onClick)
            .clip(RoundedCornerShape(14.dp))
            .background(C.Accent)
            .padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label, color = C.OnAccent, fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp, maxLines = 1,
        )
    }
}

@Composable
private fun BigStat(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier) {
        GlowText(value, color, 22.sp)
        Text(label, color = C.Muted, fontFamily = Mono, fontSize = 12.sp)
    }
}

@Composable
private fun PreviewRow(l: StatementLine, isNew: Boolean, hide: Boolean, modifier: Modifier) {
    val cat = Categories.byName(l.category)
    Row(
        modifier.fillMaxWidth().padding(vertical = 7.dp).then(if (isNew) Modifier else Modifier.background(Color.Transparent)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.width(3.dp).height(30.dp).background(if (isNew) Color(cat.color) else C.Line)
        )
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(
                l.merchant, color = if (isNew) C.Text else C.Muted, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Text(
                (shortDate.format(l.date) + " · " + l.category + if (!isNew) " · ya registrado" else ""),
                color = C.Muted, fontFamily = Mono, fontSize = 12.sp, maxLines = 1,
            )
        }
        Text(
            euros(if (l.isIncome) l.amount else -l.amount, signed = true, hide = hide),
            color = when { !isNew -> C.Muted; l.isIncome -> C.Income; else -> C.Text },
            fontFamily = Mono, fontSize = 13.sp, fontWeight = FontWeight.Bold,
        )
    }
}

// ---------------------------------------------------------------- Error

@Composable
private fun ErrorStep(message: String, onDismiss: () -> Unit) {
    HudLabel("lectura fallida", C.Expense)
    Text("No se pudo importar", color = C.Text, fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.padding(top = 4.dp))
    Text(message, color = C.Muted, fontSize = 14.sp, modifier = Modifier.padding(vertical = 12.dp))
    Pill("Cerrar", true, onDismiss)
}
