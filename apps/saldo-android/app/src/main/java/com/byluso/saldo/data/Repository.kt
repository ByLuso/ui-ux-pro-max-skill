package com.byluso.saldo.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.byluso.saldo.parser.Categories
import com.byluso.saldo.parser.NotificationParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private class Db(context: Context) : SQLiteOpenHelper(context, "saldo.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE movements(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL,
                is_income INTEGER NOT NULL,
                merchant TEXT NOT NULL,
                category TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                source_app TEXT,
                raw_text TEXT,
                balance REAL)"""
        )
        db.execSQL("CREATE INDEX idx_mov_ts ON movements(timestamp)")
        db.execSQL(
            """CREATE TABLE apps(
                pkg TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                hits INTEGER NOT NULL DEFAULT 0)"""
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
}

/** Fuente única de datos de la app. Los listados se exponen como StateFlow para Compose. */
class Repository private constructor(context: Context) {
    private val db = Db(context.applicationContext)
    private val prefs = context.applicationContext.getSharedPreferences("saldo", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _movements = MutableStateFlow<List<Movement>>(emptyList())
    val movements: StateFlow<List<Movement>> = _movements.asStateFlow()

    private val _apps = MutableStateFlow<List<SourceApp>>(emptyList())
    val apps: StateFlow<List<SourceApp>> = _apps.asStateFlow()

    private val _anchor = MutableStateFlow(readAnchor())
    val anchor: StateFlow<BalanceAnchor?> = _anchor.asStateFlow()

    init {
        scope.launch { reload() }
    }

    // ---------- Movimientos ----------

    fun save(m: Movement) = scope.launch {
        val values = ContentValues().apply {
            put("amount", m.amount)
            put("is_income", if (m.isIncome) 1 else 0)
            put("merchant", m.merchant)
            put("category", m.category)
            put("timestamp", m.timestamp)
            put("source_app", m.sourceApp)
            put("raw_text", m.rawText)
            if (m.balance != null) put("balance", m.balance) else putNull("balance")
        }
        if (m.id == 0L) db.writableDatabase.insert("movements", null, values)
        else db.writableDatabase.update("movements", values, "id = ?", arrayOf(m.id.toString()))
        reload()
    }

    fun delete(id: Long) = scope.launch {
        db.writableDatabase.delete("movements", "id = ?", arrayOf(id.toString()))
        reload()
    }

    // ---------- Saldo ----------

    fun setCurrentBalance(value: Double) {
        writeAnchor(BalanceAnchor(value, System.currentTimeMillis()))
    }

    private fun readAnchor(): BalanceAnchor? {
        val value = prefs.getString("anchor_value", null)?.toDoubleOrNull() ?: return null
        return BalanceAnchor(value, prefs.getLong("anchor_ts", 0))
    }

    private fun writeAnchor(a: BalanceAnchor) {
        prefs.edit().putString("anchor_value", a.value.toString()).putLong("anchor_ts", a.timestamp).apply()
        _anchor.value = a
    }

    // ---------- Apps de origen ----------

    fun setAppEnabled(pkg: String, enabled: Boolean) = scope.launch {
        db.writableDatabase.update(
            "apps", ContentValues().apply { put("enabled", if (enabled) 1 else 0) },
            "pkg = ?", arrayOf(pkg),
        )
        reload()
    }

    private fun appEnabled(pkg: String, label: String, now: Long): Boolean {
        val w = db.writableDatabase
        w.rawQuery("SELECT enabled FROM apps WHERE pkg = ?", arrayOf(pkg)).use { c ->
            if (c.moveToFirst()) {
                w.execSQL("UPDATE apps SET last_seen = ?, hits = hits + 1 WHERE pkg = ?", arrayOf<Any>(now, pkg))
                return c.getInt(0) == 1
            }
        }
        val enabled = pkg in BankApps.known
        w.insert("apps", null, ContentValues().apply {
            put("pkg", pkg)
            put("label", BankApps.known[pkg] ?: label)
            put("enabled", if (enabled) 1 else 0)
            put("last_seen", now)
            put("hits", 1)
        })
        return enabled
    }

    // ---------- Notificaciones ----------

    /**
     * Procesa una notificación entrante. Se llama desde el NotificationListenerService.
     * Devuelve true si se ha registrado un movimiento o un saldo.
     */
    fun onNotification(pkg: String, appLabel: String, title: String?, text: String?, postTime: Long): Boolean {
        if (pkg in BankApps.ignored) return false
        val full = listOfNotNull(title, text).joinToString(" · ")
        val isKnownBank = pkg in BankApps.known
        if (!isKnownBank && !NotificationParser.looksFinancial(full)) return false

        val parsed = NotificationParser.parse(title, text, isWallet = pkg in BankApps.wallets) ?: return false
        val enabled = synchronized(this) { appEnabled(pkg, appLabel, postTime) }
        if (!enabled) {
            scope.launch { reload() }
            return false
        }

        if (parsed.category == Categories.BALANCE_ONLY) {
            writeAnchor(BalanceAnchor(parsed.balance!!, postTime))
            return true
        }

        synchronized(this) {
            // Evita duplicados: las apps a veces vuelven a publicar la misma notificación.
            val dup = db.readableDatabase.rawQuery(
                "SELECT 1 FROM movements WHERE source_app = ? AND raw_text = ? AND ABS(timestamp - ?) < 600000 LIMIT 1",
                arrayOf(pkg, full, postTime.toString()),
            ).use { it.moveToFirst() }
            if (dup) return false

            // Un pago con Google Wallet genera dos avisos: el de Wallet y el del banco.
            // Si otra app ya registró el mismo importe hace menos de 5 minutos, es el mismo
            // movimiento: solo aprovechamos el saldo si este aviso lo trae.
            val twinId = db.readableDatabase.rawQuery(
                """SELECT id FROM movements WHERE source_app IS NOT NULL AND source_app != ?
                   AND is_income = ? AND ABS(amount - ?) < 0.005 AND ABS(timestamp - ?) < 300000
                   ORDER BY ABS(timestamp - ?) LIMIT 1""",
                arrayOf(pkg, if (parsed.isIncome) "1" else "0", parsed.amount.toString(), postTime.toString(), postTime.toString()),
            ).use { if (it.moveToFirst()) it.getLong(0) else null }
            if (twinId != null) {
                if (parsed.balance != null) {
                    db.writableDatabase.update(
                        "movements", ContentValues().apply { put("balance", parsed.balance) },
                        "id = ?", arrayOf(twinId.toString()),
                    )
                    scope.launch { reload() }
                }
                return false
            }

            val values = ContentValues().apply {
                put("amount", parsed.amount)
                put("is_income", if (parsed.isIncome) 1 else 0)
                put("merchant", parsed.merchant)
                put("category", parsed.category)
                put("timestamp", postTime)
                put("source_app", pkg)
                put("raw_text", full)
                if (parsed.balance != null) put("balance", parsed.balance) else putNull("balance")
            }
            db.writableDatabase.insert("movements", null, values)
        }
        scope.launch { reload() }
        return true
    }

    // ---------- Carga ----------

    private fun reload() {
        val r = db.readableDatabase
        _movements.value = r.rawQuery("SELECT * FROM movements ORDER BY timestamp DESC", null).use { c ->
            buildList { while (c.moveToNext()) add(c.toMovement()) }
        }
        _apps.value = r.rawQuery("SELECT * FROM apps ORDER BY enabled DESC, last_seen DESC", null).use { c ->
            buildList {
                while (c.moveToNext()) add(
                    SourceApp(
                        pkg = c.getString(c.getColumnIndexOrThrow("pkg")),
                        label = c.getString(c.getColumnIndexOrThrow("label")),
                        enabled = c.getInt(c.getColumnIndexOrThrow("enabled")) == 1,
                        lastSeen = c.getLong(c.getColumnIndexOrThrow("last_seen")),
                        hits = c.getInt(c.getColumnIndexOrThrow("hits")),
                    )
                )
            }
        }
    }

    private fun Cursor.toMovement(): Movement {
        val balIdx = getColumnIndexOrThrow("balance")
        return Movement(
            id = getLong(getColumnIndexOrThrow("id")),
            amount = getDouble(getColumnIndexOrThrow("amount")),
            isIncome = getInt(getColumnIndexOrThrow("is_income")) == 1,
            merchant = getString(getColumnIndexOrThrow("merchant")),
            category = getString(getColumnIndexOrThrow("category")),
            timestamp = getLong(getColumnIndexOrThrow("timestamp")),
            sourceApp = getString(getColumnIndexOrThrow("source_app")),
            rawText = getString(getColumnIndexOrThrow("raw_text")),
            balance = if (isNull(balIdx)) null else getDouble(balIdx),
        )
    }

    companion object {
        @Volatile private var instance: Repository? = null
        fun get(context: Context): Repository =
            instance ?: synchronized(this) { instance ?: Repository(context).also { instance = it } }
    }
}
