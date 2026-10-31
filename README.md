# kestro

Lightweight, open-source, desktop-first web app for architectural construction observation reports.
Each practice deploys and configures its own instance on its own Firebase / Google Cloud project.

- Shared, project-level **observations** with stable identities, dated updates, dated status history and photos
- **Carry-forward**: each new report starts from the previous one, preselecting observations that were not resolved
- **Gap-free report numbering**; observation numbers (e.g. `18.3`) derive from their originating report
- Desktop **photo upload** with untouched originals, optimized derivatives and a project photo library
- Server-generated **PDF** with selectable text and thumbnails linked to a revocable public photo viewer
- Email-link sign-in for an **allowlist** of staff with admin / editor roles

Reports are continuously editable; there are no draft/issued states and no stored PDF archive. Each exported
PDF reflects the content at the time of export.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Firebase App Hosting · Cloud Firestore ·
Cloud Storage for Firebase · Firebase Authentication (email link) · pdfkit · sharp

## Quick start (local, against the Firebase Emulator Suite)

Requirements: Node.js 20+ and a Java runtime 21+ (for the emulators).

```bash
npm install
cp .env.example .env.local      # placeholder values work with the emulators
npm run emulators               # terminal 1
npm run dev                     # terminal 2 → http://localhost:3000/setup
```

See [docs/development.md](docs/development.md) for the first-admin setup, tests and architecture, and
[docs/deployment.md](docs/deployment.md) for the step-by-step GitHub and Firebase deployment guide.

## Status

| Milestone | State |
| --- | --- |
| M1 Foundation — scaffold, emulator, bootstrap, allowlist, rule/role tests | Implemented |
| M2 Report editor — projects, reports, contacts, settings, autosave, statuses | Implemented |
| M3 History / numbering — carry-forward, report deletion with gap-free renumbering | Implemented |
| M4 Photos / markup — upload, library, captions, public viewer done; **markup editor pending** | In progress |
| M5 PDF — template, linked thumbnails, pagination, preview = export | Implemented (annotated thumbnails follow M4) |
| M6 Migration / backup | Not started |
| M7 Deployment | Guide written; not yet executed |

## Security model (summary)

Browsers never access Firestore or Storage directly: both rule sets deny all client requests. All reads and
writes go through server code that validates the session cookie and re-checks the staff allowlist and role
on every request. Public photo links are opaque 192-bit tokens resolved server-side to exactly one photo.

## License

[MIT](LICENSE) © 2026 Anton Dekom
