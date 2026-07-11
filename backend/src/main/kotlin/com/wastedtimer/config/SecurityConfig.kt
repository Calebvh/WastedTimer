package com.wastedtimer.config

import com.wastedtimer.security.JwtAuthFilter
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter

@Configuration
class SecurityConfig(
    private val jwtAuthFilter: JwtAuthFilter
) {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf { it.disable() }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests { auth ->
                auth
                    // /error must be permitted: Tomcat's internal ERROR-dispatch re-runs the
                    // security filter chain, and without this an unrelated validation 400
                    // gets clobbered into a 403 when the error-page dispatch is denied.
                    .requestMatchers("/api/auth/**", "/actuator/health", "/error").permitAll()
                    .anyRequest().authenticated()
            }
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .exceptionHandling { it.authenticationEntryPoint(jsonUnauthorizedEntryPoint()) }
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter::class.java)

        return http.build()
    }

    // Spring Security's default entry point returns 403 for unauthenticated requests
    // (there's no httpBasic/formLogin configured to supply a 401-returning one). Our
    // clients rely on a real 401 to know "access token expired, try refreshing" versus
    // 403 "authenticated but not allowed", so this must be explicit.
    @Bean
    fun jsonUnauthorizedEntryPoint() =
        org.springframework.security.web.AuthenticationEntryPoint { _, response, _ ->
            response.contentType = MediaType.APPLICATION_JSON_VALUE
            response.status = 401
            response.writer.write("""{"message":"Unauthorized"}""")
        }
}
