package plugins

import "errors"

type MockProvider struct{}

func (m *MockProvider) Name() string { return "mock" }

func (m *MockProvider) Authenticate(token string) (Client, error) {
    if token == "" {
        return nil, errors.New("missing token")
    }
    return &MockClient{}, nil
}

type MockClient struct{}

func (c *MockClient) Call(payload map[string]interface{}) (map[string]interface{}, error) {
    return map[string]interface{}{
        "echo": payload,
        "provider": "mock",
    }, nil
}
