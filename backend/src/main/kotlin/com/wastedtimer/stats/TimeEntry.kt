package com.wastedtimer.stats

import com.wastedtimer.pattern.PatternType
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Entity
@Table(name = "time_entries")
class TimeEntry(
    @Id
    val id: UUID = UUID.randomUUID(),

    @Column(name = "user_id", nullable = false)
    val userId: UUID,

    @Column(name = "device_id", nullable = false)
    val deviceId: UUID,

    @Enumerated(EnumType.STRING)
    @Column(name = "pattern_type", nullable = false)
    val patternType: PatternType,

    @Column(name = "pattern_value", nullable = false)
    val patternValue: String,

    @Column(name = "entry_date", nullable = false)
    val entryDate: LocalDate,

    @Column(nullable = false)
    var seconds: Long,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant
)
