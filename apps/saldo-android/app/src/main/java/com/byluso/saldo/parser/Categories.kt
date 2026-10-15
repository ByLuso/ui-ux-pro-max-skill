package com.byluso.saldo.parser

import java.util.Locale

/** Categorías de gasto con colores y palabras clave para asignarlas automáticamente. */
object Categories {
    const val BALANCE_ONLY = "__saldo__"
    const val INCOME = "Ingresos"
    const val OTHER = "Otros"

    data class Category(val name: String, val emoji: String, val color: Long, val keywords: List<String>)

    val all = listOf(
        Category("Hogar", "🏠", 0xFF8A5CFF, listOf("alquiler", "hipoteca", "iberdrola", "endesa", "naturgy", "repsol luz", "agua", "canal de isabel", "ikea", "leroy", "comunidad", "gas natural", "holaluz", "totalenergies")),
        Category("Comida", "🛒", 0xFFFF9F1C, listOf("mercadona", "carrefour", "lidl", "aldi", "supermercados dia", "dia%", "eroski", "alcampo", "consum", "hipercor", "supermercado", "bonpreu", "ahorramas", "froiz", "gadis", "covirán", "coviran", "mas y mas", "spar", "fruteria", "carniceria", "panaderia")),
        Category("Restaurantes", "🍔", 0xFFFF3DCB, listOf("starbucks", "mcdonald", "burger", "kfc", "telepizza", "domino", "glovo", "just eat", "uber eats", "deliveroo", "restaurante", "bar ", "cafeteria", "café", "cafe ", "100 montaditos", "foster", "vips", "goiko", "taberna", "pizzeria", "five guys", "tgb", "rodilla")),
        Category("Transporte", "🚗", 0xFF00B4FF, listOf("uber", "cabify", "bolt", "renfe", "metro", "emt", "tmb", "alsa", "repsol", "cepsa", "galp", "bp ", "shell", "gasolinera", "parking", "aparcamiento", "peaje", "blablacar", "iryo", "ouigo", "vueling", "ryanair", "iberia", "taxi", "freenow", "carburante")),
        Category("Ocio", "🎮", 0xFFB388FF, listOf("cine", "yelmo", "cinesa", "steam", "playstation", "nintendo", "xbox", "ticketmaster", "entradas", "fnac", "gimnasio", "basic fit", "teatro", "concierto", "museo", "booking", "airbnb", "hotel")),
        Category("Suscripciones", "📺", 0xFF00E5FF, listOf("netflix", "spotify", "hbo", "max ", "disney", "prime video", "amazon prime", "apple.com", "icloud", "google one", "youtube", "dazn", "movistar", "vodafone", "orange", "digi", "yoigo", "pepephone", "masmovil", "o2 ", "lowi", "chatgpt", "openai", "claude", "anthropic")),
        Category("Salud", "💊", 0xFF3DFFB0, listOf("farmacia", "sanitas", "adeslas", "dkv", "mapfre salud", "dentista", "clinica", "clínica", "hospital", "optica", "óptica", "fisio", "medico", "médico")),
        Category("Ropa", "👕", 0xFFFFD166, listOf("zara", "bershka", "pull&bear", "pull and bear", "stradivarius", "massimo dutti", "h&m", "primark", "mango", "decathlon", "nike", "adidas", "shein", "springfield", "lefties", "kiabi", "el corte ingles", "el corte inglés", "jd sports", "foot locker", "vinted", "zalando")),
        Category("Compras", "🛍️", 0xFFFF4D6D, listOf("amazon", "aliexpress", "temu", "mediamarkt", "media markt", "pccomponentes", "apple store", "miravia", "wallapop", "ebay", "flying tiger")),
        Category("Efectivo", "💶", 0xFF9AA5C4, listOf("cajero", "retirada", "reintegro", "atm")),
        Category("Bizum", "📲", 0xFF2EF2D0, listOf("bizum")),
        Category(OTHER, "📦", 0xFF7D89A6, emptyList()),
    )

    private val incomeCategory = Category(INCOME, "💰", 0xFF3DFFB0, emptyList())

    fun byName(name: String): Category =
        if (name == INCOME) incomeCategory else all.firstOrNull { it.name == name } ?: all.last()

    val expenseNames: List<String> get() = all.map { it.name }

    fun guess(merchant: String, fullText: String, isIncome: Boolean): String {
        if (isIncome) return INCOME
        val m = " " + merchant.lowercase(Locale.ROOT) + " "
        all.firstOrNull { c -> c.keywords.any { m.contains(it) } }?.let { return it.name }
        val t = " " + fullText.lowercase(Locale.ROOT) + " "
        all.firstOrNull { c -> c.keywords.any { t.contains(it) } }?.let { return it.name }
        return OTHER
    }
}
