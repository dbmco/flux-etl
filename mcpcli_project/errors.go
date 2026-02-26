package errors

import (
	"fmt"
	"time"
)

// ErrorClass categorizes errors for routing and retry logic
type ErrorClass string

const (
	ValidationError     ErrorClass = "VALIDATION_ERROR"
	TransientError      ErrorClass = "TRANSIENT_ERROR"
	TerminalError       ErrorClass = "TERMINAL_ERROR"
	DataIsolationError  ErrorClass = "DATA_ISOLATION_ERROR"
	CheckpointError     ErrorClass = "CHECKPOINT_ERROR"
	AuthenticationError ErrorClass = "AUTHENTICATION_ERROR"
	AuthorizationError  ErrorClass = "AUTHORIZATION_ERROR"
)

// FluxError is the canonical error type across Flux services
type FluxError struct {
	ErrorID       string                 `json:"error_id"`
	Timestamp     time.Time              `json:"timestamp"`
	Class         ErrorClass             `json:"class"`
	Message       string                 `json:"message"`
	Code          string                 `json:"code"`
	Context       map[string]interface{} `json:"context,omitempty"`
	TraceID       string                 `json:"trace_id,omitempty"`
	SpanID        string                 `json:"span_id,omitempty"`
	RequestID     string                 `json:"request_id,omitempty"`
	Retryable     bool                   `json:"retryable"`
	HTTPStatus    int                    `json:"http_status"`
	UnderlyingErr error                  `json:"-"` // For debugging only
}

// Error implements the error interface
func (e *FluxError) Error() string {
	return fmt.Sprintf("[%s] %s (%s): %s", e.Class, e.Code, e.ErrorID, e.Message)
}

// New creates a new FluxError
func New(class ErrorClass, code string, message string) *FluxError {
	httpStatus := 500
	retryable := false

	switch class {
	case ValidationError:
		httpStatus = 400
		retryable = false
	case TransientError:
		httpStatus = 503
		retryable = true
	case TerminalError:
		httpStatus = 500
		retryable = false
	case DataIsolationError:
		httpStatus = 403
		retryable = false
	case CheckpointError:
		httpStatus = 500
		retryable = true
	case AuthenticationError:
		httpStatus = 401
		retryable = false
	case AuthorizationError:
		httpStatus = 403
		retryable = false
	}

	return &FluxError{
		ErrorID:    generateUUID(),
		Timestamp:  time.Now().UTC(),
		Class:      class,
		Code:       code,
		Message:    message,
		Context:    map[string]interface{}{},
		Retryable:  retryable,
		HTTPStatus: httpStatus,
	}
}

// WithContext adds contextual information to the error
func (e *FluxError) WithContext(key string, value interface{}) *FluxError {
	e.Context[key] = value
	return e
}

// WithTraceID sets the trace ID for correlation
func (e *FluxError) WithTraceID(traceID string) *FluxError {
	e.TraceID = traceID
	return e
}

// WithSpanID sets the span ID for correlation
func (e *FluxError) WithSpanID(spanID string) *FluxError {
	e.SpanID = spanID
	return e
}

// WithRequestID sets the request ID for correlation
func (e *FluxError) WithRequestID(requestID string) *FluxError {
	e.RequestID = requestID
	return e
}

// WithUnderlyingError attaches the original error for debugging
func (e *FluxError) WithUnderlyingError(err error) *FluxError {
	e.UnderlyingErr = err
	return e
}

// Wrap creates a new FluxError from an underlying error
func Wrap(class ErrorClass, code string, message string, underlying error) *FluxError {
	err := New(class, code, message)
	err.UnderlyingErr = underlying
	return err
}

// convenience constructors

func ValidationFailed(code string, message string) *FluxError {
	return New(ValidationError, code, message)
}

func Transient(code string, message string) *FluxError {
	return New(TransientError, code, message)
}

func Terminal(code string, message string) *FluxError {
	return New(TerminalError, code, message)
}

func DataIsolationViolation(agency string, accessor string, resource string) *FluxError {
	err := New(DataIsolationError, "AGENCY_BOUNDARY_CROSSED", "Access denied: data isolation policy violated")
	err.WithContext("agency", agency)
	err.WithContext("accessor", accessor)
	err.WithContext("resource", resource)
	return err
}

func CheckpointFailed(code string, message string) *FluxError {
	return New(CheckpointError, code, message)
}

func Unauthorized(code string, message string) *FluxError {
	return New(AuthenticationError, code, message)
}

func Forbidden(code string, message string) *FluxError {
	return New(AuthorizationError, code, message)
}

// Helper: generate UUID for error tracking
func generateUUID() string {
	// In real implementation, use github.com/google/uuid
	// This is placeholder
	return fmt.Sprintf("err-%d", time.Now().UnixNano())
}
