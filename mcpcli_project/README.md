# MCPCLI — Flux ETL Integration

> **Who this is for:** Anyone who needs to run, monitor, or extend the Flux ETL
> data pipeline — whether you write code every day or prefer clicking buttons.
> No deep Go or Python knowledge required to *use* this tool.

---

## Table of Contents

1. [What does this do?](#1-what-does-this-do)
2. [How the pieces fit together](#2-how-the-pieces-fit-together)
3. [Quick start (5 minutes)](#3-quick-start-5-minutes)
4. [Running the Flux ETL pipeline](#4-running-the-flux-etl-pipeline)
5. [Resuming an interrupted run](#5-resuming-an-interrupted-run)
6. [Replaying the event log](#6-replaying-the-event-log)
7. [Choosing a provider](#7-choosing-a-provider)
8. [Weighted model routing](#8-weighted-model-routing)
9. [Viewing the API schema](#9-viewing-the-api-schema)
10. [Workflow objectives (from integration.yaml)](#10-workflow-objectives-from-integrationyaml)
11. [For developers: extending the system](#11-for-developers-extending-the-system)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What does this do?

MCPCLI is a command-line tool that acts as a **traffic controller** for data
workflows. You tell it:

- **Which service** to use (called a *provider*)
- **What data** to process (called a *payload*)
- **Which AI model** to route through (optional)

It then runs the workflow, records every step in an **event log**, and saves a
**checkpoint** so the run can be picked up again if something goes wrong.

The Flux ETL pipeline specifically moves federal regulatory data through three
stages:

```
Raw JSON files  →  [ingest]  →  DuckDB  →  [transform]  →  [export]  →  PostgreSQL  →  API
```

---

## 2. How the pieces fit together

```
mcpcli (CLI)
  │
  ├── master command ──► master pipeline (master/master.go)
  │                          │
  │                          ├── authenticate with provider
  │                          ├── select AI model
  │                          ├── call provider
  │                          ├── record events (audit log)
  │                          └── save/load checkpoint files
  │
  ├── replay command ──► print saved event log
  │
  └── openapi command ─► print API schema (for Swagger / Postman)

Providers (plugins/)
  ├── flux-etl  ← runs the Flux ETL pipeline stages
  ├── kilo      ← routes to Kilo AI service
  └── mock      ← echoes your payload back (for testing)
```

---

## 3. Quick start (5 minutes)

### Prerequisites

- Go 1.21 or later installed (`go version` to check)
- This repository cloned locally

### Build

```bash
cd mcpcli_project
go build -o mcpcli .
```

### Smoke test (mock provider — no token needed... wait, mock requires a token)

```bash
./mcpcli master \
  --provider mock \
  --token any-value \
  --payload '{"hello":"world"}'
```

Expected output:

```json
{
  "success": true,
  "output": {
    "echo": {"hello": "world"},
    "provider": "mock"
  },
  "events": [...]
}
```

---

## 4. Running the Flux ETL pipeline

The Flux ETL provider (`flux-etl`) supports four **stages**. You pick a stage
by setting `"stage"` in your payload JSON.

| Stage | What it does |
|-------|-------------|
| `ingest` | Loads agencies and corrections JSON into DuckDB |
| `transform` | Computes agency metrics, time series, CFR title stats |
| `export` | Pushes all processed data from DuckDB into PostgreSQL |
| `full` | Runs all three stages in order (default) |

### Run the full pipeline

```bash
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{"stage":"full"}'
```

### Run only the ingest stage

```bash
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{"stage":"ingest"}'
```

### Dry run — see what *would* happen without moving any data

```bash
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{"stage":"full","dry_run":true}'
```

The output will list every step that *would* execute, with no data changed.

---

## 5. Resuming an interrupted run

Every run automatically saves a **checkpoint file** after each step.
The file is named `<run-id>.checkpoint.json` and lives in the current directory.

If a run is interrupted (network error, crash, Ctrl-C), find the run ID in the
checkpoint filename and pass it to `--resume`:

```bash
# The checkpoint file is named something like: 1740592800000000000.checkpoint.json
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{"stage":"full"}' \
  --resume 1740592800000000000
```

The pipeline will skip already-completed steps and continue from where it
stopped. The result will include `"resumed": true`.

> **Tip:** Checkpoint files are deleted automatically when a run succeeds.
> If you see a `.checkpoint.json` file, it means a previous run did not finish.

---

## 6. Replaying the event log

Every step of every run is recorded as a timestamped event. You can print the
full event log from any checkpoint without re-running the pipeline:

```bash
./mcpcli replay 1740592800000000000
```

Example output:

```
🔁 Replaying 3 events for run "1740592800000000000" (last step: model_select)

  [1] 2026-02-26T18:00:01Z  auth
    {"provider": "flux-etl"}
  [2] 2026-02-26T18:00:01Z  model_select
    {"chosen": "gpt-demo", "requested": "gpt-demo", "weights": ""}
```

This is useful for:
- **Auditing** — who ran what, when, with which data
- **Debugging** — see exactly where a run stopped
- **Compliance** — keep a record of every data movement

---

## 7. Choosing a provider

Use the `--provider` flag to select which service processes your data.

| Provider | Token required | What it does |
|----------|---------------|-------------|
| `flux-etl` | `flux-etl-demo-token` | Runs the Flux ETL pipeline |
| `kilo` | `kilo-demo-token` | Routes to Kilo AI service |
| `mock` | any non-empty string | Echoes your payload (testing only) |

```bash
# Kilo AI example
./mcpcli master \
  --provider kilo \
  --token kilo-demo-token \
  --payload '{"message":"etl-task"}'
```

---

## 8. Weighted model routing

If you want to split traffic between two AI models (for A/B testing or
gradual rollout), use the `--weights` flag:

```bash
./mcpcli master \
  --provider kilo \
  --token kilo-demo-token \
  --payload '{"message":"etl-task"}' \
  --weights "gpt-demo:0.7,gpt-fast:0.3"
```

This sends 70% of requests to `gpt-demo` and 30% to `gpt-fast`.
The chosen model is recorded in the event log under `model_select`.

---

## 9. Viewing the API schema

The CLI exposes an OpenAPI 3.0 schema that describes every endpoint and
parameter. You can import it into **Swagger UI**, **Postman**, or any
API documentation tool:

```bash
# Print to terminal
./mcpcli openapi

# Save to file and open in Swagger UI
./mcpcli openapi > openapi.json
```

---

## 10. Workflow objectives (from integration.yaml)

The `integration.yaml` file at the root of this repository defines the
integration plan. Here is how each objective maps to code:

| Objective | What was built | Where |
|-----------|---------------|-------|
| `durable_workflows` | Checkpoint save/load after every step | `master/master.go` — `SaveCheckpoint`, `LoadCheckpoint` |
| `plugin_routing` | Provider registry with `flux-etl`, `kilo`, `mock` | `plugins/interfaces.go` — `Providers` map |
| `ai_model_integration` | Weighted model selection | `master/master.go` — `selectModel` |
| `event_logging` | Timestamped event log on every `Result` | `master/master.go` — `Monad.record` |
| `kubernetes_ready` | Stateless binary + checkpoint files (mountable as PVC) | `master/master.go` — file-based checkpoints |
| `cli_openapi` | `openapi` subcommand + full schema | `cmd/root.go`, `plugins/interfaces.go` |

### Deliverables status

| Deliverable | Status |
|-------------|--------|
| `integrated_repository` | ✅ Flux ETL provider wired into MCPCLI |
| `docker_support` | ✅ See `demo/Dockerfile` and `demo/docker-compose.yml` |
| `k8s_manifests` | 🔜 Next step (see `next_steps` in integration.yaml) |
| `example_workflows` | ✅ See [Quick start](#3-quick-start-5-minutes) above |
| `documentation` | ✅ This file |
| `event_samples` | ✅ Use `mcpcli replay <run-id>` after any run |

---

## 11. For developers: extending the system

### Adding a new provider

1. Create `plugins/myprovider.go` implementing `TokenProvider` and `Client`.
2. Add it to the `Providers` map in `plugins/interfaces.go`.
3. Add a new path to `OpenAPISchema` in `plugins/interfaces.go`.
4. Run `go build ./...` to verify.

Minimal provider template:

```go
package plugins

type MyProvider struct{}
func (p *MyProvider) Name() string { return "my-provider" }
func (p *MyProvider) Authenticate(token string) (Client, error) {
    // validate token
    return &MyClient{}, nil
}

type MyClient struct{}
func (c *MyClient) Call(payload map[string]interface{}) (map[string]interface{}, error) {
    // do work
    return map[string]interface{}{"result": "ok"}, nil
}
```

### Checkpoint file format

```json
{
  "run_id": "1740592800000000000",
  "provider_name": "flux-etl",
  "model": "gpt-demo",
  "payload": {"stage": "full"},
  "events": [...],
  "last_step": "auth",
  "created_at": "2026-02-26T18:00:01Z"
}
```

---

## 12. Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `unknown provider: xyz` | Typo in `--provider` | Use `mock`, `kilo`, or `flux-etl` |
| `invalid token` | Wrong token for provider | See token table in [§7](#7-choosing-a-provider) |
| `invalid payload JSON` | Unescaped quotes | Wrap JSON in single quotes: `--payload '{"key":"val"}'` |
| `checkpoint not found` | Wrong run ID | List `.checkpoint.json` files in current directory |
| `flux-etl: unknown stage` | Typo in stage name | Use `ingest`, `transform`, `export`, or `full` |

---

*Generated from [`integration.yaml`](../integration.yaml) — owner: product_engineering — priority: high*
