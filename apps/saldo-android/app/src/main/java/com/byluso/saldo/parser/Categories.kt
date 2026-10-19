package com.byluso.saldo.parser

import java.util.Locale

/** Categorías de gasto con colores y palabras clave para asignarlas automáticamente. */
object Categories {
    const val BALANCE_ONLY = "__saldo__"
    const val INCOME = "Ingresos"
    /** Ingreso de nómina, sueldo o pensión: la base de los cálculos del Asesor. */
    const val SALARY = "Nómina"

    /** Conceptos que identifican una nómina. */
    val salaryWords = Regex("""\b(n[oó]mina|salario|sueldo|haberes|paga\s+extra|pensi[oó]n|payroll)\b""", RegexOption.IGNORE_CASE)
    const val OTHER = "Otros"

    /** Dinero que pasa a otra tarjeta o cuenta tuya: no es gasto, el gasto real está en esa tarjeta. */
    const val TOP_UP = "Recargas tarjeta"
    /** Dinero que mandas a ahorro o inversión: no es gasto, es ahorro. */
    const val SAVINGS = "Ahorro e inversión"

    data class Category(val name: String, val emoji: String, val color: Long, val keywords: List<String>)

    // El orden importa: gana la primera categoría con una palabra clave que encaje
    // (p. ej. "uber eats" es restaurante antes que taxi y "repsol luz" es luz antes que gasolina).
    val all = listOf(
        Category("Restaurantes", "🍔", 0xFFC98E8E, listOf("starbucks", "mcdonald", "burger", "kfc", "telepizza", "domino", "glovo", "just eat", "uber eats", "deliveroo", "restaurante", " bar ", "cafeteria", "cafetería", "café", "cafe ", "100 montaditos", "foster", "vips", "goiko", "taberna", "pizzeria", "pizzería", "five guys", "tgb", "rodilla", "tapas", "cerveceria", "cervecería", "llaollao", "dunkin", "tim hortons", "papa john", "sushi", "kebab", " wok", "asador", "meson", "mesón", "churreria", "heladeria", "heladería", "pasteleria", "tagliatella", "lizarran", "braseria", "taco bell", "popeyes", "ginos", "udon", "pans & company", "granier")),
        Category("Suministros", "💡", 0xFF8C9CC0, listOf("iberdrola", "endesa", "naturgy", "repsol luz", "repsol electricidad", "canal de isabel", "canal isabel", "gas natural", "holaluz", "totalenergies", "aguas de", " agua", "emasesa", "aigues", "aqualia", "lucera", "octopus", "factor energia", "som energia", "curenergia", "energia xxi", "energía xxi", "baser", "escandinava", "electricidad", "butano", " edp ")),
        Category("Hogar", "🏠", 0xFF7F8FB8, listOf("alquiler", "hipoteca", "comunidad de prop", "comunidad prop", "cdad prop", "ikea", "leroy", "bricomart", "bricodepot", "brico", "aki ", "maisons du monde", "jysk", "conforama", "ferreteria", "ferretería", "kave home", "zara home", "h&m home", "casa viva", "tiendas casa")),
        Category("Gasolina", "⛽", 0xFFD0A15F, listOf("gasolinera", "carburante", "combustible", "estacion de servicio", "estación de servicio", "e.s. ", "eess", "repsol", "cepsa", "moeve", "galp", "bp ", "shell", "petronor", "ballenoil", "plenoil", "petroprix", "esclatoil", "meroil", " disa ", " avia ", "low cost fuel", "gasexpress", "carrefour station", "alcampo gasol", "eroski gasol", "bonarea gasol", "staroil", "gasolin")),
        Category("Peajes", "🛣️", 0xFF8FA3B5, listOf("peaje", "autopista", " ap-", "abertis", "audasa", "aucat", "avasa", "aumar", "aulesa", "autema", "aucalsa", "audenasa", "acesa", "iberpistas", "itinere", "via-t", "via t ", "vía-t", "bip&drive", "bip & drive", "bipi", "henarsa", "ausol", "accesos de madrid", "tunel", "túnel", "autoestradas", "invicat")),
        Category("Parking", "🅿️", 0xFF7D9DB8, listOf("parking", "aparcamiento", "estacionamiento", "empark", "telpark", "easypark", " ora ", "zona azul", "zona verde", "indigo", "apk2", "elparking", "parclick", "interparking", "parquimetro", "parquímetro", "ser madrid")),
        Category("Taxi y VTC", "🚕", 0xFFC4B06E, listOf("uber", "cabify", "bolt", "freenow", "free now", "taxi", "radio taxi")),
        Category("Coche", "🔧", 0xFF8E9AA8, listOf("taller", " itv", "neumatic", "neumátic", "norauto", "feu vert", "midas", "lavado de", "lavado coche", "car wash", "elefante azul", "recambios", "confortauto", "euromaster", "first stop", "aurgi", "carglass", "renting", "ayvens", "leasys", "autolavado")),
        Category("Transporte", "🚆", 0xFF6FA2AF, listOf("renfe", "metro", " emt", "tmb", " alsa", "autobus", "autobús", " bus ", "avanza", "iryo", "ouigo", "avlo", "cercanias", "cercanías", "tranvia", "tranvía", "fgc", "euskotren", "tussam", "bilbobus", "auvasa", "dbus", "monbus", "blablacar", "bicimad", "bicing", "consorcio de transportes", "abono transporte", "recarga abono", "tarjeta transporte", "tarjeta de transporte")),
        Category("Viajes", "✈️", 0xFF7FA7C9, listOf("vueling", "ryanair", "iberia", "air europa", "volotea", "easyjet", "binter", "booking", "airbnb", "hotel", "hostal", "edreams", "expedia", "logitravel", "rumbo", "trivago", " nh ", "melia", "meliá", "barcelo", "barceló", "hilton", "marriott", "agoda", "lastminute", "destinia", " aena")),
        Category("Deporte", "🏋️", 0xFF79B39A, listOf("gimnasio", " gym", "basic fit", "basic-fit", "altafit", "mcfit", "synergym", "vivagym", "go fit", "anytime fitness", "fitness", "padel", "pádel", "playtomic", "piscina", "crossfit", "polideportivo")),
        Category("Suscripciones", "📺", 0xFF7FAFC6, listOf("netflix", "spotify", "hbo", "max ", "disney", "prime video", "amazon prime", "apple.com", "icloud", "google one", "youtube", "dazn", "movistar plus", "chatgpt", "openai", "claude", "anthropic", "filmin", "skyshowtime", "crunchyroll", "audible", "kindle unlimited", "patreon", "google play", "microsoft", "adobe", "canva", "dropbox", "notion", "github", "tidal", "deezer", "atresplayer", "playstation plus", "xbox game pass")),
        Category("Telefonía e internet", "📱", 0xFF86A9C2, listOf("movistar", "vodafone", "orange", "digi ", "digimobil", "yoigo", "pepephone", "masmovil", "másmóvil", "o2 ", "lowi", "simyo", "jazztel", "finetwork", "avatel", "adamo", "telefonica", "telefónica", "recarga movil", "recarga móvil", "recarga de movil", "recarga de móvil")),
        Category("Ocio", "🎮", 0xFFA08FBF, listOf("cine", "yelmo", "cinesa", "kinepolis", "steam", "playstation", "nintendo", "xbox", "ticketmaster", "entradas", "fnac", "teatro", "concierto", "museo", "discoteca", " pub ", "bolera", "escape room", "eventbrite", "atrapalo", "atrápalo", "wegow", "epic games", "twitch", "parque de atracciones", "zoo ")),
        Category("Estanco y apuestas", "🎲", 0xFFB49A8A, listOf("estanco", "tabaco", "tabac", "loteria", "lotería", "loterias", "loterías", "onlae", " once ", "apuestas", "bet365", "codere", "sportium", "bwin", "william hill", "luckia", "pokerstars", "casino", "primitiva", "euromillones")),
        Category("Comida", "🛒", 0xFFC9A46E, listOf("mercadona", "carrefour", "lidl", "aldi", "supermercados dia", " dia ", "dia%", "eroski", "alcampo", "consum", "hipercor", "supercor", "supermercado", "bonpreu", "ahorramas", "froiz", "gadis", "covirán", "coviran", "mas y mas", "masymas", " spar", "fruteria", "frutería", "carniceria", "carnicería", "panaderia", "panadería", "pescaderia", "pescadería", "charcuteria", "bm supermercados", "simply", "caprabo", "condis", "family cash", "leclerc", "ametller", "plusfresc", "costco", "makro", "gm cash", "hiber", "lupa ", "mercado")),
        Category("Mascotas", "🐾", 0xFFB7A27F, listOf("veterinari", "kiwoko", "tiendanimal", "zooplus", "mascota", "clinica veterinaria", "clínica veterinaria")),
        Category("Salud", "💊", 0xFF7FB79B, listOf("farmacia", "sanitas", "adeslas", "dkv", "asisa", "mapfre salud", "dentista", "dental", "clinica", "clínica", "hospital", "optica", "óptica", "fisio", "medico", "médico", "psicolog", "laboratorio", "podolog")),
        Category("Cuidado personal", "💇", 0xFFC79BAE, listOf("peluqueria", "peluquería", "barberia", "barbería", "barber", "estetica", "estética", "primor", "druni", "sephora", "douglas", "rituals", "perfumeria", "perfumería", "kiko", "manicura", "spa ", "depilacion", "depilación", "notino", "arenal", "clarel")),
        Category("Educación", "📚", 0xFF9C9BC4, listOf("academia", "universidad", "colegio", "matricula", "matrícula", "escuela", "guarderia", "guardería", "udemy", "coursera", "domestika", "platzi", "libreria", "librería", "casa del libro", "autoescuela", "uned", "duolingo", "papeleria", "papelería")),
        Category("Ropa", "👕", 0xFFCDB57E, listOf("zara", "bershka", "pull&bear", "pull and bear", "stradivarius", "massimo dutti", "h&m", "primark", "mango", "decathlon", "nike", "adidas", "shein", "springfield", "lefties", "kiabi", "el corte ingles", "el corte inglés", "jd sports", "foot locker", "vinted", "zalando", "uniqlo", "c&a", "cortefiel", "oysho", "tezenis", "calzedonia", "intimissimi", "women'secret", "sfera", "skechers", "deichmann", "pepe jeans", "levi's", "levis", "bimba", "parfois", "snipes", "sprinter")),
        Category("Compras", "🛍️", 0xFFBF8585, listOf("amazon", "aliexpress", "temu", "mediamarkt", "media markt", "pccomponentes", "apple store", "miravia", "wallapop", "ebay", "flying tiger", " action ", "tedi", "pepco", "bazar", "worten", " normal ", "game stop", "gamestop", "paypal")),
        Category("Seguros", "🛡️", 0xFF8BA8A0, listOf("seguro", "mapfre", "mutua", "linea directa", "línea directa", "allianz", "axa ", "generali", "reale", "zurich", "santa lucia", "santalucia", "santalucía", "ocaso", " verti ", "genesis", "catalana occidente", "pelayo", "liberty", " caser ", "helvetia", "occident")),
        Category("Impuestos y tasas", "🏛️", 0xFF9D9483, listOf("aeat", "agencia tributaria", "hacienda", "ayuntamiento", "ajuntament", "concello", " ibi ", "ivtm", "impuesto", "tasa ", "tasas", "multa", "dgt", "seguridad social", "tgss", "autonomo", "autónomo", "diputacion", "diputación", "recaudacion", "recaudación")),
        Category("Comisiones", "🏦", 0xFFA7A08E, listOf("comision", "comisión", "mantenimiento cuenta", "mantenimiento de cuenta", "cuota tarjeta", "cuota anual", "intereses", "descubierto", "gastos bancarios")),
        Category(SAVINGS, "💎", 0xFF5E9C82, listOf("myinvestor", "trade republic", "indexa", "finizens", "degiro", "interactive brokers", "binance", "coinbase", "kraken", "bitpanda", "etoro", "plan de pensiones", "plan pensiones", "fondo de inversion", "fondo de inversión", "inversion", "inversión", "deposito a plazo", "depósito a plazo", "cuenta ahorro", "cuenta de ahorro", "hucha")),
        Category(TOP_UP, "💳", 0xFF8E9FD0, listOf("recarga", "revolut", "n26", " wise", "bunq", "bnext", "vivid", "prepago", "liquidacion tarjeta", "liquidación tarjeta", "liquidacion de tarjeta", "pago tarjeta credito", "pago tarjeta crédito", "traspaso", "cuenta propia", "top-up", "topup", "top up")),
        Category("Efectivo", "💶", 0xFF9BA29E, listOf("cajero", "retirada", "reintegro", "atm")),
        Category("Bizum", "📲", 0xFF72B2A6, listOf("bizum")),
        Category("Transferencias", "↗️", 0xFF9AA7B0, listOf("transferencia", "transf.", "transf ", "trf", "orden de pago")),
        Category(OTHER, "📦", 0xFFA4AAA6, emptyList()),
    )

    private val incomeCategory = Category(INCOME, "💰", 0xFF7FB79B, emptyList())
    private val salaryCategory = Category(SALARY, "💼", 0xFF5E9C82, emptyList())

    fun byName(name: String): Category = when (name) {
        INCOME -> incomeCategory
        SALARY -> salaryCategory
        else -> all.firstOrNull { it.name == name } ?: all.last()
    }

    fun isIncomeCategory(name: String) = name == INCOME || name == SALARY

    /** Movimientos entre tus cuentas o hacia tu ahorro: ni son gasto ni son ingreso. */
    fun isTransfer(name: String) = name == TOP_UP || name == SAVINGS

    /** Categorías que se pueden elegir para un gasto, ordenadas para el selector. */
    val expenseNames: List<String> get() = all.map { it.name }

    private val topUpOrSavings = all.filter { isTransfer(it.name) }

    fun guess(merchant: String, fullText: String, isIncome: Boolean): String {
        val m = " " + merchant.lowercase(Locale.ROOT) + " "
        val t = " " + fullText.lowercase(Locale.ROOT) + " "
        if (isIncome) {
            if (salaryWords.containsMatchIn(merchant) || salaryWords.containsMatchIn(fullText)) return SALARY
            // Dinero que vuelve de otra tarjeta o del ahorro: tampoco es un ingreso real
            topUpOrSavings.firstOrNull { c -> c.keywords.any { m.contains(it) } }?.let { return it.name }
            return INCOME
        }
        all.firstOrNull { c -> c.keywords.any { m.contains(it) } }?.let { return it.name }
        all.firstOrNull { c -> c.keywords.any { t.contains(it) } }?.let { return it.name }
        return OTHER
    }

    /** Categorías antiguas que se han dividido en otras más concretas. */
    private val splitFrom = mapOf(
        "Transporte" to setOf("Gasolina", "Peajes", "Parking", "Taxi y VTC", "Coche", "Viajes", TOP_UP),
        "Hogar" to setOf("Suministros"),
        "Suscripciones" to setOf("Telefonía e internet"),
        "Ocio" to setOf("Viajes", "Deporte"),
        "Salud" to setOf("Mascotas", "Seguros"),
        "Compras" to setOf("Suscripciones"),
    )

    /**
     * Nueva categoría para un gasto guardado con la clasificación anterior, o null si se queda igual.
     * Solo cambia lo que estaba en "Otros" o en una categoría que ahora está dividida,
     * para no deshacer lo que hayas cambiado a mano.
     */
    fun refine(current: String, merchant: String, rawText: String?, isIncome: Boolean): String? {
        val g = guess(merchant, rawText ?: "", isIncome)
        if (g == current) return null
        return when {
            isIncome -> if (current == INCOME && isTransfer(g)) g else null
            current == OTHER && g != OTHER -> g
            splitFrom[current]?.contains(g) == true -> g
            else -> null
        }
    }
}
