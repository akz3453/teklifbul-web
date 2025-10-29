#!/bin/bash

# Test Runner Script for Teklifbul
# Starts Firebase emulators and runs tests

set -e

echo "🚀 Starting Teklifbul Test Suite"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start Firebase emulators in background
echo "🔥 Starting Firebase emulators..."
firebase emulators:start --only firestore,auth &
EMULATOR_PID=$!

# Wait for emulators to start
echo "⏳ Waiting for emulators to start..."
sleep 10

# Check if emulators are running
if ! curl -s http://localhost:8080 > /dev/null; then
    echo "❌ Firestore emulator failed to start"
    kill $EMULATOR_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Emulators started successfully"

# Run tests
echo "🧪 Running tests..."
npm test

# Capture test exit code
TEST_EXIT_CODE=$?

# Stop emulators
echo "🛑 Stopping emulators..."
kill $EMULATOR_PID 2>/dev/null || true

# Wait for emulators to stop
sleep 2

# Exit with test result
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed!"
fi

exit $TEST_EXIT_CODE
