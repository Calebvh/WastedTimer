package com.wastedtimer.security

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.crypto.SecretKey

@Service
class JwtService(
    @Value("\${wastedtimer.jwt.secret}") secret: String,
    @Value("\${wastedtimer.jwt.access-ttl-minutes}") private val accessTtlMinutes: Long
) {
    private val key: SecretKey = Keys.hmacShaKeyFor(secret.toByteArray())

    data class IssuedAccessToken(val token: String, val expiresAt: Instant)

    fun generateAccessToken(userId: UUID, deviceId: UUID): IssuedAccessToken {
        val now = Instant.now()
        val expiresAt = now.plus(accessTtlMinutes, ChronoUnit.MINUTES)
        val token = Jwts.builder()
            .subject(userId.toString())
            .claim("deviceId", deviceId.toString())
            .issuedAt(java.util.Date.from(now))
            .expiration(java.util.Date.from(expiresAt))
            .signWith(key)
            .compact()
        return IssuedAccessToken(token, expiresAt)
    }

    fun parse(token: String): AuthPrincipal? {
        return try {
            val claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .payload

            val userId = UUID.fromString(claims.subject)
            val deviceId = UUID.fromString(claims.get("deviceId", String::class.java))
            AuthPrincipal(userId, deviceId)
        } catch (ex: Exception) {
            null
        }
    }
}
