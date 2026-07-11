package com.wastedtimer.pattern

import com.wastedtimer.security.AuthPrincipal
import jakarta.validation.Valid
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/api/patterns")
class PatternController(
    private val patternService: PatternService
) {
    @GetMapping
    fun list(
        @AuthenticationPrincipal principal: AuthPrincipal,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) since: Instant?
    ): PatternListResponse =
        patternService.list(principal.userId, since)

    @PutMapping
    fun put(
        @AuthenticationPrincipal principal: AuthPrincipal,
        @Valid @RequestBody request: PatternPutRequest
    ): PatternListResponse =
        patternService.put(principal.userId, request)
}
