package com.wastedtimer.stats

import com.wastedtimer.pattern.PatternType
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotNull
import java.time.Instant
import java.time.LocalDate

data class StatsEntryDto(
    @field:NotNull
    val patternType: PatternType,

    val patternValue: String,

    @field:NotNull
    val date: LocalDate,

    @field:Min(0)
    val seconds: Long
)

data class StatsPullTargetDto(
    @field:NotNull
    val patternType: PatternType,

    val patternValue: String,

    @field:NotNull
    val date: LocalDate
)

data class StatsSyncRequest(
    val entries: List<StatsEntryDto> = emptyList(),
    val pullTargets: List<StatsPullTargetDto> = emptyList()
)

data class StatsTotalDto(
    val patternType: PatternType,
    val patternValue: String,
    val date: LocalDate,
    val otherDevicesSeconds: Long
)

data class StatsSyncResponse(
    val accepted: Boolean,
    val totals: List<StatsTotalDto>,
    val serverTime: Instant
)
