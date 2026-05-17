# secret-share-admin

Admin dashboard for the [send-a-secret.link](https://send-a-secret.link) ecosystem. Cognito-gated SPA + Lambda at `admin.send-a-secret.link` that shows registered Slack workspaces / Discord guilds and a redacted activity log.

**Privacy:** the admin never sees secret payloads — only metadata (handler, outcome, source, team_id/guild_id, timestamps, secret-id prefix). Server-side redaction strips bot tokens from workspace responses.

## Architecture

```
                              admin.send-a-secret.link
                                       │
                                  CloudFront
                                  /       \
                              S3 SPA     API GW HTTP v2 (JWT authorizer → Cognito)
                                                   │
                                        admin Lambda (monolith)
                                                   │
                            ┌─────────────────┬───┴────┬────────────────┐
                            ▼                 ▼        ▼                ▼
                    workspaces-table   installs-table  CloudWatch    CloudWatch
                       (slack)         (discord)       Logs Insights Metrics

         canary Lambda (daily) ─→ /api/put + /api/get on main app ─→ CanarySuccess metric
         slack-relay Lambda    ←─ SNS alerts ←─ alarms              ─→ Slack DM to Mike
```

## Repo layout

```
.
├── src/                          # Backend Lambda code
│   ├── handlers/                 # admin.ts (monolith) + canary.ts + slack-relay.ts
│   ├── routes/                   # one file per /api/admin/* route
│   └── lib/                      # log, response, router, insightsClient, ddbClient, jwt
├── frontend/                     # Vite + React 19 + MUI SPA
├── scripts/build.mjs             # esbuild + zip bundler
├── terraform/                    # Terragrunt — single admin module reused per env
└── Makefile
```

## Prerequisites

- Node 20 (`nvm use`)
- Terraform 1.5+
- Terragrunt
- AWS CLI configured for the `081823476824` account
- Pre-existing shared infra (do not create these):
  - S3 bucket `nesta-terraform-backend` (Terraform state)
  - DynamoDB table `nesta-terraform-locks` (state locking)
  - Route53 hosted zone `Z06715072NF77XVGMB1AG` for `send-a-secret.link`
  - ACM certificate `arn:aws:acm:us-east-1:081823476824:certificate/d9fbe85b-92c8-4507-bf1d-aaa398224862` (SAN: `send-a-secret.link` + `*.send-a-secret.link`)

## Quickstart

```bash
make install              # npm install (backend)
make install-frontend     # npm install (frontend)
make build                # bundle Lambda zips
make plan ENV=dev         # terragrunt plan (no apply)
make deploy ENV=dev       # terragrunt apply + s3 sync frontend + CF invalidation

make add-user EMAIL=nesta219@gmail.com ENV=dev   # create your Cognito user
```

After deploy, visit `https://admin-dev.send-a-secret.link/` and sign in with the temporary password emailed to you. First login forces a reset.

## Local frontend dev

```bash
make frontend-dev   # vite dev server on http://localhost:3000
                    # /api proxies to dev API Gateway
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/me` | Echo Cognito JWT claims |
| GET | `/api/admin/workspaces` | List Slack workspaces (bot_token redacted server-side) |
| GET | `/api/admin/guilds` | List Discord installs (guild + user installs) |
| GET | `/api/admin/events` | CloudWatch Logs Insights activity log |
| GET | `/api/admin/stats` | Aggregated counts from `SecretShare/${env}` metric namespace |
| GET | `/api/admin/health` | Alarm states, canary status, Lambda last-error timestamps |

All endpoints behind a Cognito JWT authorizer at the HTTP API Gateway — no auth code in the Lambda.

## Observability bundle (lives in this repo)

This repo owns the cross-stack observability layer:

- One CloudWatch dashboard (free, 3-per-account limit)
- 8 alarms (free, 10-per-region limit) covering: admin errors, admin p99, API Gateway 5xx, Slack command-worker errors, Slack OAuth callback errors, main `put-item` errors, canary failure, DynamoDB throttles
- 4 metric filters extracting `SecretsCreated` / `SecretsRetrieved` / `SlackInstalls` / `SlackUninstalls` from JSON logs in the main + slack repos
- Synthetic canary on a 5-min schedule (`__canary__` POST/GET round-trip)
- SNS alert topic → `slack-relay` Lambda → Slack DM via reused bot tokens
- AWS Budgets cost alerts (free, 2-per-account limit)

Total fixed cost: ~$0.05/mo.

## Activity log

V1 reads structured JSON logs from the other repos' CloudWatch log groups via Logs Insights. No new storage. 30-day retention is plenty for an admin tool. Upgrade path to a dedicated events DDB table is documented in the plan doc; not implemented in v1.

## Upstream-repo requirements

For the activity log and metric filters to work, the other repos must emit structured JSON logs containing `handler`, `outcome`, `source`, and (where applicable) `team_id` / `guild_id`. Status:

- ✅ `secret-share-slack` — already does this (see `src/lib/log.ts`); admin adds `source: 'slack'` field
- ✅ `secret-share-discord` — already does this; admin adds `source: 'discord'` field
- ⚠️ `secret-share` (main) — needs the logger ported in; plan doc has the diff

## Plan / spec

See `/Users/mnesta/.claude/plans/we-need-an-admin-declarative-kitten.md` (local plan file).
