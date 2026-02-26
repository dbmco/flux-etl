package plugins

import "errors"

type KiloProvider struct{}

func (k *KiloProvider) Name() string { return "kilo" }

func (k *KiloProvider) Authenticate(token string) (Client, error) {
    if token != "kilo-demo-token" {
        return nil, errors.New("invalid token")
    }
    return &KiloClient{}, nil
}

type KiloClient struct{}

func (c *KiloClient) Call(payload map[string]interface{}) (map[string]interface{}, error) {
    return map[string]interface{}{
        "processed": true,
        "service": "kilo",
        "payload": payload,
    }, nil
}
