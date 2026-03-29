#!/bin/bash
# Stop all RideFlow services
echo "Stopping all services..."
docker compose down
# Kill any local Vite processes
pkill -f "vite.*5173" 2>/dev/null
pkill -f "vite.*5174" 2>/dev/null
pkill -f "vite.*5175" 2>/dev/null
pkill -f "vite.*5176" 2>/dev/null
echo "All services stopped."
