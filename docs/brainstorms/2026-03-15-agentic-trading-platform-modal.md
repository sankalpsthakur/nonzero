---
date: 2026-03-15
topic: agentic-trading-platform-modal
---

# Agentic Trading Platform

## What We're Building

Build a web platform for Indian-market systematic research and supervised execution. The platform should let you:

- see backtest and live paper-trading results
- spawn more experiments and specialized agents
- watch live run logs, metrics, and artifacts
- compare hypotheses by alpha, return, and drawdown
- connect a Zerodha account through Kite Connect
- gate any real-money action behind explicit approval

The agentic core is not a chat widget bolted onto a dashboard. The product is an orchestration system where experiments, critiques, reruns, and deployment proposals are all agent-executed outcomes. The UI is the operator surface for visibility, review, and intervention.

## Why This Approach

Three architecture options were on the table:

### Option A: Single web app with in-process workers

This is the fastest way to start, but it collapses product, orchestration, and execution into one failure domain. It is fine for toy backtests and bad for long-lived research loops, live logs, or isolated agent execution.

### Option B: Web app plus generic job queue and VMs

This is workable, but runner lifecycle, isolation, live attach, filesystem management, and cleanup become your problem quickly. You end up building a sandbox control plane by hand.

### Option C: Web app plus Modal Sandboxes

This is the right fit here.

Why:

- You need isolated per-run environments for arbitrary strategy code and agent code.
- You need long-ish jobs with live logs and reproducible artifacts.
- You want programmatic sandbox creation, naming, tagging, listing, and reuse.
- You do not want research workers colocated with the user-facing web app.
- Modal is explicitly optimized for dynamically defined code sandboxes with sub-second startup and very large concurrency.

Recommendation: use Option C.

## Current External Constraints

### Kite Connect

For your use case, choose `Connect`, not `Personal`.

Reason:

- You want historical chart data APIs.
- You want live market quotes and ticks via API/WebSockets.
- The `Personal` tier explicitly excludes both.

For a private single-user platform, treat `Postback URL` as optional at first and prefer WebSocket order updates. Add postbacks later if you need server-side order event ingestion independent of the active session.

### Modal Sandboxes

The current Modal sandbox model supports exactly the execution pattern this platform needs:

- secure runtime-created containers
- named sandboxes
- tags for filtering and fleet visibility
- per-sandbox timeouts up to 24 hours
- volume mounts for persistent artifacts
- reattachment via `Sandbox.from_id` or `from_name`
- stdout/stderr streaming and command execution inside the sandbox
- snapshots for save/restore of filesystem and memory state
- tunnels when a run needs direct temporary access
- outbound network controls for tighter broker/data-provider security
- native observability for per-sandbox metrics, logs, and status

Design implication:

- Treat each experiment run as its own sandboxed execution unit.
- Keep app state in Postgres.
- Keep run artifacts in object storage and/or Modal Volumes.
- Do not use a shared mutable volume as your primary source of truth.

## Kite Connect App Setup

Use these values when creating the app.

### App choice

- Type: `Connect`
- App name: `AlphaLab`
- Zerodha Client ID: your own client ID, for example `AB1234`

### URLs

Use production-shaped URLs from day one even in staging.

- Redirect URL: `https://trading.yourdomain.com/api/brokers/zerodha/callback`
- Postback URL: `https://trading.yourdomain.com/api/brokers/zerodha/postback`

If you are not using postbacks in v1, keep the route live anyway and return `200 OK`.

### Description

Use:

`Agentic web platform for Indian equities research, backtesting, experiment orchestration, and supervised order execution using Zerodha Kite Connect.`

### Secret handling

- `API_KEY` may appear in client redirects and the server config.
- `API_SECRET` must be server-only.
- Access tokens belong in encrypted broker session storage, not in the browser.

## Product Surfaces

### 1. Overview

Single page answering:

- What is the best strategy today?
- What is running right now?
- What is waiting for approval?
- What changed since yesterday?

Widgets:

- frontier leaderboard
- active sandboxes
- live paper/live capital status
- approval inbox
- market regime summary

### 2. Experiments

This is the core research surface.

Capabilities:

- create experiment family
- fork an existing run
- spawn N new hypotheses
- compare metrics and artifacts
- promote best run to paper/live candidate

Views:

- experiment table
- run diff
- equity curve / drawdown chart
- factor attribution
- artifact explorer

### 3. Live Runs

This is the Modal fleet view.

For each run show:

- sandbox id
- experiment id
- hypothesis
- machine status
- current command
- heartbeat timestamp
- stdout/stderr tail
- attached artifacts
- terminate / retry / clone actions

### 4. Agents

Every agent gets its own page:

- mandate
- current task
- tool access
- recent decisions
- success/failure rate
- spawned children

### 5. Brokerage

This is where Zerodha connectivity lives:

- broker status
- auth/session expiry
- order intents
- approvals
- positions
- fills
- kill switch

### 6. Backtests

A dedicated analytics surface:

- benchmark-relative returns
- alpha
- Sharpe / Sortino
- max drawdown
- turnover
- transaction cost sensitivity
- regime breakdown

## User Roles

### Operator

Uses the dashboard, spawns runs, reviews logs, approves live actions.

### Research Agent

Generates and mutates hypotheses, config files, factor blends, and experiment plans.

### Execution Agent

Runs backtests or paper/live deployment workflows inside Modal sandboxes.

### Critic Agent

Reads results, detects overfit, rejects weak improvements, and writes comparison notes.

### Broker Agent

Prepares order intents and reconciliation reports. It never bypasses approval for real-money actions.

## Agent-Native Capability Map

| UI Action | Agent Capability | Backing Tool / Service |
|---|---|---|
| View experiments | Yes | `list_experiments` |
| Spawn experiment | Yes | `create_experiment` |
| Fork run | Yes | `fork_run` |
| View run logs | Yes | `get_run_events`, `attach_run_stream` |
| Stop run | Yes | `terminate_run` |
| Compare runs | Yes | `compare_runs` |
| Approve live order | Yes, but approval required | `approve_order_intent` |
| Place live order | Only after approval | `submit_order_intent` |
| Rotate broker session | Assisted | `start_broker_auth`, `complete_broker_auth` |
| Change capital limits | Yes, but approval required | `update_risk_policy` |
| Promote strategy to paper trading | Yes | `deploy_strategy` |
| Promote strategy to live trading | Yes, but approval required | `deploy_live_strategy` |

Parity rule:

Anything the operator can do in the UI must have an equivalent tool the agent can call. Real-money actions stay parity-complete but approval-gated.

## System Architecture

### Frontend

Use `Next.js`.

Why:

- strong dashboard ergonomics
- streaming-friendly UI
- simple auth and route handling
- good fit for experiment tables, logs, and charts

Primary routes:

- `/`
- `/experiments`
- `/experiments/:id`
- `/runs/:id`
- `/agents`
- `/broker`
- `/approvals`
- `/settings`

### API / Control Plane

Use `FastAPI` or `Next.js` route handlers for the app API, but keep orchestration logic in a separate service layer.

The API should own:

- auth
- experiment CRUD
- run scheduling requests
- live event fanout
- approval state machine
- broker callbacks

### Data Plane

Use `Postgres` as source of truth.

Core tables:

- `users`
- `broker_accounts`
- `broker_sessions`
- `datasets`
- `experiment_families`
- `experiments`
- `runs`
- `run_events`
- `artifacts`
- `agent_profiles`
- `agent_tasks`
- `approval_requests`
- `order_intents`
- `orders`
- `fills`
- `risk_policies`
- `deployments`

Use object storage for larger outputs:

- parquet
- charts
- HTML reports
- notebooks
- zipped workspaces

### Runner Layer

Use `Modal Sandboxes`.

Pattern:

1. API creates run record in Postgres.
2. Scheduler creates a Modal Sandbox with:
   - experiment tags
   - run id
   - agent type
   - strategy family
3. Sandbox pulls code or mounts an immutable image.
4. Sandbox writes heartbeats and events back to API.
5. Sandbox stores artifacts to object storage and lightweight metadata to Postgres.
6. API marks run completed, failed, stopped, or blocked.

### Sandbox Strategy

Use one sandbox per run attempt.

Why:

- strong isolation
- simple cleanup
- clean logs
- deterministic artifact ownership

Naming:

- `run-<experiment_id>-<attempt>`

Tags:

- `project=alpha-lab`
- `env=prod`
- `family=<family_slug>`
- `agent=<agent_kind>`
- `market=india`

### Modal Volumes

Use Volumes only for:

- shared read-mostly datasets
- cached model assets
- reusable code snapshots

Do not use a shared writable volume as the system of record for run state. Modal explicitly requires commit/reload semantics and last-write-wins behavior is a poor fit for concurrent coordination.

## Execution Model

### Experiment lifecycle

1. User or agent creates experiment family.
2. Research agent proposes hypotheses.
3. Execution agent spawns one sandbox per hypothesis.
4. Sandbox runs backtest or paper-sim.
5. Critic agent scores results.
6. Best run is either:
   - kept as research result
   - promoted to paper trading
   - promoted to live candidate pending approval

### Completion signals

Each agent task needs an explicit terminal state:

- `success`
- `partial`
- `blocked`
- `failed`
- `stopped`

Do not infer completion from silence.

### Resume model

If a sandbox dies, create a new attempt with:

- prior config
- prior artifacts
- prior partial checkpoints

Store checkpoint pointers in Postgres, not only inside the sandbox filesystem.

## Approval Gates

This is a high-stakes financial system. Approval policy must be strict.

### Auto-apply

- spawn backtest
- rerun failed experiment
- generate report
- compare strategies
- update internal notes

### Quick confirm

- promote strategy to paper trading
- widen experiment budget
- add a new watchlist universe

### Explicit approval

- place live order
- modify max loss / max capital policy
- enable auto-trading
- rotate production broker credentials
- cancel protective orders

## Zerodha Integration Design

### Auth flow

1. User clicks `Connect Zerodha`.
2. Backend generates auth URL using `API_KEY`.
3. Zerodha redirects to the app callback route.
4. Backend exchanges request token for access token using `API_SECRET`.
5. Session metadata is stored encrypted.

### Market data

Use:

- historical chart APIs for research/backtests
- WebSocket ticks for live dashboards and paper/live strategy monitoring

### Orders

Never let agents submit raw broker orders directly from the browser.

Flow:

1. Agent creates `order_intent`
2. Risk layer validates
3. Approval requested if environment is `live`
4. Server-side broker service submits order
5. Fills and postbacks/WebSocket updates reconcile back into state

## Suggested Technical Stack

### Web

- Next.js
- TypeScript
- Tailwind or shadcn/ui-level components
- Recharts or ECharts

### Backend

- FastAPI or Next API routes
- Postgres
- Redis for ephemeral pub/sub if needed
- object storage for artifacts

### Orchestration

- Modal Sandboxes
- Modal Queue for job fanout
- Modal Cron for scheduled scans, nightly runs, and report generation

### Analytics

- Python strategy runners
- vectorized backtests for v1
- explicit transaction cost and slippage model

## Minimal V1

Ship this first:

1. Kite Connect auth
2. experiment CRUD
3. spawn sandboxed backtests
4. live run logs
5. leaderboard
6. approval inbox
7. paper trading only

Do not ship live auto-execution in v1.

## V2

- live Zerodha deployment with explicit approval
- multi-agent hypothesis tournaments
- experiment templates by market regime
- walk-forward validation and overfit detection
- portfolio construction across multiple strategies

## Open Questions

- Is this single-user or multi-user from day one?
- Do you want only Indian equities, or also futures/options later?
- Is v1 paper-only, or do you want supervised live order placement immediately?
- Should Modal also host the API, or only the runner layer?
- Do you want daily session re-auth workflows visible to the operator?

## Next Steps

1. Create the Kite Connect app as `Connect`.
2. Scaffold the web app and control-plane schema.
3. Implement broker auth callback and session storage.
4. Implement Modal sandbox run creation and event ingestion.
5. Build the experiments and live-runs UI first.

## Sources

- Kite Connect app products: https://developers.kite.trade/
- Historical data API: https://kite.trade/docs/connect/v3/historical/
- WebSocket/live quote docs: https://kite.trade/docs/connect/v3/websocket/
- Postbacks: https://kite.trade/docs/connect/v3/postbacks/
- Modal Sandboxes guide: https://modal.com/docs/guide/sandbox
- Modal Sandbox reference: https://modal.com/docs/reference/modal.Sandbox
- Modal Volumes guide: https://modal.com/docs/guide/volumes
- Modal web endpoints: https://modal.com/docs/guide/webhooks
- Modal Queue reference: https://modal.com/docs/reference/modal.Queue
- Modal Cron guide: https://modal.com/docs/guide/cron
- Modal deployment guide: https://modal.com/docs/guide/managing-deployments
- Modal preemption guide: https://modal.com/docs/guide/preemption
