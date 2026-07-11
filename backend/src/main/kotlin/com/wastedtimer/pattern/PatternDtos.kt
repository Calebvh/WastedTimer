package com.wastedtimer.pattern

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import java.time.Instant

data class PatternDto(
    @field:NotNull
    val patternType: PatternType,

    @field:NotBlank
    val patternValue: String,

    val active: Boolean,

    @field:NotNull
    val updatedAt: Instant
)

data class PatternListResponse(
    val patterns: List<PatternDto>,
    val serverTime: Instant
)

data class PatternPutRequest(
    val patterns: List<PatternDto>
)
