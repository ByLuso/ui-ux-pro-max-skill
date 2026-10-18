package com.byluso.saldo.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** Entrada suave: cada elemento aparece con un pequeño fundido y desplazamiento, uno tras otro. */
fun Modifier.enterStagger(index: Int): Modifier = composed {
    val preview = LocalInspectionMode.current
    val p = remember { Animatable(if (preview) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (preview) return@LaunchedEffect
        delay(40L * index.coerceAtMost(8))
        p.animateTo(1f, tween(420, easing = FastOutSlowInEasing))
    }
    val dy = with(LocalDensity.current) { 10.dp.toPx() }
    graphicsLayer {
        alpha = p.value
        translationY = (1f - p.value) * dy
    }
}

/** Pulsación con una ligera reducción de tamaño y vibración háptica suave. */
fun Modifier.bounceClick(haptic: Boolean = true, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.98f else 1f, spring(stiffness = 700f), label = "press")
    val hf = LocalHapticFeedback.current
    graphicsLayer { scaleX = scale; scaleY = scale }
        .clickable(source, indication = null) {
            if (haptic) hf.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        }
}

/** Sin efecto en el diseño minimalista (se mantiene para no tocar las pantallas). */
@Suppress("UNUSED_PARAMETER")
fun Modifier.holoShimmer(periodMs: Int = 0, strength: Float = 0f): Modifier = this

/** Sin efecto: el texto se muestra directamente. */
@Suppress("UNUSED_PARAMETER")
@Composable
fun rememberScramble(text: String, trigger: Any?): String = text

/** Texto normal (antes con efecto de interferencia). */
@Composable
fun GlitchText(text: String, style: TextStyle, modifier: Modifier = Modifier) {
    Text(text, style = style, modifier = modifier)
}

/** Animación 0→1 que se repite cada vez que cambia [key]. */
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
