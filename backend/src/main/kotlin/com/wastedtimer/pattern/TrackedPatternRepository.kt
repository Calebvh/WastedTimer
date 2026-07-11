package com.wastedtimer.pattern

import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
import java.util.UUID

interface TrackedPatternRepository : JpaRepository<TrackedPattern, UUID> {
    fun findAllByUserId(userId: UUID): List<TrackedPattern>
    fun findAllByUserIdAndUpdatedAtAfter(userId: UUID, updatedAt: Instant): List<TrackedPattern>
    fun findByUserIdAndPatternTypeAndPatternValue(
        userId: UUID,
        patternType: PatternType,
        patternValue: String
    ): TrackedPattern?
}
