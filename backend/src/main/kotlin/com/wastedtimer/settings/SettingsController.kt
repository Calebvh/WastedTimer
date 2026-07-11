package com.wastedtimer.settings

import com.wastedtimer.security.AuthPrincipal
import jakarta.validation.Valid
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/settings")
class SettingsController(
    private val settingsService: SettingsService
) {
    @GetMapping
    fun get(@AuthenticationPrincipal principal: AuthPrincipal): SettingsResponse =
        settingsService.get(principal.userId)

    @PutMapping
    fun put(
        @AuthenticationPrincipal principal: AuthPrincipal,
        @Valid @RequestBody request: SettingsRequest
    ): SettingsResponse =
        settingsService.put(principal.userId, request)
}
