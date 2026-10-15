package com.byluso.saldo.ui

import android.graphics.BlurMaskFilter
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin

/**
 * Secuencia de arranque: se dibuja el anillo, el logo se condensa, se teclea el estado
 * y la barra de sincronización se llena; luego todo se expande y se desvanece.
 * Un toque la salta.
 */
@Composable
fun BootSequence(onDone: () -> Unit) {
    val ring = remember { Animatable(0f) }
    val logo = remember { Animatable(0f) }
    val bar = remember { Animatable(0f) }
    val exit = remember { Animatable(0f) }
    val type = remember { Animatable(0f) }
    var line by remember { mutableStateOf("INICIANDO ENLACE SEGURO") }

    LaunchedEffect(Unit) {
        coroutineScope {
            val r = async { ring.animateTo(1f, tween(900, easing = FastOutSlowInEasing)) }
            val l = async { logo.animateTo(1f, tween(700, delayMillis = 200, easing = FastOutSlowInEasing)) }
            type.animateTo(1f, tween(550, delayMillis = 350, easing = LinearEasing))
            bar.animateTo(0.55f, tween(420, easing = LinearEasing))
            line = "SINCRONIZANDO SEÑALES"
            bar.animateTo(1f, tween(380, easing = FastOutSlowInEasing))
            line = "ENLACE ESTABLECIDO ◆"
            r.await(); l.await()
            exit.animateTo(1f, tween(450, delayMillis = 250, easing = FastOutSlowInEasing))
        }
        onDone()
    }
    val typed = if (type.value < 1f) line.take((line.length * type.value).toInt()) else line

    val e = exit.value
    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = 1f - e; scaleX = 1f + e * 0.15f; scaleY = 1f + e * 0.15f }
            .background(C.Void)
            .clickable(remember { MutableInteractionSource() }, indication = null, onClick = onDone),
        contentAlignment = Alignment.Center,
    ) {
        // Rejilla tenue de fondo
        Canvas(Modifier.fillMaxSize()) {
            val step = 32.dp.toPx()
            var x = 0f
            while (x < size.width) { drawLine(C.Cyan.copy(alpha = 0.04f), Offset(x, 0f), Offset(x, size.height)); x += step }
            var y = 0f
            while (y < size.height) { drawLine(C.Cyan.copy(alpha = 0.04f), Offset(0f, y), Offset(size.width, y)); y += step }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(200.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(200.dp)) {
                    val sweep = 360f * ring.value
                    val inset = 12.dp.toPx()
                    val arcSize = androidx.compose.ui.geometry.Size(size.width - inset * 2, size.height - inset * 2)
                    drawIntoCanvas { c ->
                        val p = Paint().asFrameworkPaint().apply {
                            isAntiAlias = true; style = android.graphics.Paint.Style.STROKE; strokeWidth = 10f
                            color = C.Cyan.copy(alpha = 0.7f).toArgb(); maskFilter = BlurMaskFilter(22f, BlurMaskFilter.Blur.NORMAL)
                        }
                        c.nativeCanvas.drawArc(inset, inset, inset + arcSize.width, inset + arcSize.height, -90f, sweep, false, p)
                    }
                    drawArc(
                        Brush.sweepGradient(listOf(C.Cyan, C.Violet, C.Magenta, C.Cyan)), -90f, sweep, false,
                        Offset(inset, inset), arcSize, style = Stroke(4f, cap = StrokeCap.Round),
                    )
                    // Punto de cabeza del trazo
                    val a = Math.toRadians((-90f + sweep).toDouble())
                    val r = arcSize.width / 2
                    drawCircle(Color.White, 5f, Offset(center.x + (r * cos(a)).toFloat(), center.y + (r * sin(a)).toFloat()))
                    // Marcas interiores
                    for (i in 0 until 48) {
                        if (i / 48f > ring.value) break
                        val ang = Math.toRadians(i * 7.5 - 90)
                        val r1 = r - 14.dp.toPx()
                        val r2 = r1 - if (i % 4 == 0) 10f else 4f
                        drawLine(C.Cyan.copy(alpha = 0.4f), Offset(center.x + (r1 * cos(ang)).toFloat(), center.y + (r1 * sin(ang)).toFloat()),
                            Offset(center.x + (r2 * cos(ang)).toFloat(), center.y + (r2 * sin(ang)).toFloat()), 2f)
                    }
                }
                Box(
                    Modifier
                        .size(26.dp)
                        .graphicsLayer { rotationZ = 45f + (1 - logo.value) * 180f; scaleX = logo.value; scaleY = logo.value }
                        .clip(CutCornerShape(20))
                        .background(C.holo)
                )
            }
            Spacer(Modifier.height(28.dp))
            Text(
                "SALDO",
                style = TextStyle(brush = C.holo, fontFamily = Display, fontWeight = FontWeight.Black, fontSize = 34.sp),
                letterSpacing = (6 + 30 * (1 - logo.value)).sp,
                modifier = Modifier.graphicsLayer { alpha = logo.value.coerceIn(0f, 1f) },
            )
            Spacer(Modifier.height(26.dp))
            Text(
                "> $typed" + if (bar.value < 1f) "▮" else "", color = C.Cyan, fontFamily = Mono,
                fontSize = 12.sp, letterSpacing = 2.sp,
            )
            Spacer(Modifier.height(12.dp))
            Box(Modifier.width(220.dp).height(3.dp).background(C.Track)) {
                Box(Modifier.fillMaxWidth(bar.value).height(3.dp).background(Brush.horizontalGradient(listOf(C.Cyan, C.Magenta))))
            }
            Spacer(Modifier.height(8.dp))
            Text("${(bar.value * 100).toInt()}%", color = C.Muted, fontFamily = Mono, fontSize = 10.sp, letterSpacing = 2.sp)
        }
    }
}

data class ToastMsg(val title: String, val detail: String, val color: Color, val id: Long = System.nanoTime())

/** Aviso holográfico que baja desde arriba con una línea de escaneo. */
@Composable
fun HoloToast(msg: ToastMsg?, onGone: () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    var shown by remember { mutableStateOf(msg) }
    val scan = remember { Animatable(0f) }
    LaunchedEffect(msg?.id) {
        if (msg == null) return@LaunchedEffect
        shown = msg
        visible = true
        scan.snapTo(0f)
        scan.animateTo(1f, tween(900, easing = LinearEasing))
        delay(1200)
        visible = false
        delay(400)
        onGone()
    }
    AnimatedVisibility(
        visible,
        enter = slideInVertically(spring(dampingRatio = 0.6f, stiffness = 300f)) { -it } + fadeIn() + scaleIn(initialScale = 0.9f),
        exit = slideOutVertically { -it } + fadeOut(),
        modifier = Modifier.statusBarsPadding().padding(16.dp),
    ) {
        val m = shown ?: return@AnimatedVisibility
        Row(
            Modifier
                .fillMaxWidth()
                .clip(chamfer(14.dp))
                .background(C.Void.copy(alpha = 0.95f))
                .holoPanel(14.dp, border = Brush.linearGradient(listOf(m.color, C.Violet)), fill = m.color.copy(alpha = 0.12f))
                .drawBehind {
                    val x = size.width * scan.value
                    drawLine(
                        Brush.horizontalGradient(listOf(Color.Transparent, m.color.copy(alpha = 0.6f), Color.Transparent), x - 120f, x + 20f),
                        Offset(x - 120f, size.height / 2), Offset(x + 20f, size.height / 2), size.height,
                    )
                }
                .padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            LiveDot(m.color)
            Column(Modifier.weight(1f)) {
                Text(m.title.uppercase(esLocale), color = m.color, fontFamily = Mono, fontSize = 11.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Bold)
                Text(m.detail, color = C.Text, fontSize = 15.sp)
            }
        }
    }
}
