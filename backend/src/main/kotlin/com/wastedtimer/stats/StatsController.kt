package com.wastedtimer.stats

import com.wastedtimer.security.AuthPrincipal
import jakarta.validation.Valid
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/stats")
class StatsController(
    private val statsService: StatsService
) {
    @PostMapping("/sync")
    fun sync(
        @AuthenticationPrincipal principal: AuthPrincipal,
        @Valid @RequestBody request: StatsSyncRequest
    ): StatsSyncResponse =
        statsService.sync(principal.userId, principal.deviceId, request)
}
