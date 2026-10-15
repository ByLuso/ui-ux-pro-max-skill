package com.byluso.saldo.data

/** Apps de bancos y pagos que se escuchan por defecto. Cualquier otra app que envíe
 *  una notificación con importes aparece en Ajustes para activarla a mano. */
object BankApps {
    val known = mapOf(
        "com.bbva.bbvacontigo" to "BBVA",
        "es.lacaixa.mobile.android.newwapicon" to "CaixaBank",
        "com.imaginbank.app" to "imagin",
        "es.bancosantander.apps" to "Santander",
        "es.openbank.mobile" to "Openbank",
        "www.ingdirect.nativeframe" to "ING",
        "net.inverline.bancosabadell.officelocator.android" to "Sabadell",
        "com.bankinter.launcher" to "Bankinter",
        "es.evobanco.bancamovil" to "EVO Banco",
        "es.univia.unicajamovil" to "Unicaja",
        "com.kutxabank.android" to "Kutxabank",
        "es.cajamar.cajamar" to "Cajamar",
        "com.rsi" to "Caja Rural",
        "com.revolut.revolut" to "Revolut",
        "de.number26.android" to "N26",
        "com.transferwise.android" to "Wise",
        "com.paypal.android.p2pmobile" to "PayPal",
        "com.google.android.apps.walletnfcrel" to "Google Wallet",
        "com.samsung.android.spay" to "Samsung Wallet",
        "com.myinvestor.app" to "MyInvestor",
        "com.bunq.android" to "bunq",
        "com.vivid.money" to "Vivid",
        "com.trade_republic.app" to "Trade Republic",
    )

    /** Apps de mensajería donde un "20 €" casi nunca es un movimiento real. */
    val ignored = setOf(
        "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.google.android.gm",
        "com.instagram.android", "com.facebook.orca", "com.google.android.apps.messaging",
        "com.samsung.android.messaging", "com.android.systemui",
    )
}
