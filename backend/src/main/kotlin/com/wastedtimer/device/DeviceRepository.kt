package com.wastedtimer.device

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface DeviceRepository : JpaRepository<Device, UUID> {
    fun findByIdAndUserId(id: UUID, userId: UUID): Device?
    fun findAllByUserId(userId: UUID): List<Device>
}
