package com.nizalo.core.network

import com.nizalo.core.network.dto.AuthResponse
import com.nizalo.core.network.dto.LoginRequest
import com.nizalo.core.network.dto.RegisterRequest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AuthDtoTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `test LoginRequest serialization`() {
        val request = LoginRequest(
            identifier = "testuser",
            password = "securepassword",
            totpCode = "123456"
        )
        val jsonString = json.encodeToString(request)
        assertEquals("""{"identifier":"testuser","password":"securepassword","totpCode":"123456"}""", jsonString)
    }

    @Test
    fun `test RegisterRequest serialization defaults`() {
        val request = RegisterRequest(
            handle = "newuser",
            email = "test@nizalo.com",
            password = "pwd",
            termsAccepted = true
        )
        val jsonString = json.encodeToString(request)
        // Checks that default locale and policyVersion are included or correctly handled
        val deserialized = json.decodeFromString<RegisterRequest>(jsonString)
        assertEquals("en", deserialized.locale)
        assertEquals("1.0.0", deserialized.policyVersion)
    }

    @Test
    fun `test AuthResponse deserialization without tokens`() {
        val jsonResponse = """{"playerId": "user-uuid"}"""
        val response = json.decodeFromString<AuthResponse>(jsonResponse)
        assertEquals("user-uuid", response.playerId)
        assertNull(response.accessToken)
    }

    @Test
    fun `test AuthResponse deserialization with tokens`() {
        val jsonResponse = """{
            "playerId": "user-uuid",
            "accessToken": "access-123",
            "refreshToken": "refresh-456",
            "expiresInSeconds": 3600
        }"""
        val response = json.decodeFromString<AuthResponse>(jsonResponse)
        assertEquals("user-uuid", response.playerId)
        assertEquals("access-123", response.accessToken)
        assertEquals("refresh-456", response.refreshToken)
        assertEquals(3600L, response.expiresInSeconds)
    }
}
