package com.byluso.saldo.data

import com.byluso.saldo.parser.Statement
import com.byluso.saldo.parser.StatementLine

/** Resultado de comparar un extracto con lo que ya hay en la app. */
data class ImportPlan(
    val statement: Statement,
    /** Movimientos que no estaban registrados y se van a añadir. */
    val fresh: List<StatementLine>,
    /** Movimientos que ya estaban (capturados por notificación o añadidos a mano). */
    val duplicates: List<StatementLine>,
    /** Saldos del extracto que se aplicarán a movimientos ya existentes (id, saldo). */
    val balanceUpdates: List<Pair<Long, Double>>,
    /** Ids de los movimientos ya registrados que coinciden con una línea del extracto. */
    val matchedIds: List<Long> = emptyList(),
)
