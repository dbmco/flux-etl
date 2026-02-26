build:
	go build -o mcpcli

test:
	go test ./...

demo:
	./mcpcli master \
		--model gpt-demo \
		--provider mock \
		--token any \
		--payload '{"hello":"world"}'

openapi:
	./mcpcli openapi
