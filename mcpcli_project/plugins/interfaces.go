// Package plugins defines the provider plugin system for MCPCLI.
//
// # What this does (plain language)
//
// A "provider" is a service that MCPCLI can send work to.
// Think of providers like apps on your phone — you pick one, log in,
// and then send it a task.
//
// Currently registered providers:
//
//	mock      — echoes your payload back; great for testing
//	kilo      — routes to the Kilo AI service
//	flux-etl  — runs the Flux ETL data pipeline (ingest → transform → export)
//
// To add a new provider, implement the TokenProvider and Client interfaces
// below, then add an entry to the Providers map.
package plugins

// Client is the interface every provider must satisfy.
// Call() receives your JSON payload and returns a result map or an error.
type Client interface {
	Call(payload map[string]interface{}) (map[string]interface{}, error)
}

// TokenProvider handles authentication and returns a ready-to-use Client.
// Name() must match the string used in the --provider CLI flag.
type TokenProvider interface {
	Name() string
	Authenticate(token string) (Client, error)
}

// Providers is the registry of all available provider plugins.
// Add new providers here to make them available via --provider <name>.
var Providers = map[string]TokenProvider{
	"mock":     &MockProvider{},
	"kilo":     &KiloProvider{},
	"flux-etl": &FluxProvider{},
}

// OpenAPISchema is the machine-readable API description for this CLI.
// Run `mcpcli openapi` to print it, or pipe it into a Swagger viewer.
const OpenAPISchema = `{
  "openapi": "3.0.0",
  "info": {
    "title": "MCPCLI — Flux ETL Integration",
    "version": "2.0.0",
    "description": "Monadic plugin CLI with Flux ETL, Kilo AI, and mock providers. Supports resumable workflows, event logging, and weighted model routing."
  },
  "paths": {
    "/master": {
      "post": {
        "summary": "Run master pipeline",
        "description": "Authenticate with a provider, select a model, and process a JSON payload. Saves a checkpoint after each step so the run can be resumed if interrupted.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "model":    {"type": "string", "example": "gpt-demo", "description": "AI model name"},
                  "provider": {"type": "string", "enum": ["mock","kilo","flux-etl"], "description": "Provider plugin to use"},
                  "token":    {"type": "string", "description": "Auth token for the chosen provider"},
                  "payload":  {"type": "object", "description": "Arbitrary JSON data to process"},
                  "weights":  {"type": "string", "example": "gpt-demo:0.7,gpt-fast:0.3", "description": "Weighted model routing (optional)"},
                  "resume":   {"type": "string", "description": "Run ID of a checkpoint to resume (optional)"}
                },
                "required": ["provider","token","payload"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Pipeline result with event log",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {"type": "boolean"},
                    "output":  {"type": "object"},
                    "events":  {"type": "array", "items": {"type": "object"}},
                    "resumed": {"type": "boolean"}
                  }
                }
              }
            }
          }
        }
      }
    },
    "/flux-etl/stages": {
      "get": {
        "summary": "List Flux ETL pipeline stages",
        "description": "Returns the available ETL stages: ingest, transform, export, full.",
        "responses": {
          "200": {
            "description": "Stage list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "stages": {
                      "type": "array",
                      "items": {"type": "string"},
                      "example": ["ingest","transform","export","full"]
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`
