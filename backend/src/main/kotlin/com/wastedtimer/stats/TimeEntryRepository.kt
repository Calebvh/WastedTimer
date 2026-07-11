package com.wastedtimer.stats

import com.wastedtimer.pattern.PatternType
import org.springframework.data.jpa.repository.JpaRepository
import java.time.LocalDate
import java.util.UUID

interface TimeEntryRepository : JpaRepository<TimeEntry, UUID> {
    fun findByUserIdAndDeviceIdAndPatternTypeAndPatternValueAndEntryDate(
        userId: UUID,
        deviceId: UUID,
        patternType: PatternType,
        patternValue: String,
        entryDate: LocalDate
    ): TimeEntry?

    fun findAllByUserIdAndPatternTypeAndPatternValueAndEntryDate(
        userId: UUID,
        patternType: PatternType,
        patternValue: String,
        entryDate: LocalDate
    ): List<TimeEntry>
}
