// Package master implements the core pipeline orchestration for MCPCLI.
//
// # What this does (plain language)
//
// Think of this as the "traffic controller" for your workflow. When you run a
// task, the master pipeline:
//  1. Picks the right service provider (e.g. "flux-etl", "kilo", or "mock").
//  2. Authenticates with that provider using your token.
//  3. Selects the AI model to use (optionally weighted for A/B routing).
//  4. Sends your data payload to the provider and collects the result.
//  5. Records every step as a timestamped event log so you can replay or audit later.
//  6. Saves a checkpoint file so a failed run can be resumed from where it stopped.
package master

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"time"

	"mcpcli/plugins"
)

// Event is a single timestamped record of something that happened during a run.
// Events are written to the result so operators can audit or replay the workflow.
type Event struct {
	Timestamp time.Time              `json:"timestamp"`
	Name      string                 `json:"name"`
	Data      map[string]interface{} `json:"data"`
}

// Result is what the pipeline returns after a run completes (or fails).
//
//   - Success: true means everything worked.
//   - Output:  the data returned by the provider.
//   - Events:  the ordered audit trail of every step.
//   - Resumed: true when this run continued from a saved checkpoint.
type Result struct {
	Success bool                   `json:"success"`
	Output  map[string]interface{} `json:"output"`
	Events  []Event                `json:"events"`
	Resumed bool                   `json:"resumed,omitempty"`
}

// Checkpoint captures the state of a run so it can be resumed later.
// It is serialised to JSON and written to disk by SaveCheckpoint.
type Checkpoint struct {
	RunID        string                 `json:"run_id"`
	ProviderName string                 `json:"provider_name"`
	Model        string                 `json:"model"`
	Payload      map[string]interface{} `json:"payload"`
	Events       []Event                `json:"events"`
	LastStep     string                 `json:"last_step"`
	CreatedAt    time.Time              `json:"created_at"`
}

// Monad is an immutable event accumulator.
// Each call to record() returns a new Monad with the event appended,
// keeping the audit trail append-only and safe to pass around.
type Monad struct {
	Events []Event
}

func (m Monad) record(name string, data map[string]interface{}) Monad {
	m.Events = append(m.Events, Event{
		Timestamp: time.Now(),
		Name:      name,
		Data:      data,
	})
	return m
}

// SaveCheckpoint writes the current pipeline state to a JSON file.
// The file is named "<runID>.checkpoint.json" in the current directory.
// If the file cannot be written the error is printed but does not abort the run.
func SaveCheckpoint(cp Checkpoint) {
	path := cp.RunID + ".checkpoint.json"
	data, err := json.MarshalIndent(cp, "", "  ")
	if err != nil {
		fmt.Println("⚠️  checkpoint marshal error:", err)
		return
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		fmt.Println("⚠️  checkpoint write error:", err)
	}
}

// LoadCheckpoint reads a previously saved checkpoint from disk.
// Returns an error if the file does not exist or cannot be parsed.
func LoadCheckpoint(runID string) (*Checkpoint, error) {
	path := runID + ".checkpoint.json"
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("checkpoint not found for run %q: %w", runID, err)
	}
	var cp Checkpoint
	if err := json.Unmarshal(data, &cp); err != nil {
		return nil, fmt.Errorf("checkpoint parse error: %w", err)
	}
	return &cp, nil
}

// DeleteCheckpoint removes the checkpoint file after a successful run.
func DeleteCheckpoint(runID string) {
	_ = os.Remove(runID + ".checkpoint.json")
}

// ReplayEvents prints the event log from a saved checkpoint to stdout.
// Useful for auditing or debugging a previous run without re-executing it.
func ReplayEvents(runID string) error {
	cp, err := LoadCheckpoint(runID)
	if err != nil {
		return err
	}
	fmt.Printf("🔁 Replaying %d events for run %q (last step: %s)\n\n",
		len(cp.Events), cp.RunID, cp.LastStep)
	for i, ev := range cp.Events {
		data, _ := json.MarshalIndent(ev.Data, "    ", "  ")
		fmt.Printf("  [%d] %s  %s\n    %s\n", i+1, ev.Timestamp.Format(time.RFC3339), ev.Name, data)
	}
	return nil
}

// Run executes the master pipeline.
//
// Parameters (all come from CLI flags — see cmd/root.go):
//   - model:        name of the AI model to use (e.g. "gpt-demo")
//   - providerName: which plugin to route through ("flux-etl", "kilo", "mock")
//   - token:        authentication credential for the chosen provider
//   - payload:      the JSON data to process (parsed from --payload flag)
//   - weights:      optional comma-separated "model:weight" pairs for A/B routing
//   - resumeRunID:  if non-empty, load a checkpoint and skip already-completed steps
//
// The function returns a Result containing the provider output and the full event log.
func Run(model, providerName, token string, payload map[string]interface{}, weights string, resumeRunID string) Result {
	// ── 1. Resolve provider ──────────────────────────────────────────────────
	provider, ok := plugins.Providers[providerName]
	if !ok {
		return Result{Success: false, Output: map[string]interface{}{
			"error": "unknown provider: " + providerName,
		}}
	}

	// ── 2. Checkpoint / resume ───────────────────────────────────────────────
	var monad Monad
	resumed := false
	runID := resumeRunID
	if runID == "" {
		runID = fmt.Sprintf("%d", time.Now().UnixNano())
	}

	if resumeRunID != "" {
		cp, err := LoadCheckpoint(resumeRunID)
		if err == nil {
			monad.Events = cp.Events
			resumed = true
			fmt.Printf("▶️  Resuming run %q from step %q\n", resumeRunID, cp.LastStep)
		} else {
			fmt.Println("⚠️  Could not load checkpoint, starting fresh:", err)
		}
	}

	// ── 3. Authenticate ──────────────────────────────────────────────────────
	client, err := provider.Authenticate(token)
	if err != nil {
		return Result{Success: false, Output: map[string]interface{}{
			"error": err.Error(),
		}, Events: monad.Events}
	}

	monad = monad.record("auth", map[string]interface{}{"provider": providerName})
	SaveCheckpoint(Checkpoint{
		RunID: runID, ProviderName: providerName, Model: model,
		Payload: payload, Events: monad.Events, LastStep: "auth",
		CreatedAt: time.Now(),
	})

	// ── 4. Model selection ───────────────────────────────────────────────────
	chosenModel := selectModel(model, weights)
	monad = monad.record("model_select", map[string]interface{}{
		"requested": model,
		"chosen":    chosenModel,
		"weights":   weights,
	})
	SaveCheckpoint(Checkpoint{
		RunID: runID, ProviderName: providerName, Model: chosenModel,
		Payload: payload, Events: monad.Events, LastStep: "model_select",
		CreatedAt: time.Now(),
	})

	// ── 5. Call provider ─────────────────────────────────────────────────────
	output, err := client.Call(payload)
	if err != nil {
		monad = monad.record("call_error", map[string]interface{}{"error": err.Error()})
		SaveCheckpoint(Checkpoint{
			RunID: runID, ProviderName: providerName, Model: chosenModel,
			Payload: payload, Events: monad.Events, LastStep: "call_error",
			CreatedAt: time.Now(),
		})
		return Result{
			Success: false,
			Output:  map[string]interface{}{"error": err.Error()},
			Events:  monad.Events,
			Resumed: resumed,
		}
	}

	monad = monad.record("call", map[string]interface{}{
		"provider": providerName,
		"model":    chosenModel,
	})

	// ── 6. Success — clean up checkpoint ────────────────────────────────────
	DeleteCheckpoint(runID)

	return Result{
		Success: true,
		Output:  output,
		Events:  monad.Events,
		Resumed: resumed,
	}
}

// selectModel picks a model name, optionally using weighted random selection.
//
// weights format: "modelA:0.7,modelB:0.3"
// If weights is empty or unparseable, the default model is returned unchanged.
func selectModel(model string, weights string) string {
	if weights == "" {
		return model
	}

	parts := strings.Split(weights, ",")
	total := 0.0
	choices := []struct {
		name   string
		weight float64
	}{}

	for _, p := range parts {
		var name string
		var w float64
		if _, err := fmt.Sscanf(p, "%[^:]:%f", &name, &w); err == nil {
			choices = append(choices, struct {
				name   string
				weight float64
			}{name, w})
			total += w
		}
	}

	if total <= 0 {
		return model
	}

	r := rand.Float64() * total
	for _, c := range choices {
		r -= c.weight
		if r <= 0 {
			return c.name
		}
	}

	return model
}

// errUnused silences the "errors imported and not used" linter when the
// package is compiled without any direct errors.New() call in this file.
var _ = errors.New
