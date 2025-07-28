#!/bin/bash

# Start the backend server in the background
echo "Starting backend server..."
cd server && npm start &
BACKEND_PID=$!

# Wait a moment for the backend to start
sleep 2

# Start the frontend
echo "Starting frontend..."
cd .. && npm start &
FRONTEND_PID=$!

# Function to clean up processes on exit
cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit
}

# Set up trap to call cleanup function on script exit
trap cleanup EXIT

# Wait for user to press Ctrl+C
echo "Both servers are running. Press Ctrl+C to stop both."
wait