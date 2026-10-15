package com.byluso.saldo

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
        setContent { SaldoTheme { SaldoApp(repo) } }
    }
}

internal enum class Tab(val label: String, val icon: ImageVector) {
    Home("Inicio", Icons.Filled.Home),
    Movements("Movimientos", Icons.AutoMirrored.Filled.List),
    Charts("Gráficas", Icons.Filled.BarChart),
    Settings("Ajustes", Icons.Filled.Settings),
}

@Composable
private fun SaldoApp(repo: Repository) {
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
                Box(Modifier.padding(top = padding.calculateTopPadding())) {
                    when (tab) {
                        Tab.Home -> HomeScreen(
                            month = month, onMonth = { month = it }, hide = hide, onToggleHide = { hide = !hide },
                            movements = movements, currentBalance = balance, anchor = anchor,
                            listenerEnabled = listenerEnabled, onEnableListener = openListenerSettings,
                            onSetBalance = { settingBalance = true }, onOpen = { editing = it },
                            onSeeAll = { tab = Tab.Movements },
                        )
                        Tab.Movements -> MovementsScreen(
                            month, { month = it }, hide, { hide = !hide }, movements, onOpen = { editing = it },
                        )
                        Tab.Charts -> ChartsScreen(movements, hide)
                        Tab.Settings -> SettingsScreen(
                            listenerEnabled = listenerEnabled, onOpenListenerSettings = openListenerSettings,
                            apps = apps, onToggleApp = { pkg, on -> repo.setAppEnabled(pkg, on) },
                            onSetBalance = { settingBalance = true },
                        )
                    }
                }
            }
        }

        if (adding || editing != null) {
            MovementDialog(
                initial = editing,
                onDismiss = { adding = false; editing = null },
                onSave = { repo.save(it); adding = false; editing = null },
                onDelete = { repo.delete(it.id); editing = null },
            )
        }
        if (settingBalance) {
            BalanceDialog(
                current = balance,
                onDismiss = { settingBalance = false },
                onSave = { repo.setCurrentBalance(it); settingBalance = false },
            )
        }
    }
}

/** Barra de navegación flotante de cristal con indicador luminoso. */
@Composable
internal fun HoloNavBar(current: Tab, onSelect: (Tab) -> Unit) {
    Row(
        Modifier
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .fillMaxWidth()
            .clip(chamfer(16.dp))
            .background(C.Void.copy(alpha = 0.94f))
            .holoPanel(16.dp, fill = C.Violet.copy(alpha = 0.10f))
            .padding(vertical = 6.dp),
    ) {
        Tab.entries.forEach { t ->
            val selected = t == current
            val glow by animateFloatAsState(if (selected) 1f else 0f, tween(350), label = "glow")
            Column(
                Modifier.weight(1f).clickable { onSelect(t) }.padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(t.icon, t.label, tint = lerp(C.Muted, C.Cyan, glow), modifier = Modifier.size(22.dp))
                Text(
                    t.label.uppercase(esLocale), color = lerp(C.Muted, C.Text, glow), fontFamily = Mono,
                    fontSize = 9.sp, letterSpacing = 1.sp, modifier = Modifier.padding(top = 3.dp), maxLines = 1,
                )
                Box(
                    Modifier.padding(top = 5.dp).width(28.dp * glow).height(2.dp)
                        .background(Brush.horizontalGradient(listOf(C.Cyan, C.Magenta)))
                )
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
