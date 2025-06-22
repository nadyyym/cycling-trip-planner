#!/bin/bash

# Test script to verify 10-segment selection limit
# This script tests the segment store functionality

echo "🧪 Testing 10-segment selection limit..."

# Start the development server in the background if not already running
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "Starting development server..."
    npm run dev &
    DEV_PID=$!
    
    # Wait for server to start
    echo "Waiting for server to start..."
    sleep 10
    
    # Check if server is ready
    for i in {1..30}; do
        if curl -s http://localhost:3000 > /dev/null; then
            echo "✅ Development server is ready"
            break
        fi
        sleep 1
    done
else
    echo "✅ Development server is already running"
fi

echo ""
echo "📝 Test Instructions:"
echo "1. Navigate to http://localhost:3000/explore"
echo "2. Search for an area with many cycling segments (e.g., London, Amsterdam, San Francisco)"
echo "3. Try to select more than 10 segments by clicking on segment cards or checkboxes"
echo "4. Verify that:"
echo "   - You can only select up to 10 segments"
echo "   - A toast notification appears when trying to select the 11th segment"
echo "   - The UI shows 'X of 10 segments selected'"
echo "   - When 10 segments are selected, you see '⚠️ Maximum segments selected'"
echo "   - The Plan Trip button shows 'Plan trip (X/10)'"
echo ""
echo "🎯 Expected behavior:"
echo "- Selection should be blocked after 10 segments"
echo "- Toast should show: '⚠️ Selection Limit Reached'"
echo "- Console should log: '[SEGMENT_LIMIT_REACHED]'"
echo "- UI should update to show limit warnings"
echo ""

# Clean up function
cleanup() {
    if [ ! -z "$DEV_PID" ]; then
        echo "Stopping development server..."
        kill $DEV_PID
    fi
}

# Set up cleanup on script exit
trap cleanup EXIT

echo "Press Ctrl+C when done testing"
wait 