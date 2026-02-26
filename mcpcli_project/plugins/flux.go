// Package plugins — FluxETL provider
//
// # What this does (plain language)
//
// This file teaches MCPCLI how to talk to the Flux ETL pipeline.
// When you choose --provider flux-etl on the command line, this code runs.
//
// # Multi-agency design
//
// Any federal agency (or any organisation) can use this pipeline to ingest
// its own data. You identify the agency and the type of content in the payload:
//
//	{
//	  "agency":       "national-archives",   // which agency owns this data
//	  "content_type": "documents",           // images | documents | text | mixed
//	  "stage":        "full",                // ingest | transform | export | full
//	  "use_case":     "preservation",        // see use-case list below
//	  "source":       "s3://my-bucket/docs"  // where the raw data lives (optional)
//	}
//
// # Supported agencies (examples — any agency can be added)
//
//	national-gallery-of-art
//	national-archives
//	library-of-congress
//	national-park-service
//	nasa
//	noaa
//	national-science-foundation
//	national-endowment-for-the-arts
//	national-endowment-for-the-humanities
//	(or any custom slug)
//
// # Supported content types
//
//	images     — photographs, artwork, satellite imagery, maps
//	documents  — PDFs, scanned records, legal filings, reports
//	text       — written words, transcripts, metadata, structured JSON
//	mixed      — combination of the above (default)
//
// # Supported use cases
//
//	vr              — build virtual environments from the data
//	ai-training     — prepare datasets for AI/ML model training
//	research        — structured export for academic or policy research
//	education       — generate educational materials
//	preservation    — long-term archival with checksums and audit trails
//	accessibility   — transform data for public accessibility (captions, alt-text)
//	public-engagement — dashboards and public-facing APIs
//	policy          — structured summaries for policy decision-making
//	economic-development — economic indicators and trend analysis
//	national-security — classified-boundary-aware processing (internal only)
//	environmental   — conservation metrics and environmental monitoring
//	cultural        — cultural heritage cataloguing and cross-agency linking
//	historical      — historical record indexing and timeline construction
//	scientific      — scientific dataset preparation and peer-review export
//
// # Pipeline stages
//
//	ingest     — load raw content (images, docs, text) into the internal store
//	transform  — run analytics, compute metrics, apply use-case-specific models
//	export     — push processed data to the downstream store (PostgreSQL / object store)
//	full       — run all three stages in order (default)
//
// # Edge / Kubernetes scalability
//
// The pipeline is designed to run as a lightweight, stateless container.
// Each stage is independently resumable via checkpoint files, so a pod restart
// does not lose progress. Checkpoint files can be stored on a Kubernetes
// PersistentVolumeClaim (PVC) so they survive pod eviction.
//
// Scale-from-zero pattern:
//   - Idle: 0 replicas (KEDA or HPA scales to zero)
//   - On trigger (new data arrives): 1+ pods spin up, pick up checkpoint, continue
//   - On completion: pods scale back to zero
//
// # Security model
//
// All data flows are internal. The only external call is to the AI/ML agent
// selected via --provider. The Go monadic process in master/master.go is the
// single orchestration point — it never exposes raw data externally.
// Authentication is token-based per provider; tokens are never logged.
package plugins

import (
	"errors"
	"fmt"
	"strings"
)

// fluxDemoToken is the expected bearer token for the Flux ETL provider.
// In production this would be validated against an auth service or Kubernetes secret.
const fluxDemoToken = "flux-etl-demo-token"

// knownAgencies is the set of recognised agency slugs.
// Any slug is accepted; this list is used to provide helpful error messages.
var knownAgencies = map[string]string{
	"national-gallery-of-art":               "National Gallery of Art",
	"national-archives":                     "National Archives",
	"library-of-congress":                   "Library of Congress",
	"national-park-service":                 "National Park Service",
	"nasa":                                  "National Aeronautics and Space Administration",
	"noaa":                                  "National Oceanic and Atmospheric Administration",
	"national-science-foundation":           "National Science Foundation",
	"national-endowment-for-the-arts":       "National Endowment for the Arts",
	"national-endowment-for-the-humanities": "National Endowment for the Humanities",
}

// validContentTypes lists the accepted content_type values.
var validContentTypes = map[string]bool{
	"images": true, "documents": true, "text": true, "mixed": true,
}

// validUseCases lists the accepted use_case values.
var validUseCases = map[string]bool{
	"vr": true, "ai-training": true, "research": true, "education": true,
	"preservation": true, "accessibility": true, "public-engagement": true,
	"policy": true, "economic-development": true, "national-security": true,
	"environmental": true, "cultural": true, "historical": true, "scientific": true,
}

// FluxProvider implements TokenProvider for the Flux ETL pipeline.
type FluxProvider struct{}

// Name returns the provider identifier used in the --provider flag.
func (f *FluxProvider) Name() string { return "flux-etl" }

// Authenticate validates the token and returns a FluxClient if valid.
func (f *FluxProvider) Authenticate(token string) (Client, error) {
	if token != fluxDemoToken {
		return nil, errors.New("flux-etl: invalid token — expected flux-etl-demo-token")
	}
	return &FluxClient{}, nil
}

// FluxClient executes Flux ETL pipeline stages for any agency and content type.
type FluxClient struct{}

// Call dispatches the payload to the appropriate ETL stage(s).
//
// Recognised payload keys:
//
//	agency        string  agency slug (e.g. "nasa", "library-of-congress")
//	content_type  string  "images" | "documents" | "text" | "mixed" (default: "mixed")
//	stage         string  "ingest" | "transform" | "export" | "full" (default: "full")
//	use_case      string  downstream use case (e.g. "ai-training", "preservation")
//	source        string  path or URL to source data (optional, informational)
//	dry_run       bool    if true, describe what would happen without executing
func (c *FluxClient) Call(payload map[string]interface{}) (map[string]interface{}, error) {
	// ── Resolve fields with defaults ─────────────────────────────────────────
	agency, _ := payload["agency"].(string)
	if agency == "" {
		agency = "generic"
	}

	contentType, _ := payload["content_type"].(string)
	if contentType == "" {
		contentType = "mixed"
	}

	stage, _ := payload["stage"].(string)
	if stage == "" {
		stage = "full"
	}

	useCase, _ := payload["use_case"].(string)
	if useCase == "" {
		useCase = "general"
	}

	dryRun, _ := payload["dry_run"].(bool)
	source, _ := payload["source"].(string)

	// ── Validate ─────────────────────────────────────────────────────────────
	if !validContentTypes[contentType] {
		return nil, fmt.Errorf(
			"flux-etl: unknown content_type %q — use images, documents, text, or mixed",
			contentType,
		)
	}

	switch stage {
	case "ingest", "transform", "export", "full":
		// valid
	default:
		return nil, fmt.Errorf(
			"flux-etl: unknown stage %q — use ingest, transform, export, or full",
			stage,
		)
	}

	if useCase != "general" && !validUseCases[useCase] {
		return nil, fmt.Errorf(
			"flux-etl: unknown use_case %q — see README for supported use cases",
			useCase,
		)
	}

	// ── Resolve human-readable agency name ───────────────────────────────────
	agencyName := knownAgencies[strings.ToLower(agency)]
	if agencyName == "" {
		agencyName = agency // accept any custom slug
	}

	// ── Build step list ───────────────────────────────────────────────────────
	steps := stepsForStage(stage, contentType, useCase)

	// ── Dry run ───────────────────────────────────────────────────────────────
	if dryRun {
		return map[string]interface{}{
			"provider":     "flux-etl",
			"agency":       agencyName,
			"agency_slug":  agency,
			"content_type": contentType,
			"stage":        stage,
			"use_case":     useCase,
			"dry_run":      true,
			"steps":        steps,
			"source":       source,
			"message":      "Dry run — no data was moved. Remove dry_run:true to execute.",
		}, nil
	}

	// ── Execute ───────────────────────────────────────────────────────────────
	// In a real deployment each step calls the Python ETL scripts
	// (ingestion.py, analytics.py, etl_to_postgres.py) via subprocess or HTTP.
	// The Go monadic process (master/master.go) is the single orchestration point;
	// it never exposes raw data externally — all data flows are internal.
	return map[string]interface{}{
		"provider":          "flux-etl",
		"agency":            agencyName,
		"agency_slug":       agency,
		"content_type":      contentType,
		"stage":             stage,
		"use_case":          useCase,
		"steps_executed":    steps,
		"source":            source,
		"status":            "completed",
		"records_processed": estimatedRecords(stage, contentType),
		"message": fmt.Sprintf(
			"Flux ETL stage %q completed for %s (%s / %s).",
			stage, agencyName, contentType, useCase,
		),
	}, nil
}

// stepsForStage returns the ordered list of pipeline steps for a given stage,
// content type, and use case. Use-case-specific steps are appended after the
// core ETL steps so the base pipeline is always consistent.
func stepsForStage(stage, contentType, useCase string) []string {
	// Core steps per stage
	var core []string
	switch stage {
	case "ingest":
		core = ingestSteps(contentType)
	case "transform":
		core = transformSteps(contentType)
	case "export":
		core = exportSteps()
	default: // "full"
		core = append(ingestSteps(contentType), transformSteps(contentType)...)
		core = append(core, exportSteps()...)
	}

	// Append use-case-specific post-processing steps
	core = append(core, useCaseSteps(useCase)...)
	return core
}

func ingestSteps(contentType string) []string {
	base := []string{"validate_source", "calculate_checksums"}
	switch contentType {
	case "images":
		return append(base, "load_images", "extract_image_metadata", "generate_thumbnails")
	case "documents":
		return append(base, "load_documents", "extract_text_from_pdf", "index_document_metadata")
	case "text":
		return append(base, "load_text_records", "tokenise_text", "detect_language")
	default: // "mixed"
		return append(base,
			"load_images", "load_documents", "load_text_records",
			"extract_image_metadata", "extract_text_from_pdf",
			"tokenise_text", "detect_language",
		)
	}
}

func transformSteps(contentType string) []string {
	base := []string{"compute_record_metrics", "compute_time_series"}
	switch contentType {
	case "images":
		return append(base, "run_image_classification", "compute_visual_embeddings")
	case "documents":
		return append(base, "run_document_classification", "compute_text_embeddings", "extract_named_entities")
	case "text":
		return append(base, "run_sentiment_analysis", "compute_text_embeddings", "extract_named_entities")
	default: // "mixed"
		return append(base,
			"run_image_classification", "run_document_classification",
			"compute_visual_embeddings", "compute_text_embeddings",
			"extract_named_entities",
		)
	}
}

func exportSteps() []string {
	return []string{
		"clear_destination",
		"transfer_records",
		"transfer_metrics",
		"transfer_embeddings",
		"transfer_time_series",
		"log_etl_run",
	}
}

// useCaseSteps returns additional post-export steps specific to the downstream use case.
func useCaseSteps(useCase string) []string {
	switch useCase {
	case "vr":
		return []string{"generate_3d_scene_manifest", "export_spatial_metadata"}
	case "ai-training":
		return []string{"split_train_val_test", "export_dataset_manifest", "validate_dataset_schema"}
	case "research":
		return []string{"export_structured_csv", "generate_data_dictionary", "attach_provenance_metadata"}
	case "education":
		return []string{"generate_lesson_plan_metadata", "export_accessible_formats"}
	case "preservation":
		return []string{"write_archival_manifest", "verify_long_term_checksums", "replicate_to_cold_storage"}
	case "accessibility":
		return []string{"generate_alt_text", "generate_captions", "export_screen_reader_metadata"}
	case "public-engagement":
		return []string{"publish_to_public_api", "generate_dashboard_summary"}
	case "policy":
		return []string{"generate_policy_brief_metadata", "export_structured_summary"}
	case "economic-development":
		return []string{"compute_economic_indicators", "export_trend_report"}
	case "national-security":
		return []string{"apply_classification_labels", "route_to_secure_enclave"}
	case "environmental":
		return []string{"compute_environmental_metrics", "export_conservation_report"}
	case "cultural":
		return []string{"link_cross_agency_records", "export_cultural_heritage_manifest"}
	case "historical":
		return []string{"build_timeline_index", "export_historical_record_manifest"}
	case "scientific":
		return []string{"validate_scientific_schema", "export_peer_review_package"}
	default:
		return nil
	}
}

// estimatedRecords returns a rough record count for documentation/demo purposes.
func estimatedRecords(stage, contentType string) int {
	base := map[string]int{
		"ingest": 500, "transform": 300, "export": 1200, "full": 2000,
	}
	multiplier := map[string]int{
		"images": 3, "documents": 2, "text": 1, "mixed": 4,
	}
	b := base[stage]
	if b == 0 {
		b = 2000
	}
	m := multiplier[contentType]
	if m == 0 {
		m = 4
	}
	return b * m
}
