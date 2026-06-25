# Oh My CV Cloud Sync Plan

## Decision

Use GitHub Secret Gist as the first cloud sync backend.

Oh My CV remains local-first. Users can keep using the app without signing in. If they opt in, the app signs in to GitHub, creates or reuses one secret gist, and syncs the full local workspace to that gist.

The MVP stores plain JSON in the user's own GitHub Secret Gist. This is intentionally low-friction. It is not zero-knowledge encryption.

## Why GitHub Gist

- It matches the product audience: Markdown-oriented users are likely to understand GitHub.
- The data lives in the user's GitHub account, not an Oh My CV database.
- It keeps the existing static-site architecture viable.
- A single gist is enough for all resumes because resume data is small.

## Privacy Boundary

Resume data is private enough to deserve explicit disclosure: names, contact details, work history, education, links, and job-search intent can all appear in a resume.

Secret Gist is a practical hiding mechanism, not a strict privacy boundary. GitHub documents that secret gists are not searchable in public discovery, but anyone with the URL can read them. Therefore the UI must not call this "private encrypted sync".

Current UX copy should say:

> Resume data is saved as plain JSON in your GitHub Secret Gist. Secret gists are not searchable, but anyone with the URL can read them.

Future privacy mode can add optional client-side encryption, but it should not be the default sync path because requiring a second sync password makes cross-device sync less useful.

References:

- GitHub: Creating gists, including the Secret Gist privacy note: https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists
- GitHub REST API: create and update gists with `public: false`: https://docs.github.com/en/rest/gists/gists
- GitHub OAuth Device Flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

## Auth Flow

MVP uses GitHub OAuth Device Flow because this project is currently built as a static Nuxt site. The traditional OAuth web flow requires exchanging an authorization code with a client secret, which should not be embedded in a browser bundle.

Runtime config:

```bash
NUXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID=<github-oauth-app-client-id>
NUXT_PUBLIC_GITHUB_OAUTH_PROXY_BASE=<oauth-proxy-base-url>
```

The GitHub OAuth app must have Device Flow enabled and request the `gist` scope.

GitHub's Device Flow OAuth endpoints do not allow browser CORS requests. The app must call a same-origin Nuxt server route in development, or a tiny CORS proxy in production static hosting.

Local development defaults to:

```bash
NUXT_PUBLIC_GITHUB_OAUTH_PROXY_BASE=/api/github
```

GitHub Pages cannot run Nuxt server routes, so production must set `NUXT_PUBLIC_GITHUB_OAUTH_PROXY_BASE` to an external worker such as Cloudflare Workers. The worker only forwards OAuth device-code and access-token requests; it does not store tokens or resume data.

User flow:

1. User opens GitHub Sync from the header.
2. User clicks Connect GitHub.
3. App shows GitHub's device code and opens `https://github.com/login/device`.
4. User confirms the code on GitHub.
5. App receives an access token and stores it locally in IndexedDB/localForage.
6. App creates or reuses one sync gist.

## Gist Layout

One user gets one sync gist.

```txt
ohmycv-sync.json
README.md
resume-1729000000000.md
resume-1729000000001.md
```

`ohmycv-sync.json` is the source of truth. Markdown files are readable copies only.

```json
{
  "schema": 1,
  "app": "oh-my-cv",
  "storageVersion": "v1",
  "updated_at": "1710000000000",
  "device_id": "browser-device-id",
  "data": {
    "1729000000000": {
      "name": "Backend Engineer Resume",
      "markdown": "...",
      "css": "...",
      "styles": {},
      "created_at": "1729000000000",
      "updated_at": "1729001000000"
    }
  },
  "deleted": {
    "1728999999999": "1729002000000"
  }
}
```

The app intentionally stores all resumes in one JSON file because the local storage model already treats the workspace as a single data object. This preserves:

- multiple resumes
- resume names
- Markdown
- custom CSS
- paper size, margins, fonts, colors, line height, and paragraph spacing
- created/updated timestamps
- storage schema version for future migrations

## Sync Algorithm

Local storage remains the immediate source of truth while the user edits.

Triggers:

- create resume
- save resume
- rename resume
- duplicate resume
- delete resume
- import JSON
- app startup when already connected
- manual Sync now

Flow:

1. Build a local sync document from IndexedDB/localForage.
2. Fetch the remote `ohmycv-sync.json`.
3. If the remote document is newer than the last document this device synced, and
   this device has no unsynced local changes, apply the remote document locally.
4. Otherwise, compare local and remote against the last successfully synced
   `baseDocument` stored on this device.
5. If only one side changed a resume from base, keep the changed side.
6. If both sides changed the same resume from base:
   - non-overlapping fields are merged automatically
   - Markdown and custom CSS are merged with a line-based diff3 merge when possible
   - delete/modify, create/create, or overlapping field edits become explicit conflicts
7. Deletions use tombstones in `deleted`; if `deleted_at` is newer than a resume record, the resume stays deleted.
8. If conflicts exist, stop the sync before applying or uploading either side. The
   local sync state stores `base`, `local`, and `remote` entries for review.
9. If there are no conflicts, apply the resolved document locally.
10. Upload the resolved document and regenerated Markdown copies to the gist if it differs from the remote.

This is still local-first and single-user oriented, but it no longer silently
overwrites diverged edits from another device.

## Conflict Policy

Current conflict handling uses the same core idea as Git: keep a common ancestor
and run a three-way merge.

The common ancestor is `baseDocument`, saved locally after every successful sync.
It is not uploaded to the gist. Remote data remains a plain schema-1 sync document.

If a conflict is detected, the sync dialog offers two coarse resolution actions:

- use the remote version
- keep the local version and upload it to the gist

Future improvements can build on the stored conflict entries:

- per-resume conflict copies, e.g. `Resume (conflict from MacBook)`
- visible sync history
- manual merge editor for Markdown, CSS, and structured style conflicts

## Current Implementation Scope

Implemented:

- GitHub Device Flow connection
- local sync state persisted via localForage
- create/reuse one Secret Gist
- `ohmycv-sync.json` source-of-truth file
- readable `resume-*.md` files
- storage change listener
- debounced push after local changes
- startup/manual pull-merge-push
- tombstones for deletions
- Header UI with connect, device code, sync now, disconnect
- English, Chinese, and Spanish i18n strings
- Cloudflare Worker OAuth proxy in `packages/github-oauth-worker`

Not implemented yet:

- optional client-side encryption
- normal OAuth popup flow via backend token broker
- deleting the remote gist from the UI
- conflict review UI
- automated browser E2E coverage with a real GitHub account

## Production Notes

If the project later moves away from pure static hosting, a backend token broker can provide a smoother "Sign in with GitHub" OAuth popup. Keep the Device Flow path as a static-compatible fallback.

Do not request broader GitHub permissions than `gist` for the Gist backend. If private repo sync is added later, implement it separately as an advanced backend, preferably through a GitHub App with repository-scoped permissions.

For GitHub Pages, configure repository Actions variables:

```txt
NUXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID=<github-oauth-app-client-id>
NUXT_PUBLIC_GITHUB_OAUTH_PROXY_BASE=https://<worker-host>
```

The worker also accepts `/github/device-code` and `/github/access-token`, so `NUXT_PUBLIC_GITHUB_OAUTH_PROXY_BASE=https://<worker-host>/github` is valid if the worker is mounted behind a shared domain route.

Deploy the OAuth proxy:

```bash
pnpm install
pnpm --filter=@ohmycv/github-oauth-worker typecheck
pnpm deploy:github-oauth-worker
```

GitHub Actions deploys the worker from `.github/workflows/deploy-github-oauth-worker.yaml` when worker-related files change on `main`, or when the workflow is run manually. Add this repository secret before relying on CI deployment:

```txt
CLOUDFLARE_API_TOKEN=<cloudflare-workers-api-token>
```

The worker CORS allowlist is configured in `packages/github-oauth-worker/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://zeevenn.github.io,http://localhost:3000,http://127.0.0.1:3000"
```

Add the final site origin before deploying if the app is not served from `https://zeevenn.github.io`. Keep this list explicit; the OAuth proxy should not be a public open CORS proxy.
