# PRD: Unified Mobile-Web Authentication

## Overview
The web dashboard now uses email/password authentication via NextAuth, but the mobile iOS app still uses a static API key that always resolves to a demo technician. This means sessions created on the web and sessions created on mobile can't be linked to the same user. The mobile app needs matching email/password login so that a technician's web session and mobile glasses capture are attributed to the same account.

## Goals
- Technician logs into the iOS app with the same email/password as the web dashboard
- Sessions created on web are visible to the same user on mobile (auto-join works correctly)
- Evidence uploaded from mobile is attributed to the correct technician
- Login persists across app restarts (Keychain storage)
- App is fully blocked until authenticated

## Quality Gates

These commands must pass for every user story:
- Web: `npx tsc --noEmit` (in aerovision-mvp)
- iOS: `xcodebuild -scheme AeroVisionGlass -destination "generic/platform=iOS Simulator" build` (in aerovision-capture-swift)

For iOS UI stories, also include:
- Build and launch in Simulator, take screenshot to verify

## User Stories

### US-001: Mobile login API endpoint
**Description:** As the mobile app, I want to authenticate with email/password and receive a JWT so that I can make authenticated API calls as the correct technician.

**Acceptance Criteria:**
- [ ] POST /api/mobile/login accepts { email, password } and returns { token, technician }
- [ ] Token is a signed JWT containing technicianId and organizationId
- [ ] Returns 401 with { error: "Invalid credentials" } for wrong email/password
- [ ] authenticateRequest() in lib/mobile-auth.ts accepts both legacy API keys AND JWTs
- [ ] JWT validation checks signature and expiry (90-day expiry)

### US-002: iOS login screen
**Description:** As a technician, I want to enter my email and password when I open the app so that my capture sessions are linked to my account.

**Acceptance Criteria:**
- [ ] New LoginView.swift with email field, password field, and Sign In button
- [ ] Shows inline error message for invalid credentials
- [ ] Shows loading state while authenticating
- [ ] On success, stores the JWT and technician info in Keychain via KeychainAccess
- [ ] On success, navigates to HomeView
- [ ] Environment picker (Production/Local) accessible from login screen

### US-003: Auth gate and session persistence
**Description:** As a technician, I want to stay logged in across app restarts so that I don't have to re-enter credentials every time.

**Acceptance Criteria:**
- [ ] App checks Keychain for stored JWT on launch
- [ ] If valid token exists, skip login and go straight to HomeView
- [ ] If no token or token is expired, show LoginView
- [ ] APIClient reads the stored JWT from Keychain instead of using a hardcoded API key
- [ ] All screens are behind the auth gate — no access without login
- [ ] Sign-out button in settings clears Keychain token and returns to LoginView

### US-004: Wire APIClient to use JWT auth
**Description:** As the system, I want all mobile API calls to use the logged-in technician's JWT so that sessions and evidence are attributed correctly.

**Acceptance Criteria:**
- [ ] APIClient.authenticate() accepts a JWT string (from Keychain) instead of requiring an API key
- [ ] All API calls send Authorization: Bearer <jwt> header
- [ ] If any API call returns 401, clear the stored token and redirect to LoginView
- [ ] Auto-join (listSessions(status: "capturing")) now correctly filters to the logged-in technician's sessions

## Functional Requirements
- FR-1: POST /api/mobile/login must validate against the same user table as NextAuth web login
- FR-2: JWT must contain sub (user ID), technicianId, organizationId, and exp claims
- FR-3: JWT must be signed with a server secret (NEXTAUTH_SECRET or dedicated JWT_SECRET)
- FR-4: authenticateRequest() must try JWT validation first, then fall back to legacy API key lookup
- FR-5: Keychain storage must use the KeychainAccess library (service: com.mechanicalvision.aerovision-glass)
- FR-6: The iOS app must not make any API calls before authentication succeeds
- FR-7: 401 responses from any API call must trigger automatic sign-out

## Non-Goals
- Registration / sign-up from mobile (users register on web only)
- Forgot password from mobile (use web browser)
- Biometric authentication (Face ID / Touch ID)
- Refresh token rotation
- Multi-device session management

## Technical Considerations
- Web app uses NextAuth with bcrypt password hashing — mobile login must use the same comparison
- KeychainAccess is already a project dependency
- APIClient is an actor — Keychain reads should happen before initializing requests
- AppEnvironment model handles Production vs Local base URLs
- JWT signing: use jsonwebtoken npm package or NextAuth JWT utilities

## Success Metrics
- Technician can log into iOS app with same credentials as web
- Session created on web is auto-joined by mobile app
- Evidence from both desk mic and glasses appears on the same session
- App stays logged in across force-quit and restart
