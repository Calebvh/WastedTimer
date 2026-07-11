package com.wastedtimer.refreshtoken

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface RefreshTokenRepository : JpaRepository<RefreshToken, UUID> {
    fun findByTokenHash(tokenHash: String): RefreshToken?
    fun findAllByDeviceId(deviceId: UUID): List<RefreshToken>
}
