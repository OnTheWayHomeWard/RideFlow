#!/bin/bash
# RideFlow ��� Start entire ecosystem
# Usage: ./start.sh [dev|docker]

MODE=${1:-dev}

echo "========================================="
echo "  RideFlow Transport System"
echo "========================================="

if [ "$MODE" = "docker" ]; then
  echo "Starting with Docker Compose (all services)..."
  echo ""
  docker compose up --build -d

  echo ""
  echo "Waiting for database..."
  sleep 10

  echo "Running migrations..."
  docker compose exec backend alembic upgrade head

  echo "Seeding default data..."
  docker compose exec backend python -m app.seed

  echo ""
  echo "========================================="
  echo "  All services running!"
  echo "========================================="
  echo ""
  echo "  Client:   http://localhost:5173"
  echo "  Driver:   http://localhost:5174"
  echo "  Admin:    http://localhost:5175"
  echo "  Cashier:  http://localhost:5176"
  echo "  API:      http://localhost:8000"
  echo "  API Docs: http://localhost:8000/docs"
  echo "  Database: localhost:5432"
  echo ""
  echo "  Admin login: admin@rideflow.com / changeme"
  echo ""
  echo "  Logs: docker compose logs -f"
  echo "  Stop: docker compose down"
  echo "========================================="

elif [ "$MODE" = "dev" ]; then
  echo "Starting in development mode..."
  echo ""

  # Start backend (Docker: db + backend)
  echo "[1/3] Starting database + backend..."
  docker compose up -d db backend
  sleep 8

  echo "[2/3] Running migrations..."
  docker compose exec backend alembic upgrade head 2>/dev/null
  docker compose exec backend python -m app.seed 2>/dev/null

  echo "[3/3] Starting frontends (local Vite)..."
  echo ""

  # Start all frontends in background
  cd frontend/client && npx vite --host 0.0.0.0 --port 5173 &
  cd frontend/driver && npx vite --host 0.0.0.0 --port 5174 &
  cd frontend/admin && npx vite --host 0.0.0.0 --port 5175 &
  cd frontend/cashier && npx vite --host 0.0.0.0 --port 5176 &

  sleep 5

  echo ""
  echo "========================================="
  echo "  All services running (dev mode)!"
  echo "========================================="
  echo ""
  echo "  Client:   http://localhost:5173"
  echo "  Driver:   http://localhost:5174"
  echo "  Admin:    http://localhost:5175"
  echo "  Cashier:  http://localhost:5176"
  echo "  API:      http://localhost:8000"
  echo "  API Docs: http://localhost:8000/docs"
  echo ""
  echo "  Admin login: admin@rideflow.com / changeme"
  echo ""
  echo "  Press Ctrl+C to stop all services"
  echo "========================================="

  wait
fi
