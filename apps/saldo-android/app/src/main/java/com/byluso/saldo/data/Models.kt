package com.byluso.saldo.data

data class Movement(
    val id: Long = 0,
    /** Siempre positivo; el signo lo da [isIncome]. */
    val amount: Double,
    val isIncome: Boolean,
    val merchant: String,
    val category: String,
    val timestamp: Long,
    /** Paquete de la app que envió la notificación, o null si se añadió a mano. */
    val sourceApp: String? = null,
    val rawText: String? = null,
    /** Saldo que informó el banco tras este movimiento. */
    val balance: Double? = null,
    /** Tarjeta o cuenta secundaria de la que viene (p. ej. "Revolut"); null = cuenta principal. */
    val account: String? = null,
) {
    val signed: Double get() = if (isIncome) amount else -amount
}

data class SourceApp(
    val pkg: String,
    val label: String,
    val enabled: Boolean,
    val lastSeen: Long,
    val hits: Int,
)

/** Punto de referencia del saldo: fijado a mano o informado por el banco. */
data class BalanceAnchor(val value: Double, val timestamp: Long)

object BalanceCalculator {
    /**
     * Saldo actual = último saldo conocido (manual o de una notificación)
     * + todos los movimientos posteriores a ese momento.
     */
    fun current(all: List<Movement>, manual: BalanceAnchor?): Double? {
        // Solo la cuenta principal: las demás tarjetas tienen su propio saldo
        val movements = all.filter { it.account == null }
        val fromMovements = movements.filter { it.balance != null }
            .maxByOrNull { it.timestamp }
            ?.let { BalanceAnchor(it.balance!!, it.timestamp) }
        val anchor = listOfNotNull(manual, fromMovements).maxByOrNull { it.timestamp } ?: return null
        return anchor.value + movements.filter { it.timestamp > anchor.timestamp }.sumOf { it.signed }
    }
}
