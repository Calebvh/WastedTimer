package com.wastedtimer.device

import com.wastedtimer.security.AuthPrincipal
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/devices")
class DeviceController(
    private val deviceService: DeviceService
) {
    @GetMapping
    fun list(@AuthenticationPrincipal principal: AuthPrincipal): DeviceListResponse =
        deviceService.listForUser(principal.userId, principal.deviceId)

    @DeleteMapping("/{deviceId}")
    fun revoke(
        @AuthenticationPrincipal principal: AuthPrincipal,
        @PathVariable deviceId: UUID
    ): ResponseEntity<Void> {
        deviceService.revoke(principal.userId, deviceId)
        return ResponseEntity.noContent().build()
    }
}
