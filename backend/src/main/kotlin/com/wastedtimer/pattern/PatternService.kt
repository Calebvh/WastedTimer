package com.wastedtimer.pattern

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

@Service
class PatternService(
    private val trackedPatternRepository: TrackedPatternRepository
) {
    fun list(userId: UUID, since: Instant?): PatternListResponse {
        val patterns = if (since != null) {
            trackedPatternRepository.findAllByUserIdAndUpdatedAtAfter(userId, since)
        } else {
            trackedPatternRepository.findAllByUserId(userId)
        }
        return PatternListResponse(patterns.map { it.toDto() }, Instant.now())
    }

    /**
     * Row-level last-write-wins: an incoming write is applied only if it is strictly
     * newer than what's stored, so concurrent add-on-device-A / remove-on-device-B
     * reconcile per-pattern instead of one whole-array push clobbering the other.
     */
    @Transactional
    fun put(userId: UUID, request: PatternPutRequest): PatternListResponse {
        val applied = request.patterns.map { incoming ->
            val existing = trackedPatternRepository.findByUserIdAndPatternTypeAndPatternValue(
                userId, incoming.patternType, incoming.patternValue
            )

            if (existing == null) {
                trackedPatternRepository.save(
                    TrackedPattern(
                        userId = userId,
                        patternType = incoming.patternType,
                        patternValue = incoming.patternValue,
                        active = incoming.active,
                        updatedAt = incoming.updatedAt
                    )
                )
            } else if (incoming.updatedAt.isAfter(existing.updatedAt)) {
                existing.active = incoming.active
                existing.updatedAt = incoming.updatedAt
                trackedPatternRepository.save(existing)
            } else {
                existing
            }
        }

        return PatternListResponse(applied.map { it.toDto() }, Instant.now())
    }

    private fun TrackedPattern.toDto() = PatternDto(
        patternType = patternType,
        patternValue = patternValue,
        active = active,
        updatedAt = updatedAt
    )
}
