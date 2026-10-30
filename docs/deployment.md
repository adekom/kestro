# Deployment guide

Step-by-step setup of GitHub and Firebase for one practice's Kestro instance. Each stage ends with a
verification. Never paste secrets into chat, commit them, or commit service-account keys.

Record as you go:

| Item | Value |
| --- | --- |
| GitHub repository URL | |
| Firebase project ID (production) | |
| Firebase project ID (development, optional) | |
| Region (Firestore, Storage, App Hosting) | |
| Storage bucket name | |
| App Hosting backend name | |
| Public URL (hosted.app or custom domain) | |

## D0 — GitHub account, Git and repository

1. Create or sign in to GitHub at <https://github.com/signup>. Verify your email and enable two-factor
   authentication (*Settings → Password and authentication*). Prefer a repository owned by a GitHub
   organization the practice controls.
2. Decide: a single public upstream repository, or public upstream plus a separate private deployment repository.
3. Create the repository `kestro` with a description. Choose an open-source license only after the owner decides.
4. Install Git (<https://git-scm.com/downloads>) and Node.js LTS (<https://nodejs.org>). Verify:
   `git --version` and `node --version`.
5. Configure Git: `git config --global user.name "Your Name"` and `git config --global user.email "you@firm.com"`.
   Authenticate with GitHub CLI (`gh auth login`), SSH, or HTTPS via Git Credential Manager.
6. Connect this folder: `git remote add origin https://github.com/OWNER/kestro.git`.
7. Check `git status` and the staged diff (no `.env.local`, credentials, photos or PDFs), then
   `git commit -m "chore: initialize Kestro"` and `git push -u origin main`. Confirm the files on GitHub.

Workflow afterwards: work on feature branches, open pull requests, require the checks (`typecheck`, `lint`,
`test`) to pass, protect `main`, and merge. App Hosting deploys automatically from the deployment branch.

## D1 — Firebase project, billing and CLI

1. Use a firm-controlled Google account with recovery options and a second owner.
2. At <https://console.firebase.google.com> create the project. Record its exact **project ID** and choose a region
   close to the office (for example `us-central1` / `nam5`, or `europe-west1`).
3. Upgrade to **Blaze** (pay-as-you-go) — required by App Hosting — and link a Cloud Billing account.
4. In Google Cloud Console → *Billing → Budgets & alerts*, add alerts (e.g. $10 / $25 / $50). Alerts notify; they do not cap spending.
5. Sign in to the CLI: `npx firebase login`, then `npx firebase use --add` and select the project (alias `prod`).
   Prefer a second project for development (alias `dev`).

**Verify:** `npx firebase projects:list` shows the project.

## D2 — Services and authentication

1. **Firestore:** Console → *Firestore Database → Create database*, **Native mode**, chosen region, production rules.
   Deploy rules and indexes from source: `npx firebase deploy --only firestore`.
2. **Storage:** Console → *Storage → Get started*. Record the bucket name (e.g. `PROJECT.firebasestorage.app`).
   Deploy rules: `npx firebase deploy --only storage`.
3. **Authentication:** Console → *Authentication → Sign-in method* → enable **Email/Password** and **Email link
   (passwordless sign-in)**. Under *Settings → Authorized domains* add the App Hosting domain and any custom domain.
4. Check current Firebase documentation for email-link configuration, daily email quotas and sending restrictions.

**Verify:** with `npm run test:emulator` passing locally, the deployed rules are identical (deny-all for clients).

## D3 — App Hosting and GitHub integration

1. Console → *Build → App Hosting → Get started*. Authorize GitHub for the intended owner/repository, select
   `kestro`, branch `main`, app root `/`, and a backend name and region.
2. Register a Web app (*Project settings → Your apps → Web*) and copy its config values into `apphosting.yaml`
   (`NEXT_PUBLIC_FIREBASE_*`) — these are public identifiers, not secrets. Set `KESTRO_PUBLIC_BASE_URL` to the
   stable public URL.
3. Create the bootstrap secret in Secret Manager and grant the backend access:
   `npx firebase apphosting:secrets:set kestro-bootstrap-secret` (enter a long random value when prompted).
4. Merge to `main`; watch the rollout in App Hosting. Open the `*.hosted.app` URL.
5. Visit `/setup`, sign in by email link, enter the bootstrap secret. Setup then closes permanently.
6. Invite one editor under *Settings → Staff* and confirm: the editor can sign in; an unlisted email and a disabled
   user cannot; the editor cannot see *Settings*.

**Verify:** sign-in callback, project and report creation, photo upload, public photo link, PDF export.

## D4 — Domain, onboarding and final checks

1. Optional but recommended **before circulating PDFs**: App Hosting → *Settings → Domains* → add a custom domain
   (e.g. `reports.firm.com`), create the DNS records shown, wait for HTTPS. Add it to Auth authorized domains and set
   `KESTRO_PUBLIC_BASE_URL` to it. Photo links in exported PDFs embed this URL, so it must stay stable.
2. Configure *Settings*: organization name, address, contact line, logo, field visibility, disclaimer, footer,
   status names and colors, the resolved status, and the summary default. Add staff.
3. Run the end-to-end scenario: create two reports with carry-forward, attach photos, share a link, export PDFs.
4. Set up monitoring (Cloud Logging error alerts) and confirm billing alerts.
5. Rollback: revert the commit on GitHub (`git revert <sha>` + push) or roll back to a previous rollout in App Hosting.

Public photo links are bearer links: anyone who has a PDF can forward them. Admins can revoke individual links.
