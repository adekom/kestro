# Development

## Prerequisites

- Node.js 20 or newer (`node --version`)
- Java 21+ for the Firebase Emulator Suite (`java -version`). On Windows: `winget install Microsoft.OpenJDK.21`
- The Firebase CLI is a project dev dependency; run it with `npx firebase …` (no global install needed)

## Running locally

```bash
npm install
cp .env.example .env.local
npm run emulators        # Auth :9099, Firestore :8080, Storage :9199, Emulator UI :4000
npm run dev              # http://localhost:3000
```

`npm run emulators` imports from and exports to `./emulator-data` (git-ignored), so local data survives restarts.

### First administrator (one-time bootstrap)

1. Open <http://localhost:3000/setup> (it returns 404 once setup is complete, or if `KESTRO_BOOTSTRAP_SECRET` is unset).
2. Enter your email and request a setup link. The Auth emulator doesn't send email: open the Emulator UI →
   Authentication, or check the emulator terminal output, and open the printed sign-in link in the same browser.
3. Enter the `KESTRO_BOOTSTRAP_SECRET` value from `.env.local` and press **Continue**.
4. You are now the administrator. Add staff under **Settings → Staff**; they sign in at `/login`.

## Checks

```bash
npm run typecheck
npm run lint
npm test                 # unit tests (pure domain rules), no emulator needed
npm run test:emulator    # starts the emulators, runs integration + security-rule tests, stops them
```

## Architecture

```
src/
  app/                 Next.js routes
    (app)/             signed-in application (layout enforces the session)
    api/               session, bootstrap, uploads, authorized + public image delivery, PDF
    p/[token]/         public read-only photo viewer
    actions.ts         server actions — the only UI write path; each checks session + role
  server/              server-only code (Admin SDK)
    auth.ts            session cookie validation, allowlist, role checks
    services/          domain operations (projects, reports, observations, photos, settings, users)
    pdf/               PDF rendering (preview and export share one path)
  lib/                 shared types and pure domain rules (unit-tested)
  components/          UI building blocks
tests/emulator/        integration tests against the Emulator Suite
```

### Key decisions

- **Server-only data access.** Firestore and Storage rules deny every client request. The browser uses Firebase
  only for email-link authentication, then exchanges the ID token for an httpOnly session cookie
  (`/api/session`). This makes "deny by default" literal and keeps all authorization in one place.
- **Allowlist keyed by email.** `/users/{email}` lets admins invite staff before their first sign-in (the UID is
  unknown until then). The UID is recorded at first sign-in.
- **Stable IDs vs display numbers.** Reports, observations, photos and attachments use UUIDs for document IDs,
  references and Storage paths. `report.sequence` is the mutable display number. An observation's display
  number (`18.3`) is computed at read time from its origin report's *current* sequence plus its origin-local
  sequence, so renumbering touches only report documents.
- **Sequence allocation** happens in a Firestore transaction that reads the project document and its live
  reports, so concurrent creation retries instead of producing duplicate numbers.
- **History is date-scoped.** Status events, updates and photo attachments carry the visit date of the report they
  were recorded in. A report shows only items dated on or before its visit (`lib/domain.ts → applicableToReport`).
- **Concurrent edits** to report information and observations are detected with a version counter; a stale save is
  rejected and the editor asks the user to reload instead of overwriting.
- **Photo detach** hides an attachment without deleting files, and its public link keeps working because it may
  already appear in an exported PDF. Revocation is a separate, admin-only action.

### Images

JPEG and PNG are supported. Originals are stored byte-for-byte; a 2048 px web image and a 480 px thumbnail are
derived (EXIF-rotated). **HEIC/HEIF** is rejected with a message: the prebuilt `sharp` binaries do not include a
HEIC decoder. Fallback: export as JPEG before upload (Photos on macOS: *File → Export*; on iPhone set
*Settings → Camera → Formats → Most Compatible*; on Windows use the Photos app *Save as*).

### PDF

Rendered with pdfkit using the standard Helvetica fonts (real, selectable text). These fonts cover Western
European characters; full Unicode would require embedding an open-licensed TTF.
