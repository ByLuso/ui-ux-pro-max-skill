package com.byluso.saldo.data

import android.content.Context
import android.net.Uri
import com.byluso.saldo.parser.StatementParser
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ImportState {
    data object Idle : ImportState
    data object Reading : ImportState
    data class NeedsPassword(val wrong: Boolean) : ImportState
    data class Preview(val plan: ImportPlan) : ImportState
    data class Error(val message: String) : ImportState
    data class Done(val plan: ImportPlan, val added: Int) : ImportState
}

/** Lee un extracto en PDF (compartido desde otra app o elegido a mano) y lo importa. */
class StatementImporter private constructor(context: Context, private val repo: Repository) {
    private val app = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var bytes: ByteArray? = null

    private val _state = MutableStateFlow<ImportState>(ImportState.Idle)
    val state: StateFlow<ImportState> = _state.asStateFlow()

    fun open(uri: Uri) {
        _state.value = ImportState.Reading
        scope.launch {
            bytes = try {
                app.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            } catch (_: Exception) {
                null
            }
            if (bytes == null) {
                _state.value = ImportState.Error("No se ha podido abrir el archivo.")
                return@launch
            }
            read(null)
        }
    }

    fun submitPassword(password: String) {
        _state.value = ImportState.Reading
        scope.launch { read(password) }
    }

    private suspend fun read(password: String?) {
        val started = System.currentTimeMillis()
        val result: ImportState = try {
            PDFBoxResourceLoader.init(app)
            val text = PDDocument.load(bytes, password ?: "").use { doc ->
                PDFTextStripper().apply { sortByPosition = true }.getText(doc)
            }
            val statement = StatementParser.parse(text)
            when {
                text.isBlank() -> ImportState.Error(
                    "Este PDF es una imagen escaneada y no contiene texto. Descarga el extracto desde la app o la web del banco."
                )
                statement.lines.isEmpty() -> ImportState.Error(
                    "No he encontrado movimientos en este PDF. ¿Es un extracto de cuenta o de tarjeta?"
                )
                else -> ImportState.Preview(repo.planImport(statement))
            }
        } catch (_: InvalidPasswordException) {
            ImportState.NeedsPassword(wrong = password != null)
        } catch (_: Exception) {
            ImportState.Error("No se ha podido leer el PDF. Puede que esté dañado o no sea un extracto.")
        }
        // Deja ver la animación de análisis aunque el PDF sea pequeño
        delay((1400 - (System.currentTimeMillis() - started)).coerceAtLeast(0))
        _state.value = result
    }

    /** Importa el extracto previsualizado; [account] null = cuenta principal. */
    fun confirm(account: String? = null) {
        val plan = (_state.value as? ImportState.Preview)?.plan ?: return
        _state.value = ImportState.Reading
        scope.launch {
            val added = repo.applyImport(plan, account?.trim()?.takeIf { it.isNotEmpty() })
            _state.value = ImportState.Done(plan, added)
        }
    }

    fun dismiss() {
        bytes = null
        _state.value = ImportState.Idle
    }

    companion object {
        @Volatile private var instance: StatementImporter? = null

        /** Única instancia: así la importación sobrevive a giros de pantalla. */
        fun get(context: Context, repo: Repository): StatementImporter =
            instance ?: synchronized(this) { instance ?: StatementImporter(context, repo).also { instance = it } }
    }
}
