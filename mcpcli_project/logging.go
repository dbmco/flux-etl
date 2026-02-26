package main

import (
	"encoding/json"
	"fmt"
	"time"
)

// LogLevel represents the severity of a log entry
type LogLevel string

const (
	DEBUG LogLevel = "DEBUG"
	INFO  LogLevel = "INFO"
	WARN  LogLevel = "WARN"
	ERROR LogLevel = "ERROR"
)

// LogEntry represents a structured log line
type LogEntry struct {
	Timestamp     time.Time              `json:"timestamp"`
	Level         LogLevel               `json:"level"`
	Message       string                 `json:"message"`
	Service       string                 `json:"service"`
	TraceID       string                 `json:"trace_id,omitempty"`
	SpanID        string                 `json:"span_id,omitempty"`
	CorrelationID string                 `json:"correlation_id,omitempty"`
	Fields        map[string]interface{} `json:"fields"`
}

// Logger is the structured logging interface for Flux
type Logger struct {
	service string
	traceID string
}

// NewLogger creates a new logger for a service
func NewLogger(service string) *Logger {
	return &Logger{
		service: service,
		traceID: generateTraceID(),
	}
}

// WithTraceID sets the trace ID for correlation
func (l *Logger) WithTraceID(traceID string) *Logger {
	l.traceID = traceID
	return l
}

// log writes a structured log entry
func (l *Logger) log(level LogLevel, message string, fields map[string]interface{}) {
	entry := LogEntry{
		Timestamp: time.Now().UTC(),
		Level:     level,
		Message:   message,
		Service:   l.service,
		TraceID:   l.traceID,
		Fields:    fields,
	}

	data, _ := json.Marshal(entry)
	fmt.Println(string(data))
}

// Debug logs a debug message
func (l *Logger) Debug(message string, fields map[string]interface{}) {
	if fields == nil {
		fields = map[string]interface{}{}
	}
	l.log(DEBUG, message, fields)
}

// Info logs an info message
func (l *Logger) Info(message string, fields map[string]interface{}) {
	if fields == nil {
		fields = map[string]interface{}{}
	}
	l.log(INFO, message, fields)
}

// Warn logs a warning message
func (l *Logger) Warn(message string, fields map[string]interface{}) {
	if fields == nil {
		fields = map[string]interface{}{}
	}
	l.log(WARN, message, fields)
}

// Error logs an error message
func (l *Logger) Error(message string, fields map[string]interface{}) {
	if fields == nil {
		fields = map[string]interface{}{}
	}
	l.log(ERROR, message, fields)
}

// LogFluxError logs a FluxError with full context
func (l *Logger) LogFluxError(err interface{}) {
	if fluxErr, ok := err.(*FluxError); ok {
		fields := map[string]interface{}{
			"error_id":    fluxErr.ErrorID,
			"error_class": fluxErr.Class,
			"error_code":  fluxErr.Code,
			"http_status": fluxErr.HTTPStatus,
			"retryable":   fluxErr.Retryable,
			"context":     fluxErr.Context,
		}
		if fluxErr.SpanID != "" {
			fields["span_id"] = fluxErr.SpanID
		}
		l.log(ERROR, fluxErr.Message, fields)
	} else if regErr, ok := err.(error); ok {
		l.log(ERROR, regErr.Error(), map[string]interface{}{
			"error_type": fmt.Sprintf("%T", err),
		})
	}
}

func generateTraceID() string {
	return fmt.Sprintf("trace-%d", time.Now().UnixNano())
}
