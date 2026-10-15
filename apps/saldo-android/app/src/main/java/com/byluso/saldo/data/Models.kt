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
    fun current(movements: List<Movement>, manual: BalanceAnchor?): Double? {
        val fromMovements = movements.filter { it.balance != null }
            .maxByOrNull { it.timestamp }
            ?.let { BalanceAnchor(it.balance!!, it.timestamp) }
        val anchor = listOfNotNull(manual, fromMovements).maxByOrNull { it.timestamp } ?: return null
        return anchor.value + movements.filter { it.timestamp > anchor.timestamp }.sumOf { it.signed }
    }
}
