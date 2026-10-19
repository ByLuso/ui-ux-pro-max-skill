package com.byluso.saldo.advisor

import com.byluso.saldo.data.Movement
import com.byluso.saldo.parser.Categories

/**
 * Qué cuenta como gasto e ingreso real en los movimientos de un mes.
 *
 * Las recargas a otras tarjetas no son gasto: el gasto de verdad son las compras que haces con
 * esa tarjeta. Si has importado el extracto de la tarjeta para ese mes, cuentan sus compras y la
 * recarga se ignora; si no, la recarga cuenta como "Recargas tarjeta" para no perder ese dinero.
 * Lo que mandas a ahorro o inversión tampoco es gasto: queda como ahorro.
 */
object Spending {
    /** Hay movimientos de alguna tarjeta o cuenta secundaria este mes. */
    fun hasCardDetail(month: List<Movement>) = month.any { it.account != null }

    fun expenses(month: List<Movement>): List<Movement> {
        val detailed = hasCardDetail(month)
        return month.filter { m ->
            !m.isIncome && when (m.category) {
                Categories.SAVINGS -> false
                Categories.TOP_UP -> !detailed && m.account == null
                else -> true
            }
        }
    }

    /** Ingresos reales: ni recargas que llegan a la tarjeta ni dinero que vuelve del ahorro. */
    fun incomes(month: List<Movement>): List<Movement> =
        month.filter { it.isIncome && !Categories.isTransfer(it.category) }

    /** Recargas hechas desde la cuenta principal a otras tarjetas. */
    fun topUps(month: List<Movement>): Double =
        month.filter { !it.isIncome && it.account == null && it.category == Categories.TOP_UP }.sumOf { it.amount }

    /** Lo enviado a ahorro o inversión. */
    fun toSavings(month: List<Movement>): Double =
        month.filter { !it.isIncome && it.category == Categories.SAVINGS }.sumOf { it.amount }
}
