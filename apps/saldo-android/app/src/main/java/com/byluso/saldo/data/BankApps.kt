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
        "es.unicajabanco.app" to "Unicaja",
        "com.kutxabank.android" to "Kutxabank",
        "com.grupocajamar.wefferent" to "Cajamar",
        "com.rsi.nba" to "Ruralvía",
        "com.revolut.revolut" to "Revolut",
        "de.number26.android" to "N26",
        "com.transferwise.android" to "Wise",
        "com.paypal.android.p2pmobile" to "PayPal",
        "com.google.android.apps.walletnfcrel" to "Google Wallet",
        "com.samsung.android.spay" to "Samsung Wallet",
        "com.myinvestor.es" to "MyInvestor",
        "com.bunq.android" to "bunq",
        "de.traderepublic.app" to "Trade Republic",
        "com.abanca.bancamovil.particulares" to "Abanca",
        "es.ibercaja.ibercajaapp" to "Ibercaja",
        "com.icb.pibank.app" to "Pibank",
        "es.bizum.wallet" to "Bizum",
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
    )

    /** Carteras de pago: su notificación es "Comercio" + "23,45 € · Visa ••1234",
     *  sin palabras como "compra" o "pago", así que se asume gasto por defecto. */
    val wallets = setOf(
        "com.google.android.apps.walletnfcrel",
        "com.google.android.apps.nbu.paisa.user",
        "com.samsung.android.spay",
    )

    /** Apps de mensajería donde un "20 €" casi nunca es un movimiento real. */
    val ignored = setOf(
        "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.google.android.gm",
        "com.instagram.android", "com.facebook.orca", "com.google.android.apps.messaging",
        "com.samsung.android.messaging", "com.android.systemui",
    )
}
