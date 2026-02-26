// Package cmd wires together all MCPCLI subcommands.
//
// # Available commands (plain language)
//
//	mcpcli master   — run a workflow (pick a provider, send data, get results)
//	mcpcli replay   — replay the event log from a saved checkpoint
//	mcpcli openapi  — print the OpenAPI/Swagger schema for this CLI
//
// Run `mcpcli --help` or `mcpcli <command> --help` for flag details.
package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"mcpcli/master"
	"mcpcli/plugins"
)

var rootCmd = &cobra.Command{
	Use:   "mcpcli",
	Short: "Monadic plugin CLI — Flux ETL integration",
	Long: `MCPCLI routes workflow tasks through provider plugins (flux-etl, kilo, mock).

Every run is checkpointed so it can be resumed if interrupted.
Use 'mcpcli master --help' to see all options.`,
}

// masterCmd runs the full pipeline: authenticate → select model → call provider.
var masterCmd = &cobra.Command{
	Use:   "master",
	Short: "Run master pipeline",
	Long: `Run the master pipeline against a chosen provider.

Examples:

  # Run the Flux ETL full pipeline
  mcpcli master --provider flux-etl --token flux-etl-demo-token \
                --payload '{"stage":"full"}'

  # Run only the ingest stage (dry run — no data moved)
  mcpcli master --provider flux-etl --token flux-etl-demo-token \
                --payload '{"stage":"ingest","dry_run":true}'

  # Resume a previously interrupted run
  mcpcli master --provider flux-etl --token flux-etl-demo-token \
                --payload '{"stage":"full"}' --resume 1234567890

  # Use weighted model routing (70% gpt-demo, 30% gpt-fast)
  mcpcli master --provider kilo --token kilo-demo-token \
                --payload '{"hello":"world"}' \
                --weights gpt-demo:0.7,gpt-fast:0.3`,
	Run: func(cmd *cobra.Command, args []string) {
		model, _ := cmd.Flags().GetString("model")
		providerName, _ := cmd.Flags().GetString("provider")
		token, _ := cmd.Flags().GetString("token")
		payloadStr, _ := cmd.Flags().GetString("payload")
		weightsStr, _ := cmd.Flags().GetString("weights")
		resumeRunID, _ := cmd.Flags().GetString("resume")

		var payload map[string]interface{}
		if err := json.Unmarshal([]byte(payloadStr), &payload); err != nil {
			fmt.Println("❌ invalid payload JSON:", err)
			fmt.Println("   Tip: wrap your JSON in single quotes, e.g. --payload '{\"stage\":\"full\"}'")
			os.Exit(1)
		}

		result := master.Run(model, providerName, token, payload, weightsStr, resumeRunID)

		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))

		if !result.Success {
			os.Exit(1)
		}
	},
}

// replayCmd prints the event log from a saved checkpoint without re-running the pipeline.
var replayCmd = &cobra.Command{
	Use:   "replay <run-id>",
	Short: "Replay event log from a saved checkpoint",
	Long: `Print the timestamped event log from a previous run's checkpoint file.

The checkpoint file is named "<run-id>.checkpoint.json" and is created
automatically by the master command after each pipeline step.

Example:
  mcpcli replay 1234567890`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		runID := args[0]
		if err := master.ReplayEvents(runID); err != nil {
			fmt.Println("❌", err)
			os.Exit(1)
		}
	},
}

// openapiCmd prints the OpenAPI schema so it can be imported into Swagger UI or Postman.
var openapiCmd = &cobra.Command{
	Use:   "openapi",
	Short: "Print OpenAPI schema",
	Long: `Print the OpenAPI 3.0 schema for this CLI to stdout.

Pipe the output into a file and open it in Swagger UI or Postman:
  mcpcli openapi > openapi.json`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println(plugins.OpenAPISchema)
	},
}

// Execute registers all subcommands and runs the CLI.
func Execute() {
	// master flags
	masterCmd.Flags().String("model", "gpt-demo", "AI model name")
	masterCmd.Flags().String("provider", "mock", "Provider plugin: mock | kilo | flux-etl")
	masterCmd.Flags().String("token", "", "Auth token for the chosen provider")
	masterCmd.Flags().String("payload", "{}", "JSON payload to process (wrap in single quotes)")
	masterCmd.Flags().String("weights", "", "Weighted model routing, e.g. gpt-demo:0.7,gpt-fast:0.3")
	masterCmd.Flags().String("resume", "", "Run ID of a checkpoint to resume (optional)")

	rootCmd.AddCommand(masterCmd)
	rootCmd.AddCommand(replayCmd)
	rootCmd.AddCommand(openapiCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
