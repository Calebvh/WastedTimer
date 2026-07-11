package com.wastedtimer.device

import com.wastedtimer.common.ResourceNotFoundException
import com.wastedtimer.refreshtoken.RefreshTokenService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class DeviceService(
    private val deviceRepository: DeviceRepository,
    private val refreshTokenService: RefreshTokenService
) {
    fun listForUser(userId: UUID, currentDeviceId: UUID): DeviceListResponse {
        val devices = deviceRepository.findAllByUserId(userId).map {
            DeviceResponse(
                deviceId = it.id,
                deviceName = it.deviceName,
                createdAt = it.createdAt,
                lastSeenAt = it.lastSeenAt,
                isCurrent = it.id == currentDeviceId
            )
        }
        return DeviceListResponse(devices)
    }

    @Transactional
    fun revoke(userId: UUID, deviceId: UUID) {
        val device = deviceRepository.findByIdAndUserId(deviceId, userId)
            ?: throw ResourceNotFoundException("Device not found")
        refreshTokenService.revokeAllForDevice(device.id)
    }
}
