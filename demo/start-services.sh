#!/bin/bash

# Start all StafferFi services

echo "🚀 Starting StafferFi Services..."
echo ""

# Start PostgreSQL
echo "1. Starting PostgreSQL..."
docker-compose up -d postgres
sleep 3

# Wait for PostgreSQL to be healthy
echo "   Waiting for PostgreSQL to be healthy..."
until docker-compose ps | grep postgres | grep -q "healthy"; do
    sleep 1
done
echo "   ✅ PostgreSQL is healthy"
echo ""

# Load data into PostgreSQL
echo "2. Loading data into PostgreSQL..."
cd apps/lake
python3 etl_to_postgres.py
cd ../..
echo ""

# Start API server
echo "3. Starting API server on port 4000..."
cd apps/api
DATABASE_URL=postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics node dist/index.js > /tmp/api.log 2>&1 &
API_PID=$!
echo "   API PID: $API_PID"
cd ../..
sleep 2
echo ""

# Start Web frontend
echo "4. Starting Web frontend on port 3000..."
cd apps/web
pnpm dev > /tmp/web.log 2>&1 &
WEB_PID=$!
echo "   Web PID: $WEB_PID"
cd ../..
sleep 3
echo ""

# Test services
echo "5. Testing services..."
echo ""

echo "   Testing API health..."
curl -s http://localhost:4000/health | jq '.'
echo ""

echo "   Testing API stats..."
curl -s http://localhost:4000/api/stats | jq '.'
echo ""

echo "=================================="
echo "✅ All services started!"
echo "=================================="
echo ""
echo "API:  http://localhost:4000"
echo "Web:  http://localhost:3000"
echo ""
echo "Logs:"
echo "  API: tail -f /tmp/api.log"
echo "  Web: tail -f /tmp/web.log"
echo ""
echo "To stop services:"
echo "  kill $API_PID $WEB_PID"
echo "  docker-compose down"
