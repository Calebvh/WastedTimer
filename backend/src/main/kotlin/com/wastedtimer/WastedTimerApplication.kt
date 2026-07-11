package com.wastedtimer

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration
import org.springframework.boot.runApplication

// UserDetailsServiceAutoConfiguration is excluded: auth is pure JWT (no AuthenticationManager
// or UserDetailsService involved), so Spring Boot's auto-generated in-memory user/password is
// dead weight that only adds startup log noise.
@SpringBootApplication(exclude = [UserDetailsServiceAutoConfiguration::class])
class WastedTimerApplication

fun main(args: Array<String>) {
    runApplication<WastedTimerApplication>(*args)
}
