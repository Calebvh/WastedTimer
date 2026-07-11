package com.wastedtimer.device

import java.time.Instant
import java.util.UUID

data class DeviceResponse(
    val deviceId: UUID,
    val deviceName: String,
    val createdAt: Instant,
    val lastSeenAt: Instant,
    val isCurrent: Boolean
)

data class DeviceListResponse(
    val devices: List<DeviceResponse>
)
