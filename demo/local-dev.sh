#!/bin/bash

# Local development script for StafferFi
# Builds Docker image and runs container with docker compose

set -e

echo "🏗️  Building Docker image..."
# docker build -t stafferfi .

# Build and run all services
sudo docker compose up --build

# - Web UI:  http://localhost:3000  
# - API:     http://localhost:4000  
# - Lake:    http://localhost:8000  

echo "🚀 Starting container with docker compose..."
docker compose up

# Stop all services
# sudo docker compose down

echo "✅ Done!"
