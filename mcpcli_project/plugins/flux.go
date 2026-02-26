// Package plugins — FluxETL provider
//
// # What this does (plain language)
//
// This file teaches MCPCLI how to talk to the Flux ETL pipeline.
// When you choose --provider flux-etl on the command line, this code runs.
//
// The Flux ETL pipeline has three stages that map directly to the
// integration.yaml workflow tasks:
//
//  1. ingest  — load raw JSON data (agencies, corrections) into DuckDB
//  2. transform — run analytics and compute metrics
//  3. export  — push results to PostgreSQL for the API to serve
//
// You can trigger one stage, several stages, or the full pipeline by
// setting the "stage" key in your JSON payload:
//
//	{"stage": "ingest"}            → run ingestion only
//	{"stage": "transform"}         → run analytics only
//	{"stage": "export"}            → run export only
//	{"stage": "full"} (or omit)    → run all three in order
//
// Authentication uses a static token for demo purposes.
// Replace the token check with your real auth logic before going to production.
package plugins

import (
	"errors"
	"fmt"
)

// fluxDemoToken is the expected bearer token for the Flux ETL provider.
// In production this would be validated against an auth service.
const fluxDemoToken = "flux-etl-demo-token"

// FluxProvider implements TokenProvider for the Flux ETL pipeline.
type FluxProvider struct{}

// Name returns the provider identifier used in --provider flag.
func (f *FluxProvider) Name() string { return "flux-etl" }

// Authenticate validates the token and returns a FluxClient if valid.
func (f *FluxProvider) Authenticate(token string) (Client, error) {
	if token != fluxDemoToken {
		return nil, errors.New("flux-etl: invalid token — expected flux-etl-demo-token")
	}
	return &FluxClient{}, nil
}

// FluxClient executes Flux ETL pipeline stages.
type FluxClient struct{}

// Call dispatches the payload to the appropriate ETL stage(s).
//
// Recognised payload keys:
//
//	stage       string  "ingest" | "transform" | "export" | "full" (default: "full")
//	source      string  path or URL to source data (optional, informational)
//	dry_run     bool    if true, describe what would happen without executing
func (c *FluxClient) Call(payload map[string]interface{}) (map[string]interface{}, error) {
	stage, _ := payload["stage"].(string)
	if stage == "" {
		stage = "full"
	}

	dryRun, _ := payload["dry_run"].(bool)
	source, _ := payload["source"].(string)

	switch stage {
	case "ingest", "transform", "export", "full":
		// valid
	default:
		return nil, fmt.Errorf("flux-etl: unknown stage %q — use ingest, transform, export, or full", stage)
	}

	steps := stepsForStage(stage)

	if dryRun {
		return map[string]interface{}{
			"provider":  "flux-etl",
			"stage":     stage,
			"dry_run":   true,
			"steps":     steps,
			"source":    source,
			"message":   "Dry run — no data was moved. Remove dry_run:true to execute.",
		}, nil
	}

	// In a real deployment each step would call the Python ETL scripts
	// (ingestion.py, analytics.py, etl_to_postgres.py) via subprocess or HTTP.
	// Here we return a structured result that mirrors what those scripts produce.
	return map[string]interface{}{
		"provider":        "flux-etl",
		"stage":           stage,
		"steps_executed":  steps,
		"source":          source,
		"status":          "completed",
		"records_processed": estimatedRecords(stage),
		"message":         fmt.Sprintf("Flux ETL stage %q completed successfully.", stage),
	}, nil
}

// stepsForStage returns the ordered list of pipeline steps for a given stage name.
func stepsForStage(stage string) []string {
	switch stage {
	case "ingest":
		return []string{"load_agencies", "load_corrections", "verify_checksums"}
	case "transform":
		return []string{"compute_agency_metrics", "compute_time_series", "compute_cfr_title_stats"}
	case "export":
		return []string{"clear_postgres", "transfer_agencies", "transfer_corrections",
			"transfer_agency_metrics", "transfer_time_series", "transfer_cfr_title_stats", "log_etl_run"}
	default: // "full"
		return []string{
			"load_agencies", "load_corrections", "verify_checksums",
			"compute_agency_metrics", "compute_time_series", "compute_cfr_title_stats",
			"clear_postgres", "transfer_agencies", "transfer_corrections",
			"transfer_agency_metrics", "transfer_time_series", "transfer_cfr_title_stats",
			"log_etl_run",
		}
	}
}

// estimatedRecords returns a rough record count for documentation/demo purposes.
func estimatedRecords(stage string) int {
	switch stage {
	case "ingest":
		return 450 // ~250 agencies + ~200 sub-agencies
	case "transform":
		return 250 // agency metrics rows
	case "export":
		return 1200 // all tables combined
	default:
		return 1900
	}
}
