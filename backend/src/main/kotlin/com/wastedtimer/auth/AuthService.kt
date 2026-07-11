package com.wastedtimer.auth

import com.wastedtimer.auth.dto.AuthResponse
import com.wastedtimer.auth.dto.LoginRequest
import com.wastedtimer.auth.dto.RefreshResponse
import com.wastedtimer.auth.dto.RegisterRequest
import com.wastedtimer.common.InvalidCredentialsException
import com.wastedtimer.common.InvalidRefreshTokenException
import com.wastedtimer.common.EmailAlreadyExistsException
import com.wastedtimer.device.Device
import com.wastedtimer.device.DeviceRepository
import com.wastedtimer.refreshtoken.RefreshTokenService
import com.wastedtimer.security.JwtService
import com.wastedtimer.user.User
import com.wastedtimer.user.UserRepository
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class AuthService(
    private val userRepository: UserRepository,
    private val deviceRepository: DeviceRepository,
    private val refreshTokenService: RefreshTokenService,
    private val jwtService: JwtService,
    private val passwordEncoder: PasswordEncoder
) {
    @Transactional
    fun register(request: RegisterRequest): AuthResponse {
        if (userRepository.existsByEmail(request.email.lowercase())) {
            throw EmailAlreadyExistsException()
        }

        val user = userRepository.save(
            User(
                email = request.email.lowercase(),
                passwordHash = passwordEncoder.encode(request.password)
            )
        )

        val device = deviceRepository.save(
            Device(user = user, deviceName = request.deviceName)
        )

        return issueAuthResponse(user.id, device)
    }

    @Transactional
    fun login(request: LoginRequest): AuthResponse {
        val user = userRepository.findByEmail(request.email.lowercase())
            .orElseThrow { InvalidCredentialsException() }

        if (!passwordEncoder.matches(request.password, user.passwordHash)) {
            throw InvalidCredentialsException()
        }

        val device = request.deviceId
            ?.let { deviceRepository.findByIdAndUserId(it, user.id) }
            ?.also { it.lastSeenAt = Instant.now(); it.deviceName = request.deviceName }
            ?: deviceRepository.save(Device(user = user, deviceName = request.deviceName))

        return issueAuthResponse(user.id, device)
    }

    @Transactional
    fun refresh(refreshToken: String): RefreshResponse {
        val result = refreshTokenService.validate(refreshToken)
        val stored = when (result) {
            is RefreshTokenService.ValidationResult.Valid -> result.token
            is RefreshTokenService.ValidationResult.ReuseDetected -> {
                // Presenting an already-rotated token is a theft signal - revoke the
                // whole device chain. This call must commit even though we throw right
                // after, which is why revokeAllForDevice runs in its own transaction.
                refreshTokenService.revokeAllForDevice(result.deviceId)
                throw InvalidRefreshTokenException()
            }
            RefreshTokenService.ValidationResult.Invalid -> throw InvalidRefreshTokenException()
        }

        val device = stored.device
        device.lastSeenAt = Instant.now()

        val issued = refreshTokenService.rotate(stored)
        val access = jwtService.generateAccessToken(device.user.id, device.id)

        return RefreshResponse(
            accessToken = access.token,
            accessTokenExpiresAt = access.expiresAt,
            refreshToken = issued.plaintext
        )
    }

    @Transactional
    fun logout(refreshToken: String) {
        when (val result = refreshTokenService.validate(refreshToken)) {
            is RefreshTokenService.ValidationResult.Valid -> {
                result.token.revokedAt = Instant.now()
            }
            else -> { /* already invalid/revoked - logout is idempotent, nothing to do */ }
        }
    }

    private fun issueAuthResponse(userId: java.util.UUID, device: Device): AuthResponse {
        val refresh = refreshTokenService.issueFor(device)
        val access = jwtService.generateAccessToken(userId, device.id)
        return AuthResponse(
            userId = userId,
            deviceId = device.id,
            accessToken = access.token,
            accessTokenExpiresAt = access.expiresAt,
            refreshToken = refresh.plaintext
        )
    }
}
