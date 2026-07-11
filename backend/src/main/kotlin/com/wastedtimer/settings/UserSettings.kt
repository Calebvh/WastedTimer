package com.wastedtimer.settings

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "user_settings")
class UserSettings(
    @Id
    @Column(name = "user_id")
    val userId: UUID,

    @Column(name = "reset_day", nullable = false)
    var resetDay: Int,

    @Column(name = "daily_limit_minutes", nullable = false)
    var dailyLimitMinutes: Int,

    @Column(name = "weekly_limit_minutes", nullable = false)
    var weeklyLimitMinutes: Int,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant
)
