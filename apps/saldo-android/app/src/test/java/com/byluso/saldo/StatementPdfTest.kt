package com.byluso.saldo

import com.byluso.saldo.parser.StatementParser
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.encryption.AccessPermission
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.text.PDFTextStripper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.time.LocalDate

/** Genera un extracto en PDF con columnas reales y comprueba que se lee bien. */
class StatementPdfTest {

    private fun statementPdf(password: String? = null): ByteArray {
        val doc = PDDocument()
        val page = PDPage(PDRectangle.A4)
        doc.addPage(page)
        PDPageContentStream(doc, page).use { cs ->
            fun text(x: Float, y: Float, s: String, bold: Boolean = false, size: Float = 9f) {
                cs.beginText(); cs.setFont(if (bold) PDType1Font.HELVETICA_BOLD else PDType1Font.HELVETICA, size)
                cs.newLineAtOffset(x, y); cs.showText(s); cs.endText()
            }
            text(40f, 800f, "Unicaja Banco", bold = true, size = 14f)
            text(40f, 782f, "Extracto de movimientos - Octubre 2026")
            text(40f, 768f, "Titular: Cliente   Cuenta: ES12 2103 0000 0000 0000 0000")
            val cols = floatArrayOf(40f, 100f, 160f, 420f, 500f)
            listOf("F. Oper.", "F. Valor", "Concepto", "Importe", "Saldo").forEachIndexed { i, h -> text(cols[i], 740f, h, bold = true) }
            val rows = listOf(
                listOf("01/10/2026", "01/10/2026", "RECIBO IBERDROLA CLIENTES", "-78,00", "1.422,00"),
                listOf("02/10/2026", "02/10/2026", "TRANSFERENCIA DE EMPRESA SL", "2.200,00", "3.622,00"),
                listOf("05/10/2026", "05/10/2026", "COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA", "-52,30", "3.569,70"),
                listOf("06/10/2026", "06/10/2026", "BIZUM ENVIADO A MARIA LOPEZ", "-15,00", "3.554,70"),
                listOf("09/10/2026", "09/10/2026", "COMPRA TARJ. 5402XXXXXXXX1234 ZARA", "-59,90", "3.494,80"),
            )
            rows.forEachIndexed { r, row ->
                val y = 720f - r * 16f
                row.forEachIndexed { i, v -> text(cols[i], y, v) }
            }
            text(40f, 600f, "Saldo final 3.494,80")
            text(40f, 60f, "Página 1 de 1")
        }
        if (password != null) {
            doc.protect(StandardProtectionPolicy(password, password, AccessPermission()).apply { encryptionKeyLength = 128 })
        }
        return ByteArrayOutputStream().also { doc.save(it); doc.close() }.toByteArray()
    }

    private fun extract(bytes: ByteArray, password: String = ""): String =
        PDDocument.load(bytes, password).use { PDFTextStripper().apply { sortByPosition = true }.getText(it) }

    @Test fun readsColumnsFromRealPdf() {
        val text = extract(statementPdf())
        val st = StatementParser.parse(text, LocalDate.of(2026, 10, 17))
        assertEquals("Unicaja", st.bank)
        assertEquals(5, st.lines.size)
        assertEquals("Iberdrola Clientes", st.lines[0].merchant)
        // Sin signo, pero el saldo sube: es un ingreso
        assertTrue(st.lines[1].isIncome)
        assertEquals(2200.0, st.lines[1].amount, 0.001)
        assertEquals("Mercadona", st.lines[2].merchant)
        assertEquals("Maria Lopez", st.lines[3].merchant)
        assertFalse(st.lines[4].isIncome)
        assertEquals(3494.80, st.finalBalance!!, 0.001)
    }

    @Test fun readsPasswordProtectedPdf() {
        val bytes = statementPdf(password = "12345678Z")
        val st = StatementParser.parse(extract(bytes, "12345678Z"), LocalDate.of(2026, 10, 17))
        assertEquals(5, st.lines.size)
    }
}
