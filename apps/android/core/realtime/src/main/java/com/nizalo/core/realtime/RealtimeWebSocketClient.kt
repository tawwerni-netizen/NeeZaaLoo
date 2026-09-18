package com.nizalo.core.realtime

import com.nizalo.core.common.ClockSync
import com.nizalo.core.model.*
import com.nizalo.core.security.SecureStorage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import okhttp3.*
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    AUTHENTICATED,
    RECONNECTING
}

class RealtimeWebSocketClient(
    private val wsUrl: String,
    private val secureStorage: SecureStorage,
    private val clockSync: ClockSync,
    private val coroutineScope: CoroutineScope
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val okHttpClient = OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _incomingFrames = MutableSharedFlow<RealtimeFrame>(extraBufferCapacity = 64)
    val incomingFrames: SharedFlow<RealtimeFrame> = _incomingFrames.asSharedFlow()

    private val _duelUpdates = MutableSharedFlow<DuelStateSyncPayload>(extraBufferCapacity = 32)
    val duelUpdates: SharedFlow<DuelStateSyncPayload> = _duelUpdates.asSharedFlow()

    private val _clockUpdates = MutableSharedFlow<ClockUpdatePayload>(extraBufferCapacity = 32)
    val clockUpdates: SharedFlow<ClockUpdatePayload> = _clockUpdates.asSharedFlow()

    private val _chatMessages = MutableSharedFlow<ChatMessage>(extraBufferCapacity = 64)
    val chatMessages: SharedFlow<ChatMessage> = _chatMessages.asSharedFlow()

    private val _spectatorUpdates = MutableSharedFlow<SpectatorUpdatePayload>(extraBufferCapacity = 16)
    val spectatorUpdates: SharedFlow<SpectatorUpdatePayload> = _spectatorUpdates.asSharedFlow()

    private val isRunning = AtomicBoolean(false)
    private var reconnectJob: Job? = null

    fun connect() {
        if (isRunning.getAndSet(true)) return
        initiateConnection()
    }

    private fun initiateConnection() {
        _connectionState.value = ConnectionState.CONNECTING
        val request = Request.Builder().url(wsUrl).build()
        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _connectionState.value = ConnectionState.CONNECTED
                authenticate()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleIncomingMessage(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _connectionState.value = ConnectionState.DISCONNECTED
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connectionState.value = ConnectionState.DISCONNECTED
                scheduleReconnect()
            }
        })
    }

    private fun authenticate() {
        val token = secureStorage.getAccessToken() ?: return
        val payload = json.encodeToJsonElement(AuthenticatePayload(token = token))
        sendFrame(RealtimeFrame(type = FrameType.AUTHENTICATE, payload = payload))
    }

    private fun handleIncomingMessage(text: String) {
        try {
            val receiveTimestamp = System.currentTimeMillis()
            val frame = json.decodeFromString<RealtimeFrame>(text)
            _incomingFrames.tryEmit(frame)

            when (frame.type) {
                FrameType.AUTHENTICATED -> {
                    _connectionState.value = ConnectionState.AUTHENTICATED
                }
                FrameType.DUEL_STATE_SYNC -> {
                    frame.payload?.let {
                        val sync = json.decodeFromJsonElement<DuelStateSyncPayload>(it)
                        _duelUpdates.tryEmit(sync)
                    }
                }
                FrameType.CLOCK_UPDATE -> {
                    frame.payload?.let {
                        val clock = json.decodeFromJsonElement<ClockUpdatePayload>(it)
                        clockSync.updateOffset(
                            clientSendMs = frame.timestampMs,
                            serverTimestampMs = clock.clockState.lastServerTimestampMs,
                            clientReceiveMs = receiveTimestamp
                        )
                        _clockUpdates.tryEmit(clock)
                    }
                }
                FrameType.CHAT_MESSAGE_RECEIVED -> {
                    frame.payload?.let {
                        val chat = json.decodeFromJsonElement<ChatMessage>(it)
                        _chatMessages.tryEmit(chat)
                    }
                }
                FrameType.SPECTATOR_UPDATE -> {
                    frame.payload?.let {
                        val spec = json.decodeFromJsonElement<SpectatorUpdatePayload>(it)
                        _spectatorUpdates.tryEmit(spec)
                    }
                }
                FrameType.HEARTBEAT_PONG -> {
                    clockSync.updateOffset(
                        clientSendMs = frame.timestampMs,
                        serverTimestampMs = frame.timestampMs,
                        clientReceiveMs = receiveTimestamp
                    )
                }
                else -> Unit
            }
        } catch (e: Exception) {
            // Logging or error handler
        }
    }

    fun sendFrame(frame: RealtimeFrame): Boolean {
        val serialized = json.encodeToString(frame)
        return webSocket?.send(serialized) ?: false
    }

    fun subscribeDuel(duelId: String) {
        val payload = json.encodeToJsonElement(SubscribeDuelPayload(duelId = duelId))
        sendFrame(RealtimeFrame(type = FrameType.SUBSCRIBE_DUEL, payload = payload))
    }

    fun sendMove(duelId: String, moveNumber: Int, actionType: String, movePayload: kotlinx.serialization.json.JsonObject, notation: String? = null) {
        val payload = json.encodeToJsonElement(
            SendMovePayload(
                duelId = duelId,
                moveNumber = moveNumber,
                actionType = actionType,
                payload = movePayload,
                notation = notation
            )
        )
        sendFrame(RealtimeFrame(type = FrameType.SEND_MOVE, correlationId = UUID.randomUUID().toString(), payload = payload))
    }

    fun reconnectDuel(duelId: String, lastKnownMoveNumber: Int) {
        val payload = json.encodeToJsonElement(
            ReconnectDuelPayload(
                duelId = duelId,
                lastKnownMoveNumber = lastKnownMoveNumber
            )
        )
        sendFrame(RealtimeFrame(type = FrameType.RECONNECT_DUEL, payload = payload))
    }

    fun sendChatMessage(channelType: ChatChannelType, channelId: String, content: String) {
        val payload = json.encodeToJsonElement(
            SendChatMessagePayload(
                channelType = channelType,
                channelId = channelId,
                content = content
            )
        )
        sendFrame(RealtimeFrame(type = FrameType.SEND_CHAT_MESSAGE, payload = payload))
    }

    fun sendJoinChatChannel(channelType: ChatChannelType, channelId: String) {
        val payload = json.encodeToJsonElement(
            JoinChatChannelPayload(
                channelType = channelType,
                channelId = channelId
            )
        )
        sendFrame(RealtimeFrame(type = FrameType.JOIN_CHAT_CHANNEL, payload = payload))
    }

    fun sendLeaveChatChannel(channelType: ChatChannelType, channelId: String) {
        val payload = json.encodeToJsonElement(
            LeaveChatChannelPayload(
                channelType = channelType,
                channelId = channelId
            )
        )
        sendFrame(RealtimeFrame(type = FrameType.LEAVE_CHAT_CHANNEL, payload = payload))
    }

    private fun scheduleReconnect() {
        if (!isRunning.get()) return
        reconnectJob?.cancel()
        reconnectJob = coroutineScope.launch {
            _connectionState.value = ConnectionState.RECONNECTING
            delay(3000)
            if (isRunning.get()) {
                initiateConnection()
            }
        }
    }

    fun disconnect() {
        isRunning.set(false)
        reconnectJob?.cancel()
        webSocket?.close(1000, "Normal closure")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }
}
