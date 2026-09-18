package com.nizalo.core.network

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Interface that allows the network layer to request a step-up from the UI layer.
 */
interface StepUpManager {
    /**
     * Called by the interceptor when a 401 STEP_UP_REQUIRED is encountered.
     * Suspends until the UI provides a step-up token, or the user cancels/fails.
     * @param action The action requiring step-up.
     * @return The step-up token, or null if failed/cancelled.
     */
    suspend fun requestStepUp(action: String): String?

    /**
     * UI Layer observes this to know when to show the step-up dialog.
     */
    val stepUpRequests: kotlinx.coroutines.flow.SharedFlow<String>

    /**
     * Called by the UI layer to provide the token once it has successfully
     * called the /v1/auth/step-up endpoint.
     */
    fun onStepUpResolved(token: String?)
}

class StepUpManagerImpl : StepUpManager {
    private val _stepUpRequests = MutableSharedFlow<String>(extraBufferCapacity = 1)
    override val stepUpRequests = _stepUpRequests

    private val stepUpResolution = MutableSharedFlow<String?>(extraBufferCapacity = 1)
    private val mutex = Mutex()

    override suspend fun requestStepUp(action: String): String? = mutex.withLock {
        // Clear any previous resolutions
        stepUpResolution.resetReplayCache()
        
        // Notify UI
        _stepUpRequests.tryEmit(action)

        // Wait for UI to resolve (with a generous timeout for user input, e.g., 5 mins)
        withTimeoutOrNull(5 * 60 * 1000L) {
            stepUpResolution.first()
        }
    }

    override fun onStepUpResolved(token: String?) {
        stepUpResolution.tryEmit(token)
    }
}
