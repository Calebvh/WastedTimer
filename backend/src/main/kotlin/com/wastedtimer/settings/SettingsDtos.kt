package com.wastedtimer.settings

import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import java.time.Instant

data class SettingsRequest(
    @field:Min(0) @field:Max(6)
    val resetDay: Int,

    @field:Min(1)
    val dailyLimitMinutes: Int,

    @field:Min(1)
    val weeklyLimitMinutes: Int
)

data class SettingsResponse(
    val resetDay: Int,
    val dailyLimitMinutes: Int,
    val weeklyLimitMinutes: Int,
    val updatedAt: Instant
)
