package io.github.sparklingstadt.typle.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class WordFilesTest {
  @Test fun csvFeatures() {
    assertEquals(listOf(Word(display = "日本,Japan", input = "Japan", annotation = "one\r\ntwo \"quoted\"")),
      parseWordFile("﻿display,input,annotation\r\n\"日本,Japan\",Japan,\"one\r\ntwo \"\"quoted\"\"\"\r\n", WordFileFormat.CSV))
    assertEquals(listOf(Word(display = "日本", input = "Japan")), parseWordFile("input\tdisplay\n\nJapan\t日本\n", WordFileFormat.TSV))
    assertEquals("a\tb", parseWordFile("input\tdisplay\tannotation\nJapan\t日本\t\"a\tb\"", WordFileFormat.TSV)[0].annotation)
  }

  @Test fun invalidFilesFail() {
    for (text in listOf("display\nx", "input,display,input\na,b,c", "input,display,other\na,b,c", "input,display", "input,display\na,",
      "input,display\na,b,c", "input,display\n\"a,b", "input,display\n\"a\"x,b", "input,display\na\"x,b")) {
      assertThrows(text, TypleException::class.java) { parseWordFile(text, WordFileFormat.CSV) }
    }
    assertEquals(TypleException("importFieldRequired", mapOf("line" to "3")),
      assertThrows(TypleException::class.java) { parseWordFile("input,display\nok,yes\nno,", WordFileFormat.CSV) })
    assertEquals("importTooManyRows",
      assertThrows(TypleException::class.java) { parseWordFile("input,display\n" + "a,b\n".repeat(1001), WordFileFormat.CSV) }.key)
    assertEquals("importTooLarge",
      assertThrows(TypleException::class.java) { parseWordFile("a".repeat(1024 * 1024 + 1), WordFileFormat.CSV) }.key)
    assertEquals("importFileEncoding",
      assertThrows(TypleException::class.java) { parseWordData(byteArrayOf(0xff.toByte(), 0xfe.toByte(), 0x41), WordFileFormat.CSV) }.key)
  }

  @Test fun csvRoundTripKeepsWhitespace() {
    val words = listOf(Word(display = " 字 ", input = " zi ", annotation = " a\r\nb \"q\""), Word(display = "字", input = "zi"))
    assertEquals(words, parseWordFile(encodeWordCsv(words), WordFileFormat.CSV))
    assertEquals(WordFileFormat.TSV, WordFileFormat.fromFileName("Words.TSV"))
    assertNull(WordFileFormat.fromFileName("words.txt"))
  }
}
