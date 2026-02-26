package validation

import (
	"encoding/json"
	"fmt"
)

// SchemaRegistry holds all JSON schemas for validation
type SchemaRegistry struct {
	schemas map[string]interface{}
}

// NewSchemaRegistry creates a new schema registry
func NewSchemaRegistry() *SchemaRegistry {
	return &SchemaRegistry{
		schemas: make(map[string]interface{}),
	}
}

// RegisterSchema registers a JSON schema
func (sr *SchemaRegistry) RegisterSchema(name string, schema interface{}) {
	sr.schemas[name] = schema
}

// ValidatePayload validates a payload against the flux-payload schema
func (sr *SchemaRegistry) ValidatePayload(payload map[string]interface{}) error {
	// Required fields
	requiredFields := []string{"agency", "content_type", "use_case"}
	for _, field := range requiredFields {
		if _, exists := payload[field]; !exists {
			return fmt.Errorf("missing required field: %s", field)
		}
	}

	// Validate agency
	if agency, ok := payload["agency"].(string); !ok {
		return fmt.Errorf("agency must be a string")
	} else if !isValidAgency(agency) {
		return fmt.Errorf("invalid agency: %s (must be lowercase alphanumeric with hyphens)", agency)
	}

	// Validate content_type
	if contentType, ok := payload["content_type"].(string); !ok {
		return fmt.Errorf("content_type must be a string")
	} else if !isValidContentType(contentType) {
		return fmt.Errorf("invalid content_type: %s (must be one of: images, documents, text, mixed)", contentType)
	}

	// Validate use_case
	if useCase, ok := payload["use_case"].(string); !ok {
		return fmt.Errorf("use_case must be a string")
	} else if !isValidUseCase(useCase) {
		return fmt.Errorf("invalid use_case: %s", useCase)
	}

	// Optional: validate stage
	if stage, exists := payload["stage"]; exists {
		if stageStr, ok := stage.(string); !ok {
			return fmt.Errorf("stage must be a string")
		} else if !isValidStage(stageStr) {
			return fmt.Errorf("invalid stage: %s (must be one of: ingest, transform, export, full)", stageStr)
		}
	}

	return nil
}

func isValidAgency(agency string) bool {
	validAgencies := []string{
		"national-archives",
		"national-gallery-of-art",
		"library-of-congress",
		"national-park-service",
		"nasa",
		"noaa",
		"national-science-foundation",
		"national-endowment-for-the-arts",
		"national-endowment-for-the-humanities",
	}

	for _, valid := range validAgencies {
		if agency == valid {
			return true
		}
	}
	return false
}

func isValidContentType(t string) bool {
	validTypes := []string{"images", "documents", "text", "mixed"}
	for _, valid := range validTypes {
		if t == valid {
			return true
		}
	}
	return false
}

func isValidUseCase(useCase string) bool {
	validCases := []string{
		"vr",
		"ai-training",
		"research",
		"education",
		"preservation",
		"accessibility",
		"public-engagement",
		"policy",
		"economic-development",
		"national-security",
		"environmental",
		"cultural",
		"historical",
		"scientific",
	}

	for _, valid := range validCases {
		if useCase == valid {
			return true
		}
	}
	return false
}

func isValidStage(stage string) bool {
	validStages := []string{"ingest", "transform", "export", "full"}
	for _, valid := range validStages {
		if stage == valid {
			return true
		}
	}
	return false
}

// ValidateAgencyManifest validates an agency manifest
func ValidateAgencyManifest(manifest map[string]interface{}) error {
	requiredFields := []string{"slug", "name"}
	for _, field := range requiredFields {
		if _, exists := manifest[field]; !exists {
			return fmt.Errorf("manifest missing required field: %s", field)
		}
	}

	if slug, ok := manifest["slug"].(string); !ok {
		return fmt.Errorf("slug must be a string")
	} else if !isValidAgency(slug) {
		return fmt.Errorf("invalid agency slug: %s", slug)
	}

	if name, ok := manifest["name"].(string); !ok || name == "" {
		return fmt.Errorf("name must be a non-empty string")
	}

	return nil
}

// ValidationResult contains detailed validation error information
type ValidationResult struct {
	Valid  bool
	Errors []string
}

// ValidatePayloadStrict performs strict validation with detailed errors
func ValidatePayloadStrict(payload map[string]interface{}) ValidationResult {
	result := ValidationResult{Valid: true, Errors: []string{}}

	// Check required fields
	requiredFields := []string{"agency", "content_type", "use_case"}
	for _, field := range requiredFields {
		if _, exists := payload[field]; !exists {
			result.Valid = false
			result.Errors = append(result.Errors, fmt.Sprintf("missing required field: %s", field))
		}
	}

	// Validate agency
	if agency, ok := payload["agency"].(string); ok {
		if !isValidAgency(agency) {
			result.Valid = false
			result.Errors = append(result.Errors,
				fmt.Sprintf("invalid agency: %s (must match pattern: ^[a-z0-9-]+$)", agency))
		}
	} else if _, exists := payload["agency"]; exists {
		result.Valid = false
		result.Errors = append(result.Errors, "agency must be a string")
	}

	// Validate content_type
	if ct, ok := payload["content_type"].(string); ok {
		if !isValidContentType(ct) {
			result.Valid = false
			result.Errors = append(result.Errors,
				fmt.Sprintf("invalid content_type: %s (must be one of: images, documents, text, mixed)", ct))
		}
	} else if _, exists := payload["content_type"]; exists {
		result.Valid = false
		result.Errors = append(result.Errors, "content_type must be a string")
	}

	// Validate use_case
	if uc, ok := payload["use_case"].(string); ok {
		if !isValidUseCase(uc) {
			result.Valid = false
			result.Errors = append(result.Errors,
				fmt.Sprintf("invalid use_case: %s", uc))
		}
	} else if _, exists := payload["use_case"]; exists {
		result.Valid = false
		result.Errors = append(result.Errors, "use_case must be a string")
	}

	return result
}

// MarshalValidationResult converts validation result to JSON
func (vr ValidationResult) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]interface{}{
		"valid":  vr.Valid,
		"errors": vr.Errors,
	})
}
