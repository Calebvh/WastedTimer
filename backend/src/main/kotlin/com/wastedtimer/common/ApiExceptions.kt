package com.wastedtimer.common

class EmailAlreadyExistsException : RuntimeException("Email already registered")

class InvalidCredentialsException : RuntimeException("Invalid email or password")

class InvalidRefreshTokenException : RuntimeException("Refresh token is invalid, expired, or revoked")

class ResourceNotFoundException(message: String) : RuntimeException(message)
