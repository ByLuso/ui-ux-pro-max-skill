package com.byluso.saldo

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.core.content.IntentCompat
import com.byluso.saldo.data.ImportState
import com.byluso.saldo.data.StatementImporter
import com.byluso.saldo.ui.ImportOverlay
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import com.byluso.saldo.ui.BootSequence
import com.byluso.saldo.ui.HoloToast
import com.byluso.saldo.ui.ToastMsg
import com.byluso.saldo.ui.bounceClick
import com.byluso.saldo.ui.rememberPulseOn
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.byluso.saldo.ui.CosmicBackground
import com.byluso.saldo.ui.DiamondButton
import com.byluso.saldo.ui.Display
import com.byluso.saldo.ui.HudLabel
import com.byluso.saldo.ui.Mono
import com.byluso.saldo.ui.chamfer
import com.byluso.saldo.ui.esLocale
import com.byluso.saldo.ui.holoFieldColors
import com.byluso.saldo.ui.holoPanel
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.byluso.saldo.data.BalanceCalculator
import com.byluso.saldo.data.Movement
import com.byluso.saldo.data.Repository
import com.byluso.saldo.parser.NotificationParser
import com.byluso.saldo.service.BankNotificationListener
import com.byluso.saldo.ui.C
import com.byluso.saldo.ui.ChartsScreen
import com.byluso.saldo.ui.HomeScreen
import com.byluso.saldo.ui.LocalHideAmounts
import com.byluso.saldo.ui.MovementDialog
import com.byluso.saldo.ui.MovementsScreen
import com.byluso.saldo.ui.SaldoTheme
import com.byluso.saldo.ui.SettingsScreen
import com.byluso.saldo.ui.euros
import java.time.YearMonth

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val repo = Repository.get(this)
        importer = StatementImporter.get(this, repo)
        if (savedInstanceState == null) handleShare(intent)
        setContent { SaldoTheme { SaldoApp(repo, importer) } }
    }

    private lateinit var importer: StatementImporter

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    /** Recibe un extracto PDF compartido desde otra app (Compartir → Saldo) o abierto con Saldo. */
    private fun handleShare(intent: Intent?) {
        val uri: Uri? = when (intent?.action) {
            Intent.ACTION_SEND -> IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
            Intent.ACTION_VIEW -> intent.data
            else -> null
        }
        uri?.let { importer.open(it) }
    }
}

internal enum class Tab(val label: String, val icon: ImageVector) {
    Home("Inicio", Icons.Filled.Home),
    Movements("Movimientos", Icons.AutoMirrored.Filled.List),
    Charts("Gráficas", Icons.Filled.BarChart),
    Settings("Ajustes", Icons.Filled.Settings),
}

@Composable
private fun SaldoApp(repo: Repository, importer: StatementImporter) {
    val context = LocalContext.current
    val movements by repo.movements.collectAsStateWithLifecycle()
    val apps by repo.apps.collectAsStateWithLifecycle()
    val anchor by repo.anchor.collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    var month by remember { mutableStateOf(YearMonth.now()) }
    var hide by rememberSaveable { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Movement?>(null) }
    var adding by remember { mutableStateOf(false) }
    var settingBalance by remember { mutableStateOf(false) }
    var listenerEnabled by remember { mutableStateOf(BankNotificationListener.isEnabled(context)) }
    var booting by rememberSaveable { mutableStateOf(true) }
    var toast by remember { mutableStateOf<ToastMsg?>(null) }
    val importState by importer.state.collectAsStateWithLifecycle()
    val pickPdf = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { importer.open(it) }
    }
    val openImport = { pickPdf.launch(arrayOf("application/pdf")) }
    LaunchedEffect(importState) {
        val done = importState as? ImportState.Done ?: return@LaunchedEffect
        val st = done.plan.statement
        toast = ToastMsg(
            "extracto importado",
            if (done.added > 0) "${done.added} movimientos nuevos" + (st.bank?.let { " · $it" } ?: "")
            else "Saldo actualizado" + (st.bank?.let { " · $it" } ?: ""),
            C.Cyan,
        )
        // Lleva al mes del extracto para ver lo importado
        st.to?.let { month = YearMonth.from(it) }
        if (done.added > 0) tab = Tab.Movements
        importer.dismiss()
    }

    LifecycleResumeEffect(Unit) {
        listenerEnabled = BankNotificationListener.isEnabled(context)
        onPauseOrDispose { }
    }

    val balance = BalanceCalculator.current(movements, anchor)
    val openListenerSettings = {
        context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    CompositionLocalProvider(LocalHideAmounts provides hide) {
        CosmicBackground {
            Scaffold(
                containerColor = Color.Transparent,
                floatingActionButton = {
                    if (tab == Tab.Home || tab == Tab.Movements) DiamondButton(onClick = { adding = true }) {
                        Icon(Icons.Filled.Add, "Añadir movimiento", tint = C.Void, modifier = Modifier.size(28.dp))
                    }
                },
                bottomBar = { HoloNavBar(tab) { tab = it } },
            ) { padding ->
                val scan = rememberPulseOn(tab, 520)
                Box(
                    Modifier
                        .padding(top = padding.calculateTopPadding())
                        .drawWithContent {
                            drawContent()
                            // Línea de escaneo que barre la pantalla al cambiar de pestaña
                            if (scan < 1f) {
                                val y = size.height * scan
                                drawRect(
                                    Brush.verticalGradient(listOf(Color.Transparent, C.Cyan.copy(alpha = 0.18f * (1 - scan))), y - 140f, y),
                                    Offset(0f, y - 140f), androidx.compose.ui.geometry.Size(size.width, 140f),
                                )
                                drawLine(C.Cyan.copy(alpha = 0.8f * (1 - scan)), Offset(0f, y), Offset(size.width, y), 2f)
                            }
                        }
                ) {
                  AnimatedContent(
                    targetState = tab,
                    transitionSpec = {
                        val dir = if (targetState.ordinal > initialState.ordinal) 1 else -1
                        (slideInHorizontally(tween(380)) { it / 4 * dir } + fadeIn(tween(300)) + scaleIn(tween(380), initialScale = 0.96f)) togetherWith
                            (slideOutHorizontally(tween(300)) { -it / 4 * dir } + fadeOut(tween(200)) + scaleOut(tween(300), targetScale = 1.04f))
                    },
                    label = "tabs",
                  ) { shown ->
                    when (shown) {
                        Tab.Home -> HomeScreen(
                            month = month, onMonth = { month = it }, hide = hide, onToggleHide = { hide = !hide },
                            movements = movements, currentBalance = balance, anchor = anchor,
                            listenerEnabled = listenerEnabled, onEnableListener = openListenerSettings,
                            onSetBalance = { settingBalance = true }, onOpen = { editing = it },
                            onSeeAll = { tab = Tab.Movements },
                        )
                        Tab.Movements -> MovementsScreen(
                            month, { month = it }, hide, { hide = !hide }, movements, onImport = openImport, onOpen = { editing = it },
                        )
                        Tab.Charts -> ChartsScreen(movements, hide)
                        Tab.Settings -> SettingsScreen(
                            listenerEnabled = listenerEnabled, onOpenListenerSettings = openListenerSettings,
                            apps = apps, onToggleApp = { pkg, on -> repo.setAppEnabled(pkg, on) },
                            onSetBalance = { settingBalance = true }, onImport = openImport,
                        )
                    }
                  }
                }
            }
            HoloToast(toast) { toast = null }
        }

        if (adding || editing != null) {
            MovementDialog(
                initial = editing,
                onDismiss = { adding = false; editing = null },
                onSave = {
                    repo.save(it)
                    toast = ToastMsg(
                        if (editing == null) "registro creado" else "registro actualizado",
                        "${it.merchant} · ${euros(it.signed, signed = true, hide = hide)}",
                        if (it.isIncome) C.Income else C.Cyan,
                    )
                    adding = false; editing = null
                },
                onDelete = {
                    repo.delete(it.id)
                    toast = ToastMsg("registro eliminado", it.merchant, C.Expense)
                    editing = null
                },
            )
        }
        if (settingBalance) {
            BalanceDialog(
                current = balance,
                onDismiss = { settingBalance = false },
                onSave = {
                    repo.setCurrentBalance(it)
                    toast = ToastMsg("saldo calibrado", euros(it, hide = hide), C.Violet)
                    settingBalance = false
                },
            )
        }
        ImportOverlay(
            state = importState, hide = hide,
            onPassword = importer::submitPassword, onConfirm = importer::confirm, onDismiss = importer::dismiss,
        )
        AnimatedVisibility(booting, exit = fadeOut(tween(1))) { BootSequence { booting = false } }
    }
}

/** Barra de navegación flotante de cristal con un indicador luminoso que se desliza entre pestañas. */
@Composable
internal fun HoloNavBar(current: Tab, onSelect: (Tab) -> Unit) {
    val pos by animateFloatAsState(
        current.ordinal.toFloat(), spring(dampingRatio = 0.62f, stiffness = 260f), label = "pos",
    )
    val haptic = LocalHapticFeedback.current
    BoxWithConstraints(
        Modifier
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .fillMaxWidth()
            .clip(chamfer(16.dp))
            .background(C.Void.copy(alpha = 0.94f))
            .holoPanel(16.dp, fill = C.Violet.copy(alpha = 0.10f)),
    ) {
        val itemW = maxWidth / Tab.entries.size
        // Foco de luz que se desliza
        Box(
            Modifier
                .offset(x = itemW * pos)
                .width(itemW)
                .height(68.dp)
                .drawBehind {
                    drawRect(Brush.verticalGradient(listOf(C.Cyan.copy(alpha = 0.16f), Color.Transparent)))
                    drawLine(
                        Brush.horizontalGradient(listOf(Color.Transparent, C.Cyan, C.Magenta, Color.Transparent)),
                        Offset(size.width * 0.15f, 1f), Offset(size.width * 0.85f, 1f), 3f,
                    )
                }
        )
        Row(Modifier.padding(vertical = 6.dp)) {
            Tab.entries.forEach { t ->
                val glow = (1f - kotlin.math.abs(pos - t.ordinal)).coerceIn(0f, 1f)
                Column(
                    Modifier.weight(1f).bounceClick(haptic = false) {
                        if (t != current) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelect(t)
                    }.padding(vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        t.icon, t.label, tint = lerp(C.Muted, C.Cyan, glow),
                        modifier = Modifier.size(22.dp).graphicsLayer { val sc = 1f + 0.15f * glow; scaleX = sc; scaleY = sc; translationY = -3f * glow },
                    )
                    Text(
                        t.label.uppercase(esLocale), color = lerp(C.Muted, C.Text, glow), fontFamily = Mono,
                        fontSize = 9.sp, letterSpacing = 1.sp, modifier = Modifier.padding(top = 3.dp), maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun BalanceDialog(current: Double?, onDismiss: () -> Unit, onSave: (Double) -> Unit) {
    var text by remember { mutableStateOf(current?.let { euros(it).removeSuffix(" €") } ?: "") }
    val value = NotificationParser.parseNumber(text.trim().removePrefix("-"))?.let { if (text.trim().startsWith("-")) -it else it }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Deep,
        shape = chamfer(22.dp),
        modifier = Modifier.border(1.dp, C.holoSoft, chamfer(22.dp)),
        title = {
            Column {
                HudLabel("calibración", C.Cyan)
                Text("Saldo actual", color = C.Text, fontFamily = Display, fontSize = 20.sp)
            }
        },
        text = {
            Column {
                Text("¿Cuánto dinero tienes ahora mismo en tu cuenta?", color = C.Muted)
                OutlinedTextField(
                    value = text, onValueChange = { text = it }, singleLine = true,
                    label = { Text("Saldo (€)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    textStyle = TextStyle(fontFamily = Mono, fontSize = 20.sp), colors = holoFieldColors(),
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        },
        confirmButton = {
            TextButton(enabled = value != null, onClick = { onSave(value!!) }) {
                Text("GUARDAR", color = C.Cyan, fontFamily = Mono, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("CANCELAR", color = C.Muted, fontFamily = Mono, letterSpacing = 2.sp) } },
    )
}
