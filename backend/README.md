# WastedTimer Backend

Self-hosted sync backend for the WastedTimer browser extension. Kotlin + Spring Boot + PostgreSQL, deployed via Docker Compose. LAN/localhost only for now (plain HTTP).

## Run

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and JWT_SECRET (openssl rand -base64 32)
docker compose up -d --build
docker compose ps
```

Flyway migrations run automatically on API startup. Health check: `curl http://localhost:8080/actuator/health`.

## API

All endpoints below live under `/api` and require `Authorization: Bearer <accessToken>` except `auth/*` and `/actuator/health`.

- `POST /auth/register` `{email,password,deviceName}` -> `{userId,deviceId,accessToken,accessTokenExpiresAt,refreshToken}`
- `POST /auth/login` `{email,password,deviceName,deviceId?}` -> same shape
- `POST /auth/refresh` `{refreshToken}` -> rotated `{accessToken,accessTokenExpiresAt,refreshToken}`
- `POST /auth/logout` `{refreshToken}` -> 204
- `GET /devices` -> `{devices:[{deviceId,deviceName,createdAt,lastSeenAt,isCurrent}]}`
- `DELETE /devices/{id}` -> 204, revokes that device's refresh tokens
- `GET /settings` / `PUT /settings` `{resetDay,dailyLimitMinutes,weeklyLimitMinutes}`
- `GET /patterns` / `PUT /patterns` `{patterns:[{patternType,patternValue,active,updatedAt}]}`
- `POST /stats/sync` `{entries:[{patternType,patternValue,date,seconds}], pullTargets?:[{patternType,patternValue,date}]}` -> `{accepted,totals:[{patternType,patternValue,date,otherDevicesSeconds}],serverTime}`
