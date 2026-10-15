package com.byluso.saldo

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
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
        super.onCreate(savedInstanceState)
        val repo = Repository.get(this)
        setContent { SaldoTheme { SaldoApp(repo) } }
    }
}

private enum class Tab(val label: String, val icon: ImageVector) {
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
        Scaffold(
            containerColor = C.Bg,
            floatingActionButton = {
                if (tab == Tab.Home || tab == Tab.Movements) FloatingActionButton(
                    onClick = { adding = true }, shape = CircleShape,
                    containerColor = C.Accent, contentColor = C.OnAccent,
                ) { Icon(Icons.Filled.Add, "Añadir movimiento") }
            },
            bottomBar = {
                NavigationBar(containerColor = C.Header) {
                    Tab.entries.forEach { t ->
                        NavigationBarItem(
                            selected = tab == t, onClick = { tab = t },
                            icon = { Icon(t.icon, t.label) }, label = { Text(t.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = C.Accent, selectedTextColor = C.Accent,
                                unselectedIconColor = C.Muted, unselectedTextColor = C.Muted,
                                indicatorColor = C.Accent.copy(alpha = 0.15f),
                            ),
                        )
                    }
                }
            },
        ) { padding ->
            Box(Modifier.padding(padding)) {
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

@Composable
private fun BalanceDialog(current: Double?, onDismiss: () -> Unit, onSave: (Double) -> Unit) {
    var text by remember { mutableStateOf(current?.let { euros(it).removeSuffix(" €") } ?: "") }
    val value = NotificationParser.parseNumber(text.trim().removePrefix("-"))?.let { if (text.trim().startsWith("-")) -it else it }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = C.Card,
        title = { Text("Saldo actual", color = C.Text) },
        text = {
            Column {
                Text("¿Cuánto dinero tienes ahora mismo en tu cuenta?", color = C.Muted)
                OutlinedTextField(
                    value = text, onValueChange = { text = it }, singleLine = true,
                    label = { Text("Saldo (€)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        },
        confirmButton = { TextButton(enabled = value != null, onClick = { onSave(value!!) }) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar", color = C.Muted) } },
    )
}
