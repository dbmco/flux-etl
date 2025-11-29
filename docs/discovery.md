# StafferFi Discovery Session

- An enterprise‑scale application that polls the [Federal Register](https://www.ecfr.gov/) via the public eCFR API (`OpenAPI 3.0.4`).
- Users select points in time to compare historical versions through a modern UI.
- The application supports widgets, with the default set to the scorecard widget.

## Architecture Overview  
[ADRs](./docs/ADRs.md)

| Layer | Responsibility | Tech |
|-------|----------------|------|
| **Consumer** | Pulls eCFR data, parses regulations, writes to DB | Go or Python microservice |
| **Data** | Normalized regulation tables & audit logs | Docker‑ized PostgreSQL (or TimescaleDB) |
| **Producer** | Version‑controlled REST API (Swagger‑first) | FastAPI **or** Go‑chi |
| **Presentation** | Interactive dashboards | React + Vite |
| **Orchestration** | Multi‑container lifecycle | Docker‑Compose |

### Image Naming (namespace `ecfr`)  

- `ecfr/unified-api:v1` – API gateway (v1)  
- `ecfr/ingestor:go-v1` / `ecfr/ingestor:py-v1` – ingestion service  
- `ecfr/db:postgres-v1` – PostgreSQL container  
- `ecfr/frontend:react-v1` – React UI

## Docker‑Compose (quick start)

```yaml
version: "3.9"
services:
  db:
    image: ecfr/db:postgres-v1
    container_name: ecfr-db
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: ecfr
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: regulations

  ingestor:
    image: ecfr/ingestor:go-v1   # or :py-v1
    container_name: ecfr-ingestor
    depends_on: [db]
    environment:
      DB_HOST: ecfr-db
      DB_USER: ecfr
      DB_PASS: secret

  api:
    image: ecfr/unified-api:v1
    container_name: ecfr-api
    depends_on: [db, ingestor]
    ports: ["8080:8080"]
    environment:
      DB_HOST: ecfr-db

  ui:
    image: ecfr/frontend:react-v1
    container_name: ecfr-ui
    depends_on: [api]
    ports: ["3000:3000"]
```

## Design Considerations  

- **API‑first**: endpoints support map / filter / reduce for UI needs.  
- **Naming convention**: `[Env]/[Category]/[ComponentName]` (e.g., `Dev/API/eFCRFetcher`).  
- **Example names**: `eCFR/Hub/v1`, `eCFR/Vault/v1`, `eCFR/Analytics/v1`, `eCFR/DataLake/v1`, `eCFR/Stream/v1`, `eCFR/Pulse/v1`, `eCFR/Health/v1`.  

## Engineering Guidelines  

### Dockerfile (example)

```dockerfile
FROM alpine:3.20

COPY install-opentofu.sh /tmp/install-opentofu.sh
RUN apk add --no-cache bash curl gpg gpg-agent \
    && chmod +x /tmp/install-opentofu.sh \
    && /tmp/install-opentofu.sh --install-method standalone --install-path /usr/local/bin \
    && rm /tmp/install-opentofu.sh \
    && apk add --no-cache git

WORKDIR /workspace
```

### Sub‑Components  

- `Backend/Services/RegulationParser` – parses eCFR payloads.  
- `Backend/Datastore/RegulationsDB` – stores parsed regulations.  
- `Backend/Analytics/ImpactModel` – runs impact‑score calculations.

#### Frontend

### Naming Requirements (SecOps)  

- Clear, readable, predictable.  
- Avoid ambiguous abbreviations.  

## Acceptance Criteria  

[Planning Queue](./docs/planning/README.md)

## Planning & Complexity Ranking  

| Rank | Task | Complexity (Fibonacci) |
|------|------|------------------------|
| 1 | Database schema & migrations | 5 |
| 1 | CI/CD stubs (GitHub Actions) | 5 |
| 1 | Docker‑Compose & image naming | 5 |
| 1 | Smoke / health checks | 5 |
| 1 | Lint / static analysis | 5 |
| 2 | Ingestion service (Go/Python) | 13 |
| 2 | Unified API (Swagger‑first) | 13 |
| 2 | React + Vite UI | 13 |
| 2 | Unit tests (service‑level) | 13 |
| 2 | Integration tests (full stack) | 13 |
| 3 | Analytics engine (word count, diffs, checksum, custom metric) | 21 |

## UI Design Goals  

- Display word count per agency.  
- Visualize historical changes (time‑series).  
- Show checksum for each agency.  

### BYOM (Build‑Your‑Own‑Metric)  

- **Regulation Scorecard** – combines growth rate, amendment frequency, and checksum variance into a single impact score.  

## Roadmap (out‑of‑scope for MVP)  

- Full‑text search (Elasticsearch) – adds operational overhead.  
- Authentication & RBAC – can be added after core pipelines are stable.  
- Real‑time streaming / WebSockets – not needed for point‑in‑time comparison.  
- Multi‑region / Kubernetes – Docker‑Compose suffices for early stages.  
- Advanced data‑quality validation, i18n, performance benchmarking, backup/restore automation – deferred to later phases.  