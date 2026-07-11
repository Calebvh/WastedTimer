package com.wastedtimer.auth.dto

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant
import java.util.UUID

data class RegisterRequest(
    @field:Email
    @field:NotBlank
    val email: String,

    @field:Size(min = 8, message = "Password must be at least 8 characters")
    val password: String,

    @field:NotBlank
    val deviceName: String
)

data class LoginRequest(
    @field:Email
    @field:NotBlank
    val email: String,

    @field:NotBlank
    val password: String,

    @field:NotBlank
    val deviceName: String,

    val deviceId: UUID? = null
)

data class RefreshRequest(
    @field:NotBlank
    val refreshToken: String
)

data class LogoutRequest(
    @field:NotBlank
    val refreshToken: String
)

data class AuthResponse(
    val userId: UUID,
    val deviceId: UUID,
    val accessToken: String,
    val accessTokenExpiresAt: Instant,
    val refreshToken: String
)

data class RefreshResponse(
    val accessToken: String,
    val accessTokenExpiresAt: Instant,
    val refreshToken: String
)
