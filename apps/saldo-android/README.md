# Saldo · app Android que registra tus gastos leyendo las notificaciones del banco

App nativa (Kotlin + Jetpack Compose) inspirada en ExpenseIA. Lee las notificaciones
de tus apps bancarias, detecta cada pago o ingreso y mantiene tu **saldo actualizado**.

| Inicio | Inicio (oscuro) | Historial | Asesor | Gráficas |
|---|---|---|---|---|
| ![Inicio](screenshots/home.png) | ![Inicio en modo oscuro](screenshots/home-dark.png) | ![Historial](screenshots/movements.png) | ![Asesor](screenshots/advisor.png) | ![Gráficas](screenshots/charts.png) |

### Diseño

Minimalista y tranquilo: neutros con un leve tono verde, un único acento verde azulado,
ingresos en verde salvia y gastos en arcilla, categorías en tonos pastel apagados. Tarjetas
planas con borde fino, tipografía del sistema y animaciones discretas (aparición suave,
anillos que se dibujan, contadores). Modo claro y oscuro según el sistema.

## Qué hace

- **Captura automática**: escucha las notificaciones de BBVA, CaixaBank, imagin, Santander,
  Openbank, ING, Sabadell, Bankinter, EVO, Unicaja, Abanca, Ibercaja, Kutxabank, Cajamar,
  Ruralvía, Pibank, Revolut, N26, Wise, PayPal, Bizum, Google Wallet, Google Pay y Samsung
  Wallet. Detecta importe, gasto/ingreso, comercio y categoría.
- **Sin duplicados con Google Wallet**: si pagas con el móvil, Wallet y tu banco avisan del
  mismo pago; Saldo lo cuenta una sola vez (y aprovecha el saldo si el banco lo indica).
- **Saldo actual**: indicas tu saldo una vez y se actualiza con cada movimiento. Si el banco
  incluye el saldo en la notificación ("Saldo disponible 1.234,56 €"), lo usa directamente.
- **Importar extractos PDF**: desde la app del banco o Archivos, *Compartir → Saldo* (o
  *Ajustes → Importar extracto*). Lee fecha, concepto, importe y saldo de cada línea; enseña
  una vista previa con los movimientos nuevos y los que ya tenías; añade solo los que faltan
  y usa el último saldo del extracto como saldo actual. Admite PDFs con contraseña (DNI/NIE).
  Si el importe no lleva signo (columnas Debe/Haber), deduce gasto o ingreso por el saldo.
- **Asesor**: analiza tu sueldo (detectado o indicado por ti) y compara lo que gastas con un
  reparto recomendado (50/30/20 adaptado: vivienda 30 %, comida 12 %, transporte 10 %,
  restaurantes 5 %, ocio 5 %, suscripciones 2 %, salud 3 %, ropa y compras 5 %, otros 8 %,
  ahorro 20 %), en € y %. Rueda doble animada (exterior: recomendado, interior: real),
  puntuación de salud financiera, ahorro y colchón de emergencia, cuánto te puedes permitir en
  vivienda (alquiler, hipoteca, precio y entrada) y coche (regla 20/4/10), y más de 70 consejos
  con buscador y filtros, los primeros personalizados con tus números. Parte de ellos se basan en
  el discurso de M. Casanovas sobre asesoramiento financiero (RACEF, 2017), citado en cada consejo.
- **Inicio**: mes con ingresos, gastos y balance; donut de gastos por grupo; últimos movimientos.
- **Movimientos**: lista por días con filtros; toca uno para editarlo, cambiar la categoría o borrarlo.
- **Gráficas**: ingresos vs gastos de los últimos 6 meses y dónde más gastas.
- **Ajustes**: activar el permiso, ajustar saldo, elegir qué apps se escuchan y un
  "probar detector" para pegar el texto de una notificación y ver qué detecta.
- **Privado**: sin permiso de internet. Todo se guarda en una base de datos SQLite del móvil.

## Instalar

1. Descarga `app-release.apk` en el móvil y ábrelo (acepta "instalar apps de origen desconocido").
2. Abre **Saldo → Dar permiso** y activa *Saldo* en "Acceso a notificaciones".
3. Toca **Saldo actual** e indica cuánto tienes ahora en la cuenta.

> En Android 13+ puede que tengas que ir a *Ajustes del sistema → Apps → Saldo → ⋮ →
> Permitir ajustes restringidos* antes de poder activar el acceso a notificaciones
> (pasa con todas las apps instaladas fuera de Play Store).
>
> Unicaja y otros bancos solo envían avisos de compras si los activas en su app
> (en Unicaja: *Perfil → Notificaciones / Alertas*).
>
> Algunos fabricantes (Xiaomi, Samsung, Huawei) cierran apps en segundo plano: excluye
> Saldo de la optimización de batería para que no se pierda ninguna notificación.

## Compilar

Requiere JDK 17+ y el Android SDK (API 35).

```bash
cd apps/saldo-android
./gradlew assembleRelease        # APK en app/build/outputs/apk/release/
./gradlew testDebugUnitTest      # tests del detector de notificaciones
```

## Estructura

```
app/src/main/java/com/byluso/saldo/
├── parser/NotificationParser.kt   # Extrae importe, tipo, comercio y saldo del texto
├── parser/StatementParser.kt     # Lee extractos bancarios (texto del PDF) línea a línea
├── data/StatementImporter.kt     # Abre el PDF (PDFBox), pide contraseña y lo importa
├── advisor/FinanceAdvisor.kt     # Presupuesto recomendado vs real, vivienda, coche, puntuación
├── advisor/Tips.kt               # Consejos generales y personalizados
├── parser/Categories.kt           # Categorías y palabras clave (Mercadona → Comida…)
├── service/BankNotificationListener.kt  # NotificationListenerService
├── data/Repository.kt             # SQLite + StateFlow, deduplicación
├── data/Models.kt                 # Movement, SourceApp, cálculo del saldo
├── data/BankApps.kt               # Paquetes de bancos conocidos
└── ui/                            # Pantallas Compose
```

Si tu banco usa un formato que no se detecta, pega el texto en *Ajustes → Probar detector*
y añade el caso a `NotificationParserTest.kt`.
