package com.byluso.saldo.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.random.Random

/** Entrada escalonada: cada elemento aparece deslizándose desde abajo un poco después del anterior. */
fun Modifier.enterStagger(index: Int): Modifier = composed {
    val preview = LocalInspectionMode.current
    val p = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (preview) return@LaunchedEffect
        delay(60L * index.coerceAtMost(10))
        p.animateTo(1f, spring(dampingRatio = 0.75f, stiffness = 180f))
    }
    val dy = with(LocalDensity.current) { 36.dp.toPx() }
    graphicsLayer {
        alpha = p.value.coerceIn(0f, 1f)
        translationY = (1f - p.value) * dy
        val s = 0.94f + 0.06f * p.value
        scaleX = s; scaleY = s
    }
}

/** Pulsación con rebote elástico y vibración háptica. */
fun Modifier.bounceClick(haptic: Boolean = true, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed) 0.94f else 1f, spring(dampingRatio = 0.45f, stiffness = 500f), label = "bounce",
    )
    val hf = LocalHapticFeedback.current
    graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(source, indication = null) {
            if (haptic) hf.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        }
}

/** Destello holográfico: una franja de luz diagonal recorre el elemento cada pocos segundos. */
fun Modifier.holoShimmer(periodMs: Int = 4200, strength: Float = 0.10f): Modifier = composed {
    if (LocalInspectionMode.current) return@composed this
    val t = rememberInfiniteTransition(label = "shimmer")
    val p by t.animateFloat(-0.6f, 1.8f, infiniteRepeatable(tween(periodMs, easing = LinearEasing)), label = "p")
    drawWithContent {
        drawContent()
        val band = size.width * 0.35f
        val x = size.width * p
        drawRect(
            Brush.linearGradient(
                listOf(Color.Transparent, Color.White.copy(alpha = strength), C.Cyan.copy(alpha = strength * 0.6f), Color.Transparent),
                start = Offset(x - band, 0f), end = Offset(x + band, size.height),
            )
        )
    }
}

private const val GLYPHS = "0123456789#%&@$§¥∆◇"

/**
 * Efecto "descifrado": cada vez que cambia [trigger], el texto se muestra como símbolos
 * aleatorios que se van resolviendo de izquierda a derecha.
 */
@Composable
fun rememberScramble(text: String, trigger: Any?): String {
    val preview = LocalInspectionMode.current
    var progress by remember { mutableFloatStateOf(1f) }
    var seed by remember { mutableStateOf(0) }
    LaunchedEffect(trigger) {
        if (preview) return@LaunchedEffect
        val frames = 14
        for (f in 0..frames) {
            progress = f / frames.toFloat()
            seed++
            delay(34)
        }
        progress = 1f
    }
    if (progress >= 1f) return text
    val r = Random(seed)
    val reveal = (text.length * progress).toInt()
    return buildString {
        text.forEachIndexed { i, ch ->
            append(if (i < reveal || !ch.isLetterOrDigit() && ch != '•') ch else GLYPHS[r.nextInt(GLYPHS.length)])
        }
    }
}

/**
 * Texto con fallo de señal: de vez en cuando se separa en copias cian y magenta
 * desplazadas durante una fracción de segundo.
 */
@Composable
fun GlitchText(text: String, style: TextStyle, modifier: Modifier = Modifier) {
    val preview = LocalInspectionMode.current
    var dx by remember { mutableFloatStateOf(0f) }
    var dy by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        if (preview) return@LaunchedEffect
        while (true) {
            delay(Random.nextLong(2800, 6200))
            repeat(7) {
                dx = Random.nextFloat() * 10f - 5f
                dy = Random.nextFloat() * 4f - 2f
                delay(32)
            }
            dx = 0f; dy = 0f
        }
    }
    Box(modifier) {
        if (dx != 0f) {
            Text(text, style = style.merge(TextStyle(color = C.Cyan.copy(alpha = 0.8f))),
                modifier = Modifier.graphicsLayer { translationX = dx; translationY = dy })
            Text(text, style = style.merge(TextStyle(color = C.Magenta.copy(alpha = 0.8f))),
                modifier = Modifier.graphicsLayer { translationX = -dx; translationY = -dy })
        }
        Text(text, style = style, modifier = Modifier.graphicsLayer { translationX = dx * 0.3f })
    }
}

/** Animación 0→1 que se repite cada vez que cambia [key] (para efectos puntuales). */
@Composable
fun rememberPulseOn(key: Any?, durationMs: Int = 600): Float {
    val a = remember { Animatable(1f) }
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(key) {
        if (first) { first = false; return@LaunchedEffect }
        a.snapTo(0f)
        a.animateTo(1f, tween(durationMs, easing = FastOutSlowInEasing))
    }
    return a.value
}
