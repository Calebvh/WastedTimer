package com.wastedtimer.settings

import com.wastedtimer.common.ResourceNotFoundException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

@Service
class SettingsService(
    private val userSettingsRepository: UserSettingsRepository
) {
    fun get(userId: UUID): SettingsResponse {
        val settings = userSettingsRepository.findById(userId)
            .orElseThrow { ResourceNotFoundException("Settings not set") }
        return settings.toResponse()
    }

    @Transactional
    fun put(userId: UUID, request: SettingsRequest): SettingsResponse {
        val now = Instant.now()
        val existing = userSettingsRepository.findById(userId).orElse(null)

        val settings = if (existing != null) {
            existing.resetDay = request.resetDay
            existing.dailyLimitMinutes = request.dailyLimitMinutes
            existing.weeklyLimitMinutes = request.weeklyLimitMinutes
            existing.updatedAt = now
            existing
        } else {
            UserSettings(
                userId = userId,
                resetDay = request.resetDay,
                dailyLimitMinutes = request.dailyLimitMinutes,
                weeklyLimitMinutes = request.weeklyLimitMinutes,
                updatedAt = now
            )
        }

        return userSettingsRepository.save(settings).toResponse()
    }

    private fun UserSettings.toResponse() = SettingsResponse(
        resetDay = resetDay,
        dailyLimitMinutes = dailyLimitMinutes,
        weeklyLimitMinutes = weeklyLimitMinutes,
        updatedAt = updatedAt
    )
}
