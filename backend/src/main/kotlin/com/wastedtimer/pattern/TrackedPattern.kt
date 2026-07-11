package com.wastedtimer.pattern

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

enum class PatternType { domain, url }

@Entity
@Table(name = "tracked_patterns")
class TrackedPattern(
    @Id
    val id: UUID = UUID.randomUUID(),

    @Column(name = "user_id", nullable = false)
    val userId: UUID,

    @Enumerated(EnumType.STRING)
    @Column(name = "pattern_type", nullable = false)
    val patternType: PatternType,

    @Column(name = "pattern_value", nullable = false)
    val patternValue: String,

    @Column(nullable = false)
    var active: Boolean,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant
)
