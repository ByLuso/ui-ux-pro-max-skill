package com.byluso.saldo.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** El diseño minimalista no tiene pantalla de arranque: termina al instante. */
@Composable
fun BootSequence(onDone: () -> Unit) {
    LaunchedEffect(Unit) { onDone() }
}

data class ToastMsg(val title: String, val detail: String, val color: Color, val id: Long = System.nanoTime())

/** Aviso breve que aparece arriba y se va solo. */
@Composable
fun HoloToast(msg: ToastMsg?, onGone: () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    var shown by remember { mutableStateOf(msg) }
    LaunchedEffect(msg?.id) {
        if (msg == null) return@LaunchedEffect
        shown = msg
        visible = true
        delay(2200)
        visible = false
        delay(300)
        onGone()
    }
    AnimatedVisibility(
        visible,
        enter = slideInVertically(tween(260)) { -it / 2 } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(220)) { -it / 2 } + fadeOut(tween(200)),
        modifier = Modifier.statusBarsPadding().padding(16.dp),
    ) {
        val m = shown ?: return@AnimatedVisibility
        val shape = RoundedCornerShape(14.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .shadow(8.dp, shape)
                .clip(shape)
                .background(C.Card)
                .border(1.dp, C.Line, shape)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            LiveDot(m.color)
            Column(Modifier.weight(1f)) {
                Text(m.title.replaceFirstChar { it.titlecase(esLocale) }, color = C.Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(m.detail, color = C.Muted, fontSize = 13.sp)
            }
        }
    }
}
