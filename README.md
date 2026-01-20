# Flux ETL

Flux ETL is a full-stack pipeline application that inputs unstructured data into structured schemas for data analysis. Flux generates reports with graphical charts and statistical models baked in.

Flux ETL produces **Data Plasma** with the API-first ETL pipeline with a schema contract layer, built-in charting, and statistical analysis. It provides reproducible, containerized pipelines that run locally via Docker and scale to production builds.

• “API-first ETL with enforceable schemas and built-in analytics.”
• “Deterministic data pipelines from local Docker to full production.”
• “Schema contracts, automated flows, and statistical insight in one engine.”

## Features
- API-first ETL design with strict schema contracts  
- Interactive UI with charting and statistical analysis  
- Containerized local development (Docker)  
- Production-ready builds with versioned releases  
- Deterministic, reproducible pipelines  

## Getting Started

### Prerequisites
- Docker (v20+)  
- Docker Compose (optional for multi-container setups)  
- Node.js or Python environment (if contributing to the UI or scripts)

### Local Setup
1. Clone the repository:  
   ```bash
   git clone https://github.com/your-org/data-plasma.git
   cd data-plasma

Currently, Flux ETL consists of three logically seperate layers.

## Data Connector
#### ETL Controller
- [`./demo/`](./demo/README.md)
- (Py, Go)

## Model Connector 
#### Domain Store
- [`./zOS`](./zOS/README.md)
- (C, Java)

## Federated Connector
#### Platform Layer
- [`./zenbase`](./zenbase/README.md)
- (PG, JS)

## Package Manager

This project uses **pnpm** exclusively. The specific version is pinned in package.json:
- Version: `pnpm@10.24.0`
- Never use `npm` or `yarn` for JavaScript dependencies
- Docker builder stage enables corepack for pnpm

## zOS Integration Context

The zOS project is a separate framework for federal mainframe data modernization:
- **Purpose**: Extract data from z/OS mainframes (DB2, VSAM, IMS) via secure TN3270/JCL
- **Architecture**: TN3270 TLS connector → JCL submission → DB2 unloads → DuckDB → PostgreSQL → APIs
- **Mission**: Cross-agency data layer for federal government without changing legacy mainframes
- **Deployment**: Designed for LTOD (Limited Tour of Duty) engineering teams
- **Scope**: 20-30 agencies/year with 7-8 engineers via automation

This is conceptual/planning stage work. The `demo/` project serves as a reference implementation of the data pipeline architecture.

## Repository Overview

StafferFi is a dual-purpose repository containing:
1. **demo/** - Multi-tier polyglot ETL service for eCFR analytics (pnpm monorepo)
2. **zOS/** - Mainframe integration framework for federal data modernization

### Demo Project (Primary)

```bash
brew install --cask docker
./demo.sh
```

#### Setup and Build
```bash
cd demo

# Install dependencies (uses pnpm workspaces)
pnpm install

# Build all apps
pnpm build

# Build specific apps
pnpm build:web    # Next.js frontend
pnpm build:api    # Express API
```

#### Development
```bash
# Run web app (Next.js) in dev mode
pnpm dev:web

# Run API in dev mode
pnpm dev:api

# Run individual apps from their directories
cd apps/web && pnpm dev
cd apps/api && pnpm dev
```

#### Testing
```bash
# Web app tests (Vitest)
cd apps/web
pnpm test
pnpm test:watch

# Cypress E2E tests
pnpm cypress:open
pnpm cypress

# Python lake tests
cd apps/lake
python test_pipeline.py
python test_postgres.py
```

#### Linting and Type Checking
```bash
# Web app
cd apps/web
pnpm lint
pnpm typecheck
pnpm format

# API (TypeScript)
cd apps/api
pnpm build   # Runs tsc which checks types
```

#### Docker Development
```bash
cd demo

# Quick start all services (recommended)
./demo.sh

# Or use docker compose
sudo docker compose up --build

# Access services:
# - Web UI:  http://localhost:3000
# - API:     http://localhost:4000  
# - Lake:    http://localhost:8000
# - Postgres: localhost:5432

# Stop services
sudo docker compose down

# Full reset
sudo docker compose down -v
sudo docker compose up --build
```

#### Lake (Python) Development
```bash
cd demo/apps/lake

# Create virtualenv
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run ingestion and ETL
python ingestion.py
python etl_to_postgres.py

# Run lake service
gunicorn app:app --bind 0.0.0.0:8000
```

### zOS Project

The zOS directory contains mainframe integration tools but has minimal executable code. Refer to `zOS/README.md` for architecture details.

## Architecture Overview

### Demo Project Structure

This is a **pnpm monorepo** with three main applications:

#### 1. Web UI (`apps/web`)
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: amCharts4
- **Testing**: Vitest, Testing Library, Cypress
- **Structure**: 
  - `app/` - Next.js app router pages (dashboard, agencies, corrections, trends, reports)
  - `components/` - Reusable React components (BarChart, LineChart, etc.)

#### 2. API (`apps/api`)
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (via `pg` client)
- **Previously**: Used DuckDB, migrated to PostgreSQL for production
- **Endpoints**: 11 REST endpoints for agencies, corrections, and trends data
- **Port**: 4000 (configurable via `API_PORT`)

#### 3. Lake (`apps/lake`)
- **Framework**: Flask + Gunicorn
- **Language**: Python
- **Analytics Engine**: DuckDB for in-memory analytics
- **Data Pipeline**: 
  - `ingestion.py` - Downloads eCFR data, validates checksums (SHA-256), stores in DuckDB
  - `analytics.py` - Calculates RVI (Regulatory Volatility Index) and other metrics
  - `etl_to_postgres.py` - Migrates transformed data from DuckDB to PostgreSQL
- **Schemas**: `duckdb_schema.sql` and `postgres_schema.sql`
- **Port**: 8000

#### Shared Packages
- `packages/tailwind-config` - Shared Tailwind configuration

### Data Flow Architecture

```
eCFR API → ingestion.py → DuckDB (analytics) → etl_to_postgres.py → PostgreSQL → Express API → Next.js Web
```

1. **Ingestion**: Python fetches eCFR corrections and agency data, validates checksums
2. **Analytics**: DuckDB performs analytical transformations (RVI calculation, aggregations)
3. **ETL**: Data loaded into PostgreSQL for API consumption
4. **API Layer**: Express serves REST endpoints with PostgreSQL queries
5. **Frontend**: Next.js fetches from API and renders charts/dashboards

### Deployment Model

#### Docker Multi-Stage Build
The `Dockerfile` uses a sophisticated multi-stage build:

1. **deps** (node:20-alpine) - Installs pnpm dependencies
2. **builder** - Builds Next.js (standalone output) and API (TypeScript), creates self-contained API bundle
3. **lake-deps** (python:3.10-slim) - Creates Python virtualenv with lake dependencies
4. **runner** (python:3.10-slim) - Final image with all services

#### Process Management
`supervisord` manages all services in a single container:
- **lake_pipeline** (priority 5) - Runs ingestion + ETL once at startup
- **web** (priority 20) - Next.js standalone server on port 3000
- **api** (priority 20) - Express API on port 4000
- **lake** (priority 20) - Gunicorn Flask app on port 8000

The priority system ensures ETL completes before web services start.

#### Docker Compose Orchestration
Preferred for development:
- **postgres** service with health checks
- **etl** one-shot service (depends on postgres health)
- **api** service (depends on postgres + etl completion)
- **web** service (depends on api)

## Environment Variables

### API
- `DATABASE_URL` - PostgreSQL connection string (default: `postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics`)
- `API_PORT` - API listen port (default: 4000)
- `NODE_ENV` - Node environment (production/development)

### Web
- `PORT` - Web server port (default: 3000)
- `HOSTNAME` - Bind address (default: 0.0.0.0)
- `API_URL` - Internal API URL for SSR (default: http://api:4000)
- `NEXT_PUBLIC_API_URL` - Client-side API URL (default: http://localhost:4000)
- `NEXT_TELEMETRY_DISABLED` - Set to 1 in production

### Lake
- `DATABASE_URL` - PostgreSQL connection string for ETL

## Key Technical Decisions

### Package Management
- **Tool**: pnpm with workspaces
- **Rationale**: Efficient disk usage, strict dependency resolution, fast
- **Config**: `pnpm-workspace.yaml` defines workspace structure

### Next.js Standalone Output
- Web app built with `output: 'standalone'` in next.config.ts
- Produces self-contained server bundle (no external dependencies)
- Reduces runtime image size significantly

### Self-Contained API Bundle
The API build process creates an isolated bundle:
1. TypeScript compiled to `dist/`
2. Copied to `/tmp/api` with package.json
3. Production dependencies installed via npm (not pnpm)
4. Decouples runtime from monorepo structure

### Database Strategy
- **DuckDB**: Used for analytical transformations (columnar, fast aggregations)
- **PostgreSQL**: Used for API queries (ACID, connection pooling)
- **Why Both**: DuckDB excels at ETL analytics, PostgreSQL serves web requests

### RVI (Regulatory Volatility Index)
Custom metric calculated in `analytics.py`:
- Measures frequency and impact of regulatory corrections
- Combines correction count, recency, and magnitude
- Core business logic for the eCFR analytics platform

## Testing Strategy

### Web App
- **Unit Tests**: Vitest + Testing Library
- **E2E Tests**: Cypress
- **Storybook**: Component development and visual testing

### API
- TypeScript compilation serves as type checking
- No explicit test suite (integration tests via E2E)

### Lake
- `test_pipeline.py` - Data integrity, checksum verification, analytics validation
- `test_postgres.py` - PostgreSQL schema and ETL verification
- Run with: `python test_pipeline.py`

## Development Workflow Notes

### Working with the Monorepo
- Always run `pnpm install` from repo root
- Use workspace filters: `pnpm --filter @stafferfi/web <command>`
- Workspace names: `@stafferfi/web`, `@stafferfi/api`

### Database Development
- Postgres runs in Docker (non-persistent tmpfs for MVP)
- Schema changes: Edit `apps/lake/postgres_schema.sql` and rebuild ETL
- DuckDB file: `apps/lake/ecfr_analytics.duckdb` (gitignored)

### Docker Best Practices
- Use `docker compose` for development (orchestrates dependencies)
- Use `./demo.sh` for quick demos
- The single-container `stafferfi-all` image requires external Postgres
- Always check `docker compose logs -f` when debugging

### Supervisor Management
Inside the container:
```bash
supervisorctl -c /etc/supervisord.conf status
supervisorctl -c /etc/supervisord.conf tail <service> stdout
supervisorctl -c /etc/supervisord.conf restart <service>
```

## Critical Implementation Details

### Avoiding DuckDB Lock Conflicts
The `lake_pipeline` program runs ingestion AND ETL sequentially in one command to prevent multiple processes from accessing DuckDB simultaneously. Never run these as separate supervisor programs.

### API Endpoint Structure
The API (`apps/api/src/index.ts`) exposes:
- `/` - API metadata and endpoint list
- `/health` - Health check
- `/api/stats` - Aggregate statistics
- `/api/agencies` - List agencies (supports pagination)
- `/api/agencies/:slug` - Agency details
- `/api/agencies/top/corrections` - Top agencies by correction count
- `/api/agencies/top/rvi` - Top agencies by RVI
- `/api/corrections` - List corrections (filterable by year, title)
- `/api/corrections/recent` - Recent corrections
- `/api/trends/yearly` - Yearly trend data
- `/api/trends/monthly` - Monthly trend data
- `/api/trends/titles` - Top CFR titles
- `/api/reports/word-count` - Word count report (if implemented)
- `/api/reports/scorecard` - Scorecard report (if implemented)

### Next.js Page Structure
- `app/page.tsx` - Dashboard with stats cards and charts
- `app/agencies/page.tsx` - Sortable, searchable agency list
- `app/agencies/[slug]/page.tsx` - Agency detail page
- `app/corrections/page.tsx` - Corrections list
- `app/trends/page.tsx` - Trend visualizations
- `app/reports/*` - Report pages
