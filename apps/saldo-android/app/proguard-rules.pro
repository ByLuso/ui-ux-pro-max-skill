# PDFBox (lectura de extractos) usa reflexión para los manejadores de cifrado y
# carga recursos por nombre de clase: se conserva entero.
-keep class com.tom_roush.pdfbox.** { *; }
-keep class com.tom_roush.fontbox.** { *; }
-keep class com.tom_roush.harmony.** { *; }
# Dependencias opcionales de PDFBox que no se usan (imágenes JPEG2000)
-dontwarn com.gemalto.jp2.**
-dontwarn org.bouncycastle.**
