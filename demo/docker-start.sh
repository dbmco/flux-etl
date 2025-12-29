#!/bin/bash

set -e

echo "🚀 Starting StafferFi with Docker Compose"
echo "=========================================="
echo ""

# Set Gitpod workspace URL for client-side API calls
if [ -n "$GITPOD_WORKSPACE_URL" ]; then
    # Extract the workspace ID and construct the API URL
    WORKSPACE_ID=$(echo $GITPOD_WORKSPACE_URL | sed 's|https://||' | sed 's|\.gitpod\.dev||')
    export NEXT_PUBLIC_API_URL="https://4000-${WORKSPACE_ID}.gitpod.dev"
    echo "📍 Gitpod detected"
    echo "   API URL: $NEXT_PUBLIC_API_URL"
else
    export NEXT_PUBLIC_API_URL="http://localhost:4000"
    echo "📍 Local development"
    echo "   API URL: $NEXT_PUBLIC_API_URL"
fi
echo ""

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose down
echo ""

# Build images
echo "🔨 Building Docker images..."
docker-compose build
echo ""

# Start services
echo "🚀 Starting services..."
docker-compose up -d
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check service status
echo ""
echo "📊 Service Status:"
docker-compose ps
echo ""

# Test API
echo "🧪 Testing API..."
if curl -s http://localhost:4000/health > /dev/null 2>&1; then
    echo "   ✅ API is responding"
    curl -s http://localhost:4000/api/stats | jq '.'
else
    echo "   ❌ API is not responding yet (may still be starting)"
fi
echo ""

# Show URLs
echo "=========================================="
echo "✅ Services Started!"
echo "=========================================="
echo ""
if [ -n "$GITPOD_WORKSPACE_URL" ]; then
    echo "🌐 Access your application:"
    echo "   Web:  https://3000-${WORKSPACE_ID}.gitpod.dev"
    echo "   API:  https://4000-${WORKSPACE_ID}.gitpod.dev"
else
    echo "🌐 Access your application:"
    echo "   Web:  http://localhost:3000"
    echo "   API:  http://localhost:4000"
fi
echo ""
echo "📋 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose down"
echo ""
