# Anime Orchestrator

Anime Orchestrator is an AI-assisted production workspace for managing story canon, characters, scenes, storyboards, shots, continuity reviews, and generation jobs. The application serves three surfaces from one Node.js service:

- The React application at `/`
- The existing REST API under `/api`
- The remote Model Context Protocol (MCP) endpoint at `/mcp`

The original AI Studio project is available at <https://ai.studio/apps/d9bb3a78-ebfa-4a94-a54d-870e736c738b>.

> **Canon data warning:** the repository's existing `data/db.json` is legacy demonstration data, not approved Crimson Sword canon. It contains imagery and lore that conflict with the supplied storyboard references. MCP exposes those records as unversioned/draft material and blocks prompt compilation until reviewed sources are explicitly approved and locked. Do not promote that seed wholesale; import the actual references as drafts and review each canon change.

## Requirements

- Node.js 22
- npm 10 or newer
- A Gemini API key for live Gemini-backed features
- A stable HTTPS deployment before connecting a remote Codex client

## Local setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the secrets locally. Never commit `.env`.

   PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   macOS or Linux:

   ```sh
   cp .env.example .env
   ```

3. Generate separate high-entropy values for `INTEGRATION_TOKEN_PEPPER` and `INTEGRATIONS_ADMIN_TOKEN`. Run this command twice and store the outputs in a password manager or local secret store:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

4. Start the development server:

   ```sh
   npm run dev
   ```

The application is available at <http://localhost:3000>, the REST API under <http://localhost:3000/api>, and MCP at `http://localhost:3000/mcp`.

With the secure defaults in `.env.example`, open **Codex Integrations** first, establish the administrator session, and then refresh the workspace so the protected legacy project reads can load. Do not enable `ALLOW_INSECURE_LOCAL_API` on a shared machine or non-loopback deployment.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `3000`; hosted platforms normally inject this value. |
| `NODE_ENV` | Yes in deployment | Use `development` locally and `production` for a built deployment. |
| `PUBLIC_BASE_URL` | Yes | Public origin without a trailing slash, such as `http://localhost:3000` or the stable HTTPS service URL. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated browser origins allowed to call the service. Use exact origins in production, not `*`. |
| `MCP_ALLOWED_HOSTS` | Yes in deployment | Comma-separated hostnames accepted by `/mcp` to prevent Host-header/DNS-rebinding attacks. |
| `TRUST_PROXY_HOPS` | For reverse proxies | Number of trusted proxy hops used for client IP rate limiting. Use the value required by the deployment platform. |
| `GEMINI_API_KEY` | For live AI features | Server-side Gemini credential. Never expose it to the browser bundle. |
| `INTEGRATIONS_DB_PATH` | Yes | Path to the integrations SQLite database in local/single-instance mode. Its parent directory must be writable and persistent. |
| `INTEGRATION_TOKEN_PEPPER` | Yes | High-entropy server secret used when hashing integration tokens. Keep it stable; rotating it invalidates existing token verification. |
| `INTEGRATIONS_ADMIN_TOKEN` | Yes | Separate high-entropy credential used to establish an integrations-administration session. It is not an MCP bearer token. |
| `REQUIRE_LEGACY_WRITE_AUTH` | Recommended; `true` in production | Requires authentication for legacy REST write routes instead of leaving them available to anonymous callers. |
| `REQUIRE_LEGACY_READ_AUTH` | Recommended; `true` in production | Requires an integrations-admin session before the legacy REST API exposes production data. |
| `ALLOW_INSECURE_LOCAL_API` | No | Development-only loopback escape hatch. Keep `false`; when enabled it disables legacy REST authentication and binds to loopback unless `HOST` overrides it. |
| `MCP_AUTH_FAILURE_LIMIT` | No | Maximum failed MCP authentication attempts allowed during the configured limiter window. |
| `MCP_GENERATION_RATE_LIMIT` | No | Maximum MCP generation requests allowed during the configured limiter window. |
| `GENERATION_PRICING_JSON` | Before generation | Trusted server-side micro-dollar rates keyed by `provider:model:resolution`. Missing prices block job creation. |
| `ALLOW_SIMULATED_GENERATION` | No | Development-only switch for the legacy stock-video simulator. Keep `false`; production ignores `true`. |

Production secrets belong in the deployment platform's secret manager. Do not provide them as Docker build arguments, bake them into an image, commit them, print them in logs, or store them in client-side code or `localStorage`.

## Verification

Run the complete check before deploying:

```sh
npm run lint
npm test
npm run build
npm start
```

`npm start` serves the previously built output, so run `npm run build` first and set `NODE_ENV=production`. Verify at minimum:

- The web application loads at `/` on desktop and mobile widths.
- The health/status response and REST reads are available.
- `/mcp` rejects missing or invalid bearer credentials.
- A valid read-only token can initialize MCP and list its permitted projects.
- Read-only and cross-project writes are rejected.
- Locked canon cannot be overwritten through REST or MCP.
- Draft writes and audit events are persisted.
- No server credential appears in the browser bundle or logs.

## Integration-token workflow

Open **Codex Integrations** in Anime Orchestrator and establish an admin session using the separately managed `INTEGRATIONS_ADMIN_TOKEN`. From there:

1. Create a token with a name, expiration, project grants, and read-only or read-write permission.
2. Copy the full token when it is displayed. It is shown only once; the server stores only its cryptographic hash.
3. Store the token in a local environment variable or secret manager, never in application configuration or browser storage.
4. Use the connection test to verify project scope and permissions.
5. Revoke the token immediately if it is exposed or no longer needed.

External writes begin as drafts. Promoting a draft to locked canon is a separate approval operation and should be performed only after reviewing its old value, proposed value, affected assets, and continuity impact.

## Generation safety boundary

`create_generation_job` seals the reviewed prompt, calculates cost from trusted server-side pricing, and returns a one-use confirmation token without starting external work. `confirm_generation_job` consumes that token, reserves the project budget, and durably moves the exact reviewed job to `Queued`.

This repository does not contain a live Veo/provider worker or provider credentials. A separate trusted worker must claim queued jobs, submit them to the selected provider, and write progress, outputs, and redacted errors back to the generation record. Do not grant `generations:write` in production until that worker is deployed and tested. The old REST stock-video simulator is disabled by default and is always disabled in production; it must never be represented as real generated footage.

## Connect Codex locally

Set the token that was displayed once when it was created:

PowerShell:

```powershell
$env:ANIME_ORCHESTRATOR_TOKEN = "<token-shown-once>"
```

macOS or Linux:

```sh
export ANIME_ORCHESTRATOR_TOKEN="<token-shown-once>"
```

Add this configuration to Codex:

```toml
[mcp_servers.anime_orchestrator]
enabled = true
required = true
url = "http://localhost:3000/mcp"
bearer_token_env_var = "ANIME_ORCHESTRATOR_TOKEN"
startup_timeout_sec = 20
tool_timeout_sec = 120
```

The configuration intentionally contains only the environment-variable name. Never replace `bearer_token_env_var` with the token or commit the token to a Codex configuration file. Inspect the connection with `/mcp` inside Codex.

## Container build

Build and run the production image locally:

```sh
docker build -t anime-orchestrator .
docker run --rm -p 3000:3000 --env-file .env -e NODE_ENV=production -v anime-orchestrator-data:/app/data anime-orchestrator
```

The named volume preserves `data/db.json` and the integrations SQLite database between local container runs. The image does not contain `.env` or any real credential.

## Stable HTTPS deployment

The AI Studio preview URL is not a permanent MCP integration endpoint. Deploy the container to a stable HTTPS service such as Google Cloud Run and use its service URL or a custom domain:

```text
https://your-anime-orchestrator-domain.example/mcp
```

For Cloud Run:

1. Build and publish the image to Artifact Registry.
2. Deploy it with `NODE_ENV=production`, an HTTPS `PUBLIC_BASE_URL`, exact `ALLOWED_ORIGINS`, `MCP_ALLOWED_HOSTS`, the correct `TRUST_PROXY_HOPS`, both legacy auth flags set to `true`, trusted pricing, and the rate limits as ordinary environment configuration.
3. Supply `GEMINI_API_KEY`, `INTEGRATION_TOKEN_PEPPER`, and `INTEGRATIONS_ADMIN_TOKEN` through Secret Manager references.
4. Let Cloud Run provide `PORT`; do not hard-code the externally visible port.
5. Configure a request timeout longer than the Codex `tool_timeout_sec` and verify that Streamable HTTP responses are not buffered by any proxy in front of the service.
6. Restrict CORS to the exact production UI origins. Codex still authenticates independently with its scoped bearer token.
7. Run the verification suite and an MCP connection test against the final HTTPS URL.

The service generally needs public network reachability for Codex to connect, but `/mcp` must continue to require application-level bearer authentication. Public reachability is not authorization.

Use the deployed endpoint in Codex while retaining the environment-variable token reference:

```toml
[mcp_servers.anime_orchestrator]
enabled = true
required = true
url = "https://your-anime-orchestrator-domain.example/mcp"
bearer_token_env_var = "ANIME_ORCHESTRATOR_TOKEN"
startup_timeout_sec = 20
tool_timeout_sec = 120
```

## Persistence warning

The container filesystem and Cloud Run's writable filesystem are ephemeral. A default SQLite path inside the container is suitable only for local development or a deliberately constrained single-instance deployment with a correctly mounted durable volume.

Do not run multiple service instances against independent SQLite files: tokens, audit events, drafts, confirmations, and MCP session state will diverge. Do not place SQLite on an object-storage mount that does not provide SQLite-compatible locking. For reliable production and horizontal scaling, use a shared transactional database and a durable job queue; configure backups and test restoration before storing production canon.

After deployment, update `PUBLIC_BASE_URL` to the final stable HTTPS origin and use that same origin in the copyable Codex configuration.
