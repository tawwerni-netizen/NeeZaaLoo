package com.nizalo.paymentreceiver.security

import android.os.Build
import java.io.File

/**
 * Best-effort root / tampering indicators. Warns the operator and is logged;
 * it does not block the app: a false positive must never stop payments from
 * being recorded, and a determined attacker can hide root anyway. The real
 * protection is that the server decides every credit.
 */
object DeviceIntegrity {
    private val suPaths = listOf(
        "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/sbin/su", "/vendor/bin/su",
        "/data/local/su", "/data/local/bin/su", "/data/local/xbin/su", "/system/app/Superuser.apk",
        "/data/adb/magisk", "/sbin/.magisk",
    )

    data class Report(val suspicious: Boolean, val reasons: List<String>)

    fun check(): Report {
        val reasons = buildList {
            if (Build.TAGS?.contains("test-keys") == true) add("test-keys build")
            if (suPaths.any { runCatching { File(it).exists() }.getOrDefault(false) }) add("su binary present")
        }
        return Report(reasons.isNotEmpty(), reasons)
    }
}
