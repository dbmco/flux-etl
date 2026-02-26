# MCPCLI — Flux ETL Integration

> **Who this is for:** Anyone who needs to run, monitor, or extend the Flux ETL
> data pipeline — whether you write code every day or prefer clicking buttons.
> No deep Go or Python knowledge required to *use* this tool.

---

## Table of Contents

1. [What does this do?](#1-what-does-this-do)
2. [How the pieces fit together](#2-how-the-pieces-fit-together)
3. [Multi-agency design](#3-multi-agency-design)
4. [Content types](#4-content-types)
5. [Use-case matrix](#5-use-case-matrix)
6. [Quick start (5 minutes)](#6-quick-start-5-minutes)
7. [Running the pipeline](#7-running-the-pipeline)
8. [Resuming an interrupted run](#8-resuming-an-interrupted-run)
9. [Replaying the event log](#9-replaying-the-event-log)
10. [Choosing a provider / AI agent](#10-choosing-a-provider--ai-agent)
11. [Weighted model routing](#11-weighted-model-routing)
12. [Viewing the API schema](#12-viewing-the-api-schema)
13. [Edge and Kubernetes scalability](#13-edge-and-kubernetes-scalability)
14. [Security model](#14-security-model)
15. [Workflow objectives (from integration.yaml)](#15-workflow-objectives-from-integrationyaml)
16. [For developers: extending the system](#16-for-developers-extending-the-system)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. What does this do?

MCPCLI is a command-line tool that acts as a **traffic controller** for data
workflows. You tell it:

- **Which agency** owns the data
- **What kind of content** to process (images, documents, text, or a mix)
- **Which downstream use case** the data is for (AI training, preservation, VR, etc.)
- **Which AI/ML agent** to route through (called a *provider*)

It then runs the workflow, records every step in an **event log**, and saves a
**checkpoint** so the run can be picked up again if something goes wrong.

The Flux ETL pipeline moves data through three stages:

```
Raw content  →  [ingest]  →  Internal store (DuckDB)
                          →  [transform]  →  Metrics + embeddings
                          →  [export]     →  PostgreSQL / object store  →  API / agent
```

**All data flows are internal.** The only external call is to the AI/ML agent
you select via `--provider`. The Go monadic process is the single orchestration
point and never exposes raw data outside the system.

---

## 2. How the pieces fit together

```
mcpcli (CLI)
  │
  ├── master command ──► master pipeline (master/master.go)   ← THE MAIN ACTOR
  │                          │
  │                          ├── authenticate with provider
  │                          ├── select AI model (weighted routing optional)
  │                          ├── call provider (flux-etl, kilo, mock, or any plugin)
  │                          ├── record events (append-only audit log)
  │                          └── save/load checkpoint files (resumable)
  │
  ├── replay command ──► print saved event log (no re-execution)
  │
  └── openapi command ─► print API schema (for Swagger / Postman)

Providers (plugins/)
  ├── flux-etl  ← runs the Flux ETL pipeline for any agency + content type
  ├── kilo      ← routes to Kilo AI service
  └── mock      ← echoes your payload back (for testing)
  └── (add any agent here — see §16)
```

The **Go monadic process** (`master/master.go`) is the central orchestrator.
It is the only component that touches both the data pipeline and the AI agent.
It records every action as an immutable event before passing control to the
next step, making the entire workflow auditable and resumable.

---

## 3. Multi-agency design

Any federal agency — or any organisation — can use this pipeline to ingest its
own data. You identify the agency in the payload using a short slug:

| Agency | Slug |
|--------|------|
| National Gallery of Art | `national-gallery-of-art` |
| National Archives | `national-archives` |
| Library of Congress | `library-of-congress` |
| National Park Service | `national-park-service` |
| NASA | `nasa` |
| NOAA | `noaa` |
| National Science Foundation | `national-science-foundation` |
| National Endowment for the Arts | `national-endowment-for-the-arts` |
| National Endowment for the Humanities | `national-endowment-for-the-humanities` |
| *(any custom agency)* | *(any slug you choose)* |

The pipeline is **not limited to these agencies**. Any slug is accepted; the
list above is provided for convenience and auto-resolves to the full agency name
in the output.

---

## 4. Content types

Each agency can ingest one or more content types:

| Value | What it includes |
|-------|-----------------|
| `images` | Photographs, artwork, satellite imagery, maps, scanned records |
| `documents` | PDFs, legal filings, reports, scanned documents |
| `text` | Written words, transcripts, metadata, structured JSON |
| `mixed` | Combination of images, documents, and text (default) |

The pipeline automatically selects the right ingestion and transformation steps
for the content type you specify.

---

## 5. Use-case matrix

After the core ETL stages complete, the pipeline runs additional steps specific
to your downstream use case. Set `"use_case"` in your payload:

| Use case | What the pipeline adds |
|----------|----------------------|
| `vr` | 3D scene manifest, spatial metadata export |
| `ai-training` | Train/val/test split, dataset manifest, schema validation |
| `research` | Structured CSV export, data dictionary, provenance metadata |
| `education` | Lesson plan metadata, accessible format export |
| `preservation` | Archival manifest, long-term checksum verification, cold storage replication |
| `accessibility` | Alt-text generation, captions, screen-reader metadata |
| `public-engagement` | Publish to public API, dashboard summary |
| `policy` | Policy brief metadata, structured summary export |
| `economic-development` | Economic indicators, trend report |
| `national-security` | Classification labels, secure enclave routing |
| `environmental` | Environmental metrics, conservation report |
| `cultural` | Cross-agency record linking, cultural heritage manifest |
| `historical` | Timeline index, historical record manifest |
| `scientific` | Scientific schema validation, peer-review package export |

---

## 6. Quick start (5 minutes)

### Prerequisites

- Go 1.21 or later (`go version` to check)
- This repository cloned locally

### Build

```bash
cd mcpcli_project
go build -o mcpcli .
```

### Smoke test — mock provider

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
  "output": {"echo": {"hello": "world"}, "provider": "mock"},
  "events": [...]
}
```

---

## 7. Running the pipeline

### Full pipeline for a single agency

```bash
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{
    "agency":       "national-archives",
    "content_type": "documents",
    "stage":        "full",
    "use_case":     "preservation"
  }'
```

### Dry run — see every step without moving data

```bash
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{
    "agency":       "nasa",
    "content_type": "images",
    "stage":        "full",
    "use_case":     "ai-training",
    "dry_run":      true
  }'
```

The output lists every step that *would* execute, with no data changed.

### Run only the ingest stage

```bash
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{
    "agency":       "library-of-congress",
    "content_type": "mixed",
    "stage":        "ingest"
  }'
```

### Pipeline stages

| Stage | What it does |
|-------|-------------|
| `ingest` | Load raw content into the internal store; calculate checksums |
| `transform` | Compute metrics, embeddings, named entities, classifications |
| `export` | Push processed data to PostgreSQL / object store |
| `full` | Run all three stages in order (default) |

---

## 8. Resuming an interrupted run

Every run automatically saves a **checkpoint file** after each step.
The file is named `<run-id>.checkpoint.json` in the current directory.

If a run is interrupted (network error, crash, Ctrl-C), find the run ID in the
checkpoint filename and pass it to `--resume`:

```bash
# The checkpoint file is named e.g.: 1740592800000000000.checkpoint.json
./mcpcli master \
  --provider flux-etl \
  --token flux-etl-demo-token \
  --payload '{"agency":"nasa","content_type":"images","stage":"full","use_case":"ai-training"}' \
  --resume 1740592800000000000
```

The pipeline skips already-completed steps and continues from where it stopped.
The result includes `"resumed": true`.

> **Tip:** Checkpoint files are deleted automatically when a run succeeds.
> A `.checkpoint.json` file in your directory means a previous run did not finish.

---

## 9. Replaying the event log

Every step is recorded as a timestamped event. Print the full log from any
checkpoint without re-running the pipeline:

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
  [3] 2026-02-26T18:00:02Z  call
    {"model": "gpt-demo", "provider": "flux-etl"}
```

Useful for:
- **Auditing** — who ran what, when, with which data
- **Debugging** — see exactly where a run stopped
- **Compliance** — keep a record of every data movement

---

## 10. Choosing a provider / AI agent

Use `--provider` to select which AI/ML agent processes your data.
The pipeline is designed so **any agent can be plugged in** — the list below
is what ships out of the box:

| Provider | Token | What it does |
|----------|-------|-------------|
| `flux-etl` | `flux-etl-demo-token` | Runs the Flux ETL pipeline |
| `kilo` | `kilo-demo-token` | Routes to Kilo AI service |
| `mock` | any non-empty string | Echoes your payload (testing only) |

To add a new agent, see [§16 — For developers](#16-for-developers-extending-the-system).

---

## 11. Weighted model routing

Split traffic between two AI models for A/B testing or gradual rollout:

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

## 12. Viewing the API schema

The CLI exposes an OpenAPI 3.0 schema. Import it into Swagger UI or Postman:

```bash
# Print to terminal
./mcpcli openapi

# Save to file
./mcpcli openapi > openapi.json
```

---

## 13. Edge and Kubernetes scalability

> **The test question:** *If we extend AI/ML processes to the edge — lightweight,
> scale-from-zero, not the fastest but handles light workloads perfectly because
> it is on the edge and can be deployed anywhere — how can we ensure the data
> ingestion process is scalable, efficient, and secure?*

**Answer:**

### Scalability

The pipeline is a **stateless binary** (single Go executable). Each run saves
its state to a checkpoint file, so:

- A pod can be evicted and restarted without losing progress.
- Checkpoint files are stored on a Kubernetes **PersistentVolumeClaim (PVC)**,
  surviving pod restarts and node failures.
- **Scale-from-zero** is achieved with KEDA or Kubernetes HPA:
  - Idle: 0 replicas (no cost, no resource consumption)
  - On trigger (new data arrives in a queue or object store): 1+ pods spin up,
    load the checkpoint, and continue processing
  - On completion: pods scale back to zero

```
[New data arrives]
       │
       ▼
[KEDA / HPA trigger]
       │
       ▼
[Pod spins up]  →  [Load checkpoint if exists]  →  [Run pipeline stage]
       │
       ▼
[Write checkpoint to PVC]  →  [Continue or scale down]
```

### Efficiency

- Each pipeline **stage is independently runnable** (`ingest`, `transform`,
  `export`). A light workload can run only the stage it needs.
- The Go binary is small (~10 MB) and starts in milliseconds — ideal for edge
  nodes with limited resources.
- DuckDB (the internal analytics store) runs entirely in-process with no
  separate database server required.

### Security

- **All data flows are internal.** Raw content never leaves the pipeline.
  The only external call is to the AI/ML agent selected via `--provider`.
- **Tokens are never logged.** The event log records provider names and step
  names, not credentials.
- **Classification labels** are applied per use case (e.g. `national-security`
  routes to a secure enclave step).
- **Checksums** are calculated on every ingested file and stored alongside the
  data, enabling tamper detection and audit.
- Kubernetes **Secrets** should be used to inject tokens at runtime; never
  hard-code tokens in payloads or manifests.

### Deployment pattern

```yaml
# Minimal Kubernetes deployment sketch
apiVersion: apps/v1
kind: Deployment
metadata:
  name: flux-etl-worker
spec:
  replicas: 0          # starts at zero; KEDA scales up on trigger
  template:
    spec:
      containers:
        - name: mcpcli
          image: flux-etl:latest
          env:
            - name: FLUX_TOKEN
              valueFrom:
                secretKeyRef:
                  name: flux-etl-secrets
                  key: token
          volumeMounts:
            - name: checkpoints
              mountPath: /checkpoints
      volumes:
        - name: checkpoints
          persistentVolumeClaim:
            claimName: flux-etl-checkpoints
```

---

## 14. Security model

| Principle | How it is enforced |
|-----------|-------------------|
| Internal data flows only | Raw content never leaves the pipeline; only the AI agent call is external |
| Tokens never logged | Event log records provider names, not credentials |
| Append-only audit trail | Monadic event log cannot be modified after writing |
| Checksum verification | Every ingested file is checksummed; mismatches are flagged |
| Classification labels | `national-security` use case applies labels before any export |
| Kubernetes Secrets | Tokens injected at runtime via env vars, never in source code |
| Scale-to-zero | No idle compute means no idle attack surface |

---

## 15. Workflow objectives (from integration.yaml)

| Objective | What was built | Where |
|-----------|---------------|-------|
| `durable_workflows` | Checkpoint save/load after every step | [`master/master.go`](master/master.go) — `SaveCheckpoint`, `LoadCheckpoint` |
| `plugin_routing` | Provider registry: `flux-etl`, `kilo`, `mock` | [`plugins/interfaces.go`](plugins/interfaces.go) — `Providers` map |
| `ai_model_integration` | Weighted model selection | [`master/master.go`](master/master.go) — `selectModel` |
| `event_logging` | Timestamped, append-only event log | [`master/master.go`](master/master.go) — `Monad.record` |
| `kubernetes_ready` | Stateless binary + PVC checkpoints + scale-from-zero pattern | §13 above |
| `cli_openapi` | `openapi` subcommand + full schema | [`cmd/root.go`](cmd/root.go), [`plugins/interfaces.go`](plugins/interfaces.go) |
| `multi_agency` | `agency` field in payload; 9 agencies pre-configured | [`plugins/flux.go`](plugins/flux.go) — `knownAgencies` |
| `multi_use_case` | 14 use cases with dedicated post-processing steps | [`plugins/flux.go`](plugins/flux.go) — `useCaseSteps` |
| `edge_scalability` | Lightweight binary, scale-from-zero, PVC checkpoints | §13 above |
| `internal_data_flows` | Go monadic process is the only orchestration point | [`master/master.go`](master/master.go) |
| `secure_by_default` | Tokens never logged; checksums on every file | [`master/master.go`](master/master.go), [`plugins/flux.go`](plugins/flux.go) |

### Deliverables status

| Deliverable | Status |
|-------------|--------|
| `integrated_repository` | ✅ Flux ETL provider wired into MCPCLI |
| `docker_support` | ✅ See `demo/Dockerfile` and `demo/docker-compose.yml` |
| `k8s_manifests` | 🔜 Next step (see `next_steps` in `integration.yaml`) |
| `example_workflows` | ✅ See §7 above |
| `documentation` | ✅ This file |
| `event_samples` | ✅ Use `mcpcli replay <run-id>` after any run |
| `multi_agency_payload_examples` | ✅ See `integration.yaml` → `example_payloads` |
| `use_case_step_matrix` | ✅ See §5 above |

---

## 16. For developers: extending the system

### Adding a new provider / AI agent

1. Create `plugins/myprovider.go` implementing `TokenProvider` and `Client`.
2. Add it to the `Providers` map in [`plugins/interfaces.go`](plugins/interfaces.go).
3. Add a new path to `OpenAPISchema` in [`plugins/interfaces.go`](plugins/interfaces.go).
4. Run `go build ./...` to verify.

Minimal provider template:

```go
package plugins

type MyProvider struct{}
func (p *MyProvider) Name() string { return "my-provider" }
func (p *MyProvider) Authenticate(token string) (Client, error) {
    // validate token against your auth service
    return &MyClient{}, nil
}

type MyClient struct{}
func (c *MyClient) Call(payload map[string]interface{}) (map[string]interface{}, error) {
    // do work — all data stays internal; only return results
    return map[string]interface{}{"result": "ok"}, nil
}
```

### Adding a new use case

In [`plugins/flux.go`](plugins/flux.go), add a case to `useCaseSteps()`:

```go
case "my-use-case":
    return []string{"my_step_1", "my_step_2"}
```

Also add the slug to `validUseCases` and document it in `integration.yaml`.

### Checkpoint file format

```json
{
  "run_id": "1740592800000000000",
  "provider_name": "flux-etl",
  "model": "gpt-demo",
  "payload": {"agency": "nasa", "content_type": "images", "stage": "full"},
  "events": [...],
  "last_step": "auth",
  "created_at": "2026-02-26T18:00:01Z"
}
```

---

## 17. Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `unknown provider: xyz` | Typo in `--provider` | Use `mock`, `kilo`, or `flux-etl` |
| `invalid token` | Wrong token for provider | See token table in §10 |
| `invalid payload JSON` | Unescaped quotes | Wrap JSON in single quotes: `--payload '{"key":"val"}'` |
| `checkpoint not found` | Wrong run ID | List `.checkpoint.json` files in current directory |
| `flux-etl: unknown stage` | Typo in stage name | Use `ingest`, `transform`, `export`, or `full` |
| `flux-etl: unknown content_type` | Typo in content_type | Use `images`, `documents`, `text`, or `mixed` |
| `flux-etl: unknown use_case` | Typo in use_case | See use-case table in §5 |

---

*Generated from [`integration.yaml`](../integration.yaml) — owner: product_engineering — priority: high — version: 2.0*
