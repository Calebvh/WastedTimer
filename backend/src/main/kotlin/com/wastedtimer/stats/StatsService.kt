package com.wastedtimer.stats

import com.wastedtimer.pattern.PatternType
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Service
class StatsService(
    private val timeEntryRepository: TimeEntryRepository
) {
    private data class Key(val patternType: PatternType, val patternValue: String, val date: LocalDate)

    @Transactional
    fun sync(userId: UUID, deviceId: UUID, request: StatsSyncRequest): StatsSyncResponse {
        // Upsert this device's cumulative seconds per pattern/date. GREATEST-style merge:
        // never regress on retry/out-of-order delivery, never double count.
        request.entries.forEach { incoming ->
            val existing = timeEntryRepository.findByUserIdAndDeviceIdAndPatternTypeAndPatternValueAndEntryDate(
                userId, deviceId, incoming.patternType, incoming.patternValue, incoming.date
            )

            if (existing == null) {
                timeEntryRepository.save(
                    TimeEntry(
                        userId = userId,
                        deviceId = deviceId,
                        patternType = incoming.patternType,
                        patternValue = incoming.patternValue,
                        entryDate = incoming.date,
                        seconds = incoming.seconds,
                        updatedAt = Instant.now()
                    )
                )
            } else if (incoming.seconds > existing.seconds) {
                existing.seconds = incoming.seconds
                existing.updatedAt = Instant.now()
                timeEntryRepository.save(existing)
            }
        }

        val keys = (
            request.entries.map { Key(it.patternType, it.patternValue, it.date) } +
                request.pullTargets.map { Key(it.patternType, it.patternValue, it.date) }
            ).distinct()

        val totals = keys.map { key ->
            val otherDevicesSeconds = timeEntryRepository
                .findAllByUserIdAndPatternTypeAndPatternValueAndEntryDate(
                    userId, key.patternType, key.patternValue, key.date
                )
                .filter { it.deviceId != deviceId }
                .sumOf { it.seconds }

            StatsTotalDto(key.patternType, key.patternValue, key.date, otherDevicesSeconds)
        }

        return StatsSyncResponse(accepted = true, totals = totals, serverTime = Instant.now())
    }
}
