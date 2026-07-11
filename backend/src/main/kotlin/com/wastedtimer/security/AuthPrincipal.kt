package com.wastedtimer.security

import java.util.UUID

data class AuthPrincipal(
    val userId: UUID,
    val deviceId: UUID
)
