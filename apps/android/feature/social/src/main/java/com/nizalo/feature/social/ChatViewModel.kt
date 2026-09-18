package com.nizalo.feature.social

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.model.ChatChannelType
import com.nizalo.core.model.ChatMessage
import com.nizalo.core.realtime.RealtimeWebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ChatViewModel(
    private val wsClient: RealtimeWebSocketClient
) : ViewModel() {

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    init {
        viewModelScope.launch {
            wsClient.chatMessages.collect { message ->
                if (message.channelType == ChatChannelType.GLOBAL) {
                    _messages.value = _messages.value + message
                }
            }
        }
    }

    fun joinGlobalChat() {
        wsClient.sendJoinChatChannel(ChatChannelType.GLOBAL, "global")
    }

    fun leaveGlobalChat() {
        wsClient.sendLeaveChatChannel(ChatChannelType.GLOBAL, "global")
    }

    fun sendMessage(content: String) {
        if (content.isNotBlank()) {
            wsClient.sendChatMessage(ChatChannelType.GLOBAL, "global", content)
        }
    }

    override fun onCleared() {
        super.onCleared()
        leaveGlobalChat()
    }
}
