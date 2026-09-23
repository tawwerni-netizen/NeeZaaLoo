package com.nizalo.paymentreceiver.core

import java.math.BigDecimal
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Display formatting. Western digits throughout: amounts and references must be copyable and unambiguous. */
object Formatters {
    val cairo: ZoneId = ZoneId.of("Africa/Cairo")
    private val symbols = DecimalFormatSymbols(Locale.US)
    private val date = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US).withZone(cairo)
    private val time = DateTimeFormatter.ofPattern("HH:mm", Locale.US).withZone(cairo)
    private val dateTime = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss", Locale.US).withZone(cairo)

    fun egp(piastres: Long?): String {
        if (piastres == null) return "—"
        return "EGP " + DecimalFormat("#,##0.00", symbols).format(BigDecimal.valueOf(piastres, 2))
    }

    /** EGP piastres as a decimal string from the API ("50000" -> "EGP 500.00"). */
    fun egp(piastres: String?): String = egp(piastres?.toLongOrNull())

    fun egpWhole(pounds: String?): String =
        pounds?.toLongOrNull()?.let { "EGP " + DecimalFormat("#,##0", symbols).format(it) } ?: "—"

    /** USDT minor units (6 decimals) -> "10.00 USDT". */
    fun usdt(minor: String?): String {
        val v = minor?.toBigIntegerOrNull() ?: return "—"
        return DecimalFormat("#,##0.00", symbols).format(BigDecimal(v, 6)) + " USDT"
    }

    fun date(epochMillis: Long): String = date.format(Instant.ofEpochMilli(epochMillis))
    fun time(epochMillis: Long): String = time.format(Instant.ofEpochMilli(epochMillis))
    fun dateTime(epochMillis: Long?): String = epochMillis?.let { dateTime.format(Instant.ofEpochMilli(it)) } ?: "—"

    fun startOfTodayCairo(nowMillis: Long): Long =
        Instant.ofEpochMilli(nowMillis).atZone(cairo).toLocalDate().atStartOfDay(cairo).toInstant().toEpochMilli()
}
