package com.nizalo.core.realtime

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RealtimeFrameTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `test realtime move frame serialization and deserialization`() {
        val movePayload = buildJsonObject {
            put("from", "e2")
            put("to", "e4")
        }

        val frame = RealtimeFrame(
            type = FrameType.SEND_MOVE,
            correlationId = "corr-12345",
            payload = json.encodeToJsonElement(
                SendMovePayload.serializer(),
                SendMovePayload(
                    duelId = "duel-999",
                    moveNumber = 1,
                    actionType = "MOVE",
                    payload = movePayload,
                    notation = "e4"
                )
            )
        )

        val serialized = json.encodeToString(frame)
        assertTrue(serialized.contains("SEND_MOVE"))
        assertTrue(serialized.contains("corr-12345"))

        val deserialized = json.decodeFromString<RealtimeFrame>(serialized)
        assertEquals(FrameType.SEND_MOVE, deserialized.type)
        assertEquals("corr-12345", deserialized.correlationId)
    }
}
