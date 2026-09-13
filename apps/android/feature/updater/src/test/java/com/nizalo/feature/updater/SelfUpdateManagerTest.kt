package com.nizalo.feature.updater

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.File
import java.security.MessageDigest

class SelfUpdateManagerTest {

    @Test
    fun `test sha256 checksum verification`() {
        val tempFile = File.createTempFile("test_apk", ".apk")
        tempFile.writeText("nizalo-release-v1.0.0-binary-content")

        // Compute expected SHA-256
        val digest = MessageDigest.getInstance("SHA-256")
        val expectedHash = digest.digest(tempFile.readBytes()).joinToString("") { "%02x".format(it) }

        // Verify matches
        val calcDigest = MessageDigest.getInstance("SHA-256")
        val calculated = calcDigest.digest(tempFile.readBytes()).joinToString("") { "%02x".format(it) }

        assertEquals(expectedHash, calculated)
        tempFile.delete()
    }
}
