---
date: 2026-03-15
topic: agentic-trading-platform-e2e
---

# Agentic Trading Platform

## Summary

Build a workspace-based, operator-supervised platform for Indian systematic trading research and supervised live execution.

The platform has two explicit operating planes:

- `testing`: where agents research, mutate, backtest, replay, paper-trade, and self-optimise for return using `autoresearch` plus `hyperspace`, executed inside Modal Sandboxes
- `live`: where a smaller, approval-gated subset of strategies executes against Zerodha through Kite Connect and is continuously checked against expected behaviour from testing

This split is not cosmetic. It is a hard product boundary.

As of February 2025, Zerodha staff stated on the official forum that Zerodha does not offer a Kite Connect sandbox and that trades and data accessed through the API are live. As of April 2025, staff also said a sandbox remained on their todo list but was not a priority. That means `testing` must be your own environment, not a broker-provided one.

The product is workspace-native:

- one workspace can have one operator or a small research team
- members consume credits when they launch runs, swarms, or live shadow processes
- the control plane separates shared testing resources from tightly gated live permissions

## Product Goal

The north star is:

- maximise risk-adjusted return in testing
- deploy only when testing behaviour is robust
- continuously measure how live behaviour differs from tested behaviour
- feed that difference back into the research loop
- make experimentation economically legible through credits and budgets in multi-user setups

In other words, the product is not only "find a good strategy". It is "close the loop between simulated edge and real-world execution quality."

## Product Principles

### 1. Testing and live are separate products sharing one control plane

The user must always know which plane they are in.

Testing answers:

- What should we trade?
- Why do we think it works?
- How robust is it?

Live answers:

- What is actually happening right now?
- Are we behaving as expected?
- Do we need to cut risk, disable, or retrain?

### 2. Agents are first-class operators

Anything you can do through the UI, an agent must be able to do through tools, except for approval decisions that remain human-gated.

### 3. Real-money actions are proposal-first

Agents can propose live changes freely. They cannot apply dangerous actions without approval.

### 4. All experiments are reproducible

Every experiment has:

- code snapshot
- dataset version
- configuration
- metrics
- logs
- artifact bundle

### 5. Real-world deviation is a core signal

The most important live metric is not P&L alone. It is the gap between expected and realised behaviour:

- fill quality
- slippage
- latency
- missed entries/exits
- position drift
- broker-state divergence

## External Constraints From Official Docs

### Kite Connect

The official Kite docs confirm:

- login uses the `api_key` redirect flow and server-side token exchange
- `api_secret` must remain server-side
- access tokens expire at `6 AM` the next day unless invalidated sooner
- orders are placed, modified, cancelled, and retrieved via REST
- order placement success does not imply execution success
- the day orderbook is transient and only lives for the trading day
- historical data is available via `/instruments/historical/:instrument_token/:interval`
- the instrument dump should be downloaded once daily and stored locally
- WebSocket streaming allows up to `3000` instruments per connection and up to `3` WebSocket connections per API key
- order updates can arrive via WebSocket and postbacks
- for individual developers, Zerodha recommends WebSocket order updates over postbacks

Important product implication:

- you cannot treat the broker as your full event log or your canonical strategy-state store
- you need your own event store and your own execution ledger

### Sandbox / paper-trading reality

Official forum answers establish:

- February 2025: Zerodha does not offer a Kite Connect sandbox environment
- April 2021: Zerodha does not support paper trading
- March 2025: NSE mock-trading sessions can be used when Zerodha points setups to the mock market for that session

Important product implication:

- testing must include an internal broker adapter that simulates orders and positions
- live-integration verification must use either tiny-size supervised live orders or official exchange mock-trading windows when available

### Modal Sandboxes

Modal Sandboxes officially support:

- dynamically defined secure sandboxes
- sub-second startup
- very high concurrency
- names and tags
- `exec`, `wait`, `poll`, `terminate`
- stdout/stderr streaming
- `from_id` and `from_name`
- filesystem APIs
- snapshots
- tunnels
- networking controls
- native observability

Modal Volumes officially warn that concurrent writes to the same file are last-write-wins and that distributed locking is not supported.

Important product implication:

- use Postgres as the source of truth
- use Modal Sandboxes as execution units
- use Volumes only for read-mostly caches, datasets, or per-run scratch/state snapshots

## Environment Model

This product has four named environments even though the UI groups them into `testing` and `live`.

### 1. `research`

Purpose:

- mutate strategy logic
- generate hypotheses
- run broad backtests
- analyse factor behaviour

No broker side effects.

### 2. `paper`

Purpose:

- use real or replayed market data
- route signals through the exact same execution policy engine
- simulate fills, costs, and position accounting

This is still part of `testing`.

### 3. `shadow-live`

Purpose:

- connect to live market data and live broker state
- compute what the strategy would have done
- compare shadow intents to actual live behaviour or to zero-intent baselines

This is still part of `testing`, but it uses live observations.

### 4. `live`

Purpose:

- place actual broker orders
- track fills and holdings
- enforce approval gates and risk controls

UI grouping:

- `testing` = `research` + `paper` + `shadow-live`
- `live` = `live`

## Workspace Model

This product is multi-user by workspace, not by broker account.

Each workspace has:

- one or more human members
- one or more agent swarms
- one research budget
- zero or one connected live broker account in v1
- environment-specific permissions

Recommended v1 roles:

- `owner`: billing, broker connection, live enablement, kill switch
- `admin`: workspace configuration, credits, member invites, testing controls
- `researcher`: create families, launch runs, inspect artifacts, deploy to paper and shadow-live
- `reviewer`: inspect results, approve promotions, review incidents
- `trader`: approve live actions and supervise executions

Permission rule:

- `testing` capabilities can be broad inside a workspace
- `live` capabilities must stay narrow, attributable, and approval-gated

## Credits System

Credits are the control-plane currency for multi-user research.

They serve three purposes:

- prevent one member from consuming the whole runner fleet
- make compute and data usage legible before runs start
- enforce separate budgets for testing versus live support activity

Each workspace gets:

- `testing_credits`
- `live_ops_credits`
- optional per-member monthly soft limits
- optional per-swarm hard ceilings

Credit accounting model:

- reserve credits before launch
- debit on actual settlement after the run ends
- release unused reservation
- write every movement to a credit ledger

Default credit debits should be driven by:

- sandbox-seconds
- snapshot storage
- artifact storage
- data egress or premium data pulls
- number of swarm children spawned
- replay duration for paper or shadow-live runs

Credit policy examples:

- a single backtest child sandbox costs fewer credits than a full swarm family launch
- shadow-live burns from `testing_credits`, not `live_ops_credits`
- live order supervision and reconciliation burn from `live_ops_credits`
- owners can require approval for launches above a credit threshold

The user should always see:

- current workspace balance
- reserved but unsettled credits
- credits consumed by each run family
- top members and swarms by spend

## Product Surfaces

### 1. Command Center

One page to answer:

- what is the current frontier strategy?
- what is running now?
- what is deployed where?
- what approvals are pending?
- how far is live behaviour from expected behaviour?

Key panels:

- frontier leaderboard
- active sandboxes
- active swarms
- deployment status by environment
- live vs expected dashboard
- workspace credit burn
- approval inbox
- incidents and risk flags

### 2. Research Lab

This is the main testing surface.

Capabilities:

- create experiment families
- upload or select datasets
- choose strategy template
- choose optimisation objective
- choose swarm template
- spawn N experiment branches
- fork winning runs
- inspect run diffs

Views:

- family board
- experiment tree
- run comparison table
- equity curve / drawdown / turnover / alpha
- artifact viewer
- critic notes

### 3. Run Fleet

This is the Modal control surface.

For each run:

- sandbox id
- run id
- environment
- workspace
- agent type
- command
- status
- startup time
- heartbeat
- stdout tail
- stderr tail
- snapshot id
- artifact links

Actions:

- stop
- clone
- snapshot
- retry
- promote to paper
- promote to shadow-live

### 4. Agents

Every agent has:

- mandate
- current task
- parent / child relationships
- decision history
- tool access
- success rate
- current environment permissions

### 5. Swarms

This is the orchestration view above the individual-run level.

For each swarm:

- swarm id
- workspace
- template
- objective
- parent strategy family
- controller agent
- active child count
- credit reservation
- current best candidate
- failure rate

Actions:

- pause swarm
- resume swarm
- cap concurrency
- clone template
- convert frontier branch into a deployment candidate

### 6. Strategy Registry

Every strategy has:

- canonical id
- description
- parameter schema
- latest best testing result
- deployment history
- live status
- retirement reason

### 7. Brokerage

Zerodha page:

- connection status
- API session expiry
- WebSocket status
- positions
- holdings
- order intents
- submitted orders
- fills
- postback health
- kill switch

### 8. Approvals

All high-stakes actions collect here:

- deploy to live
- enable auto-trading
- place live order
- widen risk budget
- disable protection rules
- cancel protective orders

### 9. Credits and Billing

This is the workspace economics page.

Sections:

- current balances by bucket
- reservations and pending settlements
- spend by member
- spend by swarm
- spend by experiment family
- top-up history
- policy rules and approval thresholds

### 10. Onboarding

This is the setup funnel and checklist surface.

Sections:

- workspace setup status
- broker setup status
- data universe selection
- objective and risk profile
- swarm template selection
- first-run validation
- live eligibility checklist

### 11. Live Operations

This is the real-world checkout page.

Sections:

- realised vs expected fills
- realised vs expected slippage
- live P&L vs expected paper P&L
- order latency and rejection rate
- broker state reconciliation
- drift over time

## Core User Journeys

### Journey A: Create a new testing experiment

1. Operator chooses a strategy family or asks the agent to propose one.
2. Research agent generates mutations.
3. Execution agent creates one Modal Sandbox per hypothesis.
4. Backtest/replay completes.
5. Critic agent ranks runs by objective.
6. Best candidates move to `paper` or `shadow-live`.

### Journey B: Promote testing winner to live candidate

1. Operator or agent selects a run.
2. Platform checks qualification thresholds.
3. Deployment agent creates a deployment plan.
4. Approval request is created.
5. Human approves.
6. Strategy enters `live` in restricted capital mode.

### Journey C: Live reality diverges from testing

1. Live monitor detects worse-than-expected slippage or rejection cluster.
2. Risk guardian raises an incident.
3. Deployment is paused or capital reduced automatically within policy.
4. Research agent creates a new experiment family seeded with the divergence context.
5. Results feed back into testing.

### Journey D: Team workspace onboarding

1. Owner creates a workspace and chooses `solo lab` or `team workspace`.
2. Platform allocates starter credits and default budget policies.
3. Owner invites members and assigns roles.
4. Owner connects Kite Connect credentials and completes auth.
5. Workspace chooses testing objective, capital model, and allowed universes.
6. Operator selects the default research swarm template.
7. Platform runs broker, data, and sandbox validation checks.
8. Workspace launches its first testing swarm.

### Journey E: Launch a new-strategy swarm

1. Researcher selects a frontier family or asks for a fresh strategy thesis.
2. Research director creates a swarm brief and credit reservation.
3. `autoresearch` controller mutates the strategy pack and branch prompts.
4. Hyperspace execution workers evaluate the resulting candidates.
5. Critic ranks children, retires weak branches, and keeps the frontier alive.
6. Winning candidates are promoted to paper or shadow-live.

## Agent Topology

### Research Director

Decides what to optimise next.

Inputs:

- frontier table
- failed live incidents
- market regime summaries

Outputs:

- experiment family plan

### Swarm Orchestrator

Owns swarm lifecycle:

- reserve credits
- spawn child agents
- assign Modal sandboxes
- track heartbeat and failures
- stop or shrink bad branches
- checkpoint useful branches

### Strategy Generator

Mutates strategy code, parameters, datasets, and hypotheses.

### Backtest Runner

Executes strategies inside Modal Sandboxes.

### Critic

Rejects overfit improvements and writes comparison notes.

### Deployment Agent

Builds paper, shadow-live, and live deployment plans.

### Broker Agent

Prepares order intents and reconciles fills. It never bypasses approval rules.

### Risk Guardian

Owns hard limits:

- daily loss
- max capital
- max exposure per symbol
- max open positions
- max slippage
- kill switch

### Reconciliation Agent

Compares:

- intended positions
- broker positions
- internal ledger
- expected fills
- realised fills

## Testing Plane Design

### Research mode

Research mode is where `autoresearch` and `hyperspace` work together.

Use it for:

- parameter mutation
- feature mutation
- entry/exit rule mutation
- cost-model sensitivity
- benchmark comparison
- new-strategy discovery

Architecture:

- `program.md` defines the human-written research mandate
- the strategy pack defines the editable research surface
- the `autoresearch` controller manages the edit-run-measure loop
- `hyperspace` provides the execution and evaluation worker lane
- Modal Sandboxes are the runtime boundary for each child attempt

Two-lane model:

- lane A: `autoresearch` mutates prompts, strategy packs, and family context
- lane B: `hyperspace` evaluates those mutations and returns metrics, winning hypotheses, and run state

Each child sandbox runs:

- code checkout
- data pull
- strategy mutation or selection
- `hyperspace` evaluation or replay
- metric emission
- artifact upload
- optional snapshot creation

For Indian equities specifically:

- Hyperspace can remain the generic experiment engine where it fits
- universe-specific NSE research can use the local India loop as a specialised evaluation worker
- both paths report into the same frontier and credit ledger

### Paper mode

Paper mode must use the same execution-policy code path as live.

The only difference should be the broker adapter:

- paper adapter simulates order acceptance, fill policy, latency, cancellations, and position accounting
- live adapter calls Kite Connect

This is essential. If testing and live use different execution logic, the system is lying to itself.

### Shadow-live mode

Shadow-live is the last step before live.

It uses:

- live Kite market data
- internal signal generation
- no actual broker orders

It records:

- shadow order intents
- hypothetical fills
- opportunity capture
- missed-entry diagnostics

This is the main bridge from testing to live.

## Live Plane Design

### Live mode

Live mode is smaller by design.

Only strategies that pass explicit gates may enter.

Required properties:

- stable research history
- enough out-of-sample evidence
- acceptable turnover
- acceptable drawdown profile
- successful shadow-live run
- risk policy attached

### Live execution flow

1. Strategy emits target orders.
2. Risk guardian validates.
3. If approval is required, create approval request.
4. If approved, order intent becomes executable.
5. Broker service submits to Kite.
6. Order state updates arrive via WebSocket and optionally postbacks.
7. Internal ledger is reconciled.
8. Live-vs-expected monitor updates divergence metrics.

## Testing vs Live Qualification Gates

A strategy can move from testing to live only if:

- minimum backtest horizon met
- minimum out-of-sample window met
- minimum paper duration met
- minimum shadow-live duration met
- maximum allowed drawdown not breached
- slippage estimate within budget
- position turnover within operational limits
- no unresolved execution incidents

The exact thresholds are product configuration, not code constants.

## Self-Optimisation Loop

This is the core agentic loop.

### Objective function

In testing, the optimisation objective should be configurable, but default to:

- alpha
- total return
- drawdown penalty
- turnover penalty
- stability penalty

In live, the objective changes.

Live should optimise for:

- realised alpha after costs
- execution quality
- strategy stability
- minimal policy breaches

### Loop

1. Read current frontier.
2. Read live incidents and drift reports.
3. Reserve credits for the planned swarm.
4. Generate new hypotheses and branch instructions.
5. Spawn Modal Sandboxes.
6. Execute tests through Hyperspace or a specialised local evaluator.
7. Rank results.
8. Promote winners.
9. Update strategy memory and family context.
10. Release unused credit reservation and settle spend.

### Why `autoresearch` fits

Karpathy's `autoresearch` pattern is useful here because it keeps a tight edit-run-measure loop and treats prompts plus code mutations as the research surface.

But for trading, the editable surface is not only one file. It should be a constrained strategy pack:

- factors
- filters
- position sizing
- exits
- regime logic
- transaction cost assumptions

`autoresearch` should not submit broker orders directly. Its job is to manage research memory, branch creation, and frontier iteration.

### Why `hyperspace` fits

Hyperspace fits as the execution-side strategy engine for new-strategy research because it already exposes autonomous quantitative-research commands and a persistent state model that can be harvested after each round.

In this product, use it for:

- one-round or short-burst candidate evaluation
- mutation result capture
- frontier extraction
- repeatable worker execution inside a sandbox

The local adapter in `trading/autoresearch/hyperspace_alpha` is the product seed:

- `program.md` sets the north star and ranking priority
- `loop.py` runs Hyperspace rounds and writes local artifacts
- the India loop handles NSE-specific evaluation where the generic binary is too rigid

Product implication:

- keep Hyperspace behind a stable internal runner interface
- do not hard-code the UI to one Hyperspace command shape
- treat Hyperspace outputs as one evaluator family among several, but the default one for autonomous strategy discovery

### Why Modal fits

Modal gives each hypothesis its own isolated execution cell with:

- reproducible images
- logs
- snapshots
- direct command execution
- fleet-level visibility

This makes it natural to use one sandbox per run attempt.

## Swarm Templates

The platform should ship with a few explicit swarm templates.

### 1. Frontier Explorer

Use when:

- you want fresh strategy ideas
- you are entering a new sector, basket, or regime

Shape:

- 1 research director
- 1 swarm orchestrator
- 3 to 10 strategy generators
- N Hyperspace or local evaluation workers
- 1 critic

### 2. Robustness Auditor

Use when:

- a strategy already looks strong
- you want to stress it across dates, costs, and parameter shifts

Shape:

- 1 critic lead
- multiple replay and perturbation workers
- optional data-sensitivity worker

### 3. Live Divergence Investigator

Use when:

- live behaviour no longer matches testing expectations

Shape:

- 1 incident lead
- 1 reconciliation agent
- multiple shadow-live replay workers
- multiple hypothesis repair workers

Swarm execution rule:

- each child gets its own run attempt and sandbox
- the swarm controller never shares mutable state through a common filesystem
- shared memory is written back through Postgres and artifact storage

## Real-World Checkout Loop

This is the most important live product feature.

For each deployed strategy, continuously compare:

- expected entry timestamp vs actual entry timestamp
- expected price vs realised price
- expected fill rate vs realised fill rate
- expected position vs broker position
- expected P&L path vs realised P&L path

Create a divergence score from those measures.

If divergence is high:

- flag the run
- restrict capital
- pause deployment if thresholds are breached
- seed a new testing family with the divergence explanation

This is how live behaviour becomes training signal for future strategies.

## Kite Connect Integration

### App type

Use `Connect`, not `Personal`.

Reason:

- you need historical chart data
- you need live market quotes and WebSockets

### Login flow

1. Browser opens `https://kite.zerodha.com/connect/login?v=3&api_key=...`
2. Redirect returns `request_token`
3. Backend exchanges request token at `/session/token`
4. Backend stores session and expiry

### Session handling

Important doc constraint:

- access token expires at `6 AM` the next day

So the product must include:

- broker-session expiry banner
- reconnect workflow
- scheduler for morning re-auth checks

### Instrument handling

Important doc constraint:

- instrument dump should be fetched once daily and stored locally

So the product should have:

- daily instrument sync job at around `08:30 AM`
- symbol master table
- token history table for expiry-aware instruments

### WebSocket handling

Important doc constraint:

- up to `3000` instruments per connection
- up to `3` WebSocket connections per API key

So the product should:

- centralise market-data subscription management
- avoid per-strategy direct broker WebSocket fanout
- fan live ticks into an internal event bus

### Postbacks vs WebSocket

Official docs recommend WebSocket order updates for individual developers and postbacks for multi-user platforms.

Design decision:

- use WebSocket order updates as primary v1 event source
- add postbacks as secondary verification and replay input in v2

## Onboarding Flow

Onboarding must produce a working testing workspace before it ever offers live enablement.

### Step 1: Create workspace

The user chooses:

- `solo lab`
- `team workspace`

The platform then creates:

- workspace slug
- default roles
- starter credit wallet
- default testing and live budget policies

### Step 2: Define research brief

The operator sets:

- north-star objective
- default benchmark
- allowed asset universe
- trading hours and markets
- initial risk appetite

This becomes the first version of the workspace research brief and seeds `program.md`.

### Step 3: Connect infrastructure

The operator connects:

- Modal credentials and runner configuration
- Kite Connect `api_key` and `api_secret`
- storage for artifacts

Validation checks:

- can create a sandbox
- can stream logs
- can fetch instrument master
- can complete Kite auth redirect

### Step 4: Select swarm template

The operator chooses a default testing template:

- `frontier explorer`
- `robustness auditor`
- `divergence investigator`

The platform pre-fills concurrency and credit ceilings based on workspace size.

### Step 5: Run first validation swarm

This is not a real strategy search yet. It proves the stack.

It should:

- launch a tiny research swarm
- run a known-good sample strategy
- write logs and artifacts
- settle credits
- show the frontier page populated

### Step 6: Unlock live prerequisites

Only after testing is healthy should the UI show live enablement steps:

- complete broker session health checks
- configure live risk policy
- set approval quorum
- require successful paper and shadow-live history

Live onboarding is a separate checklist, not part of the initial happy path.

## Data Model

Core entities:

- `workspaces`
- `workspace_memberships`
- `users`
- `credit_accounts`
- `credit_ledger_entries`
- `credit_reservations`
- `broker_accounts`
- `broker_sessions`
- `symbol_master`
- `onboarding_checklists`
- `strategy_families`
- `strategy_versions`
- `experiments`
- `swarms`
- `swarm_templates`
- `swarm_children`
- `runs`
- `run_attempts`
- `run_events`
- `run_artifacts`
- `deployments`
- `paper_ledgers`
- `live_ledgers`
- `order_intents`
- `broker_orders`
- `broker_trades`
- `position_snapshots`
- `risk_policies`
- `approval_requests`
- `agent_profiles`
- `agent_tasks`
- `divergence_reports`
- `incidents`

## API Surface

### Core experiment endpoints

- `POST /api/workspaces`
- `POST /api/workspaces/:id/invitations`
- `GET /api/workspaces/:id/credits`
- `GET /api/workspaces/:id/onboarding`
- `POST /api/experiments`
- `POST /api/experiments/:id/fork`
- `POST /api/runs`
- `POST /api/runs/:id/terminate`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events`
- `GET /api/runs/:id/artifacts`

### Agent endpoints

- `POST /api/agents/tasks`
- `POST /api/agents/tasks/:id/complete`
- `GET /api/agents`
- `GET /api/agents/:id`

### Swarm endpoints

- `POST /api/swarms`
- `POST /api/swarms/:id/pause`
- `POST /api/swarms/:id/resume`
- `POST /api/swarms/:id/clone`
- `GET /api/swarms/:id`
- `GET /api/swarms/:id/children`

### Deployment endpoints

- `POST /api/deployments`
- `POST /api/deployments/:id/promote`
- `POST /api/deployments/:id/pause`
- `POST /api/deployments/:id/resume`

### Broker endpoints

- `GET /api/brokers/zerodha/login-url`
- `GET /api/brokers/zerodha/callback`
- `POST /api/brokers/zerodha/postback`
- `GET /api/brokers/zerodha/session`
- `GET /api/brokers/zerodha/positions`

### Approval endpoints

- `GET /api/approvals`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`

### Credit endpoints

- `POST /api/credits/reservations`
- `POST /api/credits/reservations/:id/release`
- `GET /api/credits/ledger`
- `POST /api/credits/policies`

## Modal Architecture

### App layout

- one Modal App for testing runners
- one Modal App for live execution support jobs
- optional one Modal App for analytics/batch jobs

### Sandbox per run

Create one sandbox per run attempt.

Name:

- `run-<run_id>-<attempt_id>`

Tags:

- `project=agentic-trading`
- `workspace=<slug>`
- `env=research|paper|shadow-live|live`
- `swarm=<id>`
- `family=<slug>`
- `strategy=<id>`
- `agent=<kind>`

### What runs inside a sandbox

- code checkout
- environment build
- strategy evaluation
- swarm child execution
- artifact generation
- event emission
- optional snapshot creation

Swarm rule:

- the controller can run outside the child sandboxes in the control plane
- every execution child runs inside its own sandbox
- no shared mutable coordination state should live inside a sandbox

### What does not belong inside a sandbox

- canonical system state
- approval state machine
- broker credentials source of truth
- permanent event ledger

## Risk and Safety

### Hard controls

- global kill switch
- environment-scoped API keys and secrets
- live capital cap
- per-symbol exposure cap
- max order size
- max concurrent live strategies
- max daily loss
- max slippage

### Process controls

- all live deployment plans are reviewed
- all live order intents are attributable to strategy + agent + deployment
- all changes are audit logged

### Default live posture

Start with:

- CNC cash only
- no auto-pyramiding
- no derivatives
- tiny capital
- manual approval on each new deployment

## User Interface Structure

### Testing nav

- Overview
- Research Lab
- Swarms
- Experiment Families
- Runs
- Agents
- Datasets
- Credits
- Onboarding

### Live nav

- Live Ops
- Brokerage
- Approvals
- Deployments
- Incidents
- Risk

### Workspace nav

- Members
- Roles
- Billing
- Credit Policies
- Audit Log

This split should be visible in the main navigation, not buried in a filter.

## MVP

### Phase 1

- workspace creation and memberships
- onboarding checklist
- starter credit wallet and ledger
- Kite Connect auth
- symbol master sync
- experiment family CRUD
- swarm template CRUD
- Modal sandbox runner orchestration
- run logs and artifact viewer
- testing leaderboard
- paper ledger

### Phase 2

- credit reservations and policy approvals
- frontier explorer swarm
- shadow-live
- deployment promotions
- approval inbox
- live market-data bus
- live-vs-expected dashboard

### Phase 3

- robustness and divergence swarms
- supervised live orders
- reconciliation agent
- divergence-triggered retraining
- postbacks secondary ingest

## Recommendations

- Build `testing` first and make it excellent.
- Treat `live` as a thin, strict, controlled layer on top.
- Implement the paper broker adapter before touching live orders.
- Make `shadow-live` mandatory for every new strategy.
- Use Modal Sandboxes only for execution, not coordination.
- Make credits visible before every expensive launch.
- Keep swarm templates explicit instead of letting arbitrary agent trees hit the fleet.
- Keep the control plane boring: Next.js + Postgres + object storage.

## Sources

- Kite Connect introduction: https://kite.trade/docs/connect/v3/
- Kite login flow and token exchange: https://kite.trade/docs/connect/v3/user/
- Kite orders: https://kite.trade/docs/connect/v3/orders/
- Kite portfolio: https://kite.trade/docs/connect/v3/portfolio/
- Kite market instruments: https://kite.trade/docs/connect/v3/market-data-and-instruments/
- Kite historical data: https://kite.trade/docs/connect/v3/historical/
- Kite WebSocket streaming: https://kite.trade/docs/connect/v3/websocket/
- Kite postbacks: https://kite.trade/docs/connect/v3/postbacks/
- Kite GTT: https://kite.trade/docs/connect/v3/gtt/
- Zerodha forum, no Kite sandbox, February 2025: https://kite.trade/forum/discussion/14795/sandbox-environment-availability
- Zerodha forum, sandbox still not available, April 2025: https://kite.trade/forum/discussion/15090/sandbox-for-kite-connect-api
- Zerodha forum, no paper trading support, April 2021: https://kite.trade/forum/discussion/9812/kite-connect-api-sandbox-for-paper-trading
- Zerodha forum, mock trading session note, March 2025: https://kite.trade/forum/discussion/14893/regarding-sandbox-api
- Modal Sandboxes product page: https://modal.com/products/sandboxes
- Modal Sandbox guide: https://modal.com/docs/guide/sandbox
- Modal Volumes guide: https://modal.com/docs/guide/volumes
- modal.Sandbox reference: https://modal.com/docs/reference/modal.Sandbox
- Modal snapshots: https://modal.com/docs/guide/sandbox-snapshots
