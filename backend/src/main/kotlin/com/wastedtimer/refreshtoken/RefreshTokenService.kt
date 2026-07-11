package com.wastedtimer.refreshtoken

import com.wastedtimer.device.Device
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is persisted.
 * Rotation forms a chain via replacedById so reuse of an already-rotated token
 * (a signal of theft) can be detected and the whole device chain revoked.
 */
@Service
class RefreshTokenService(
    private val refreshTokenRepository: RefreshTokenRepository,
    @Value("\${wastedtimer.jwt.refresh-ttl-days}") private val refreshTtlDays: Long
) {
    private val secureRandom = SecureRandom()

    data class IssuedToken(val plaintext: String, val entity: RefreshToken)

    sealed class ValidationResult {
        data class Valid(val token: RefreshToken) : ValidationResult()
        object Invalid : ValidationResult()
        data class ReuseDetected(val deviceId: UUID) : ValidationResult()
    }

    fun issueFor(device: Device): IssuedToken {
        val plaintext = randomToken()
        val entity = RefreshToken(
            device = device,
            tokenHash = hash(plaintext),
            expiresAt = Instant.now().plus(refreshTtlDays, ChronoUnit.DAYS)
        )
        refreshTokenRepository.save(entity)
        return IssuedToken(plaintext, entity)
    }

    // Note: deliberately does NOT revoke the device's chain itself on reuse detection.
    // The caller must invoke revokeAllForDevice() as a separate call through this
    // service's Spring proxy (see its REQUIRES_NEW below) so the revocation commits
    // even if the caller's own transaction later rolls back (e.g. because it throws
    // after seeing ReuseDetected). A same-class self-invocation here would bypass
    // Spring's transactional proxy and silently lose that guarantee.
    fun validate(plaintext: String): ValidationResult {
        val stored = refreshTokenRepository.findByTokenHash(hash(plaintext))
            ?: return ValidationResult.Invalid

        if (stored.revokedAt != null) {
            // Already rotated/revoked token presented again -> possible theft.
            return ValidationResult.ReuseDetected(stored.device.id)
        }

        if (!stored.isActive()) {
            return ValidationResult.Invalid
        }

        return ValidationResult.Valid(stored)
    }

    fun rotate(old: RefreshToken): IssuedToken {
        val issued = issueFor(old.device)
        old.revokedAt = Instant.now()
        old.replacedById = issued.entity.id
        refreshTokenRepository.save(old)
        return issued
    }

    // REQUIRES_NEW: this must commit independently of the caller's transaction,
    // since the reuse-detection caller throws right after calling this (see above).
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun revokeAllForDevice(deviceId: UUID) {
        val now = Instant.now()
        refreshTokenRepository.findAllByDeviceId(deviceId)
            .filter { it.revokedAt == null }
            .forEach {
                it.revokedAt = now
                refreshTokenRepository.save(it)
            }
    }

    private fun randomToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun hash(plaintext: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(plaintext.toByteArray())
        return Base64.getEncoder().encodeToString(digest)
    }
}
