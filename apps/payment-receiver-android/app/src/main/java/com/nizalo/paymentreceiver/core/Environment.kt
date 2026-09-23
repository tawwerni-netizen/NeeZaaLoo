package com.nizalo.paymentreceiver.core

import com.nizalo.paymentreceiver.BuildConfig

enum class Environment { DEVELOPMENT, STAGING, PRODUCTION;

    /** The in-app mock backend exists only in the dev build (see src/dev). */
    val mockAvailable: Boolean get() = this == DEVELOPMENT

    companion object {
        val current: Environment = valueOf(BuildConfig.ENVIRONMENT)
        val allowCleartext: Boolean = BuildConfig.ALLOW_CLEARTEXT
    }
}
