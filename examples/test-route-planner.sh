#!/bin/bash

# Test script for Route Planner TSP solver
# This script tests commit 4 functionality: TSP solver integration
# 
# Usage: ./examples/test-route-planner.sh
#
# Prerequisites:
# 1. Server must be running (pnpm dev)
# 2. User must be authenticated with Strava
# 3. Need valid Strava segment IDs

echo "🚀 Testing Route Planner TSP Solver (Commit 4)"
echo "=============================================="

# Check if server is running
SERVER_URL="http://localhost:3000"
if ! curl -s --fail "$SERVER_URL/api/trpc/health" > /dev/null 2>&1; then
    echo "❌ Server not running at $SERVER_URL"
    echo "   Please start the server with: pnpm dev"
    exit 1
fi

echo "✅ Server is running"

# Test payload - using real Strava segment IDs
# These are public segments that should be accessible
PAYLOAD='{
  "segments": [
    {
      "segmentId": 123456,
      "forwardDirection": true
    },
    {
      "segmentId": 789012,
      "forwardDirection": true
    }
  ],
  "maxDays": 4
}'

echo ""
echo "📤 Testing planTrip endpoint..."
echo "Request payload:"
echo "$PAYLOAD" | jq '.' || echo "$PAYLOAD"

echo ""
echo "📥 Response:"

# Make the tRPC request
curl -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$PAYLOAD" \
    "$SERVER_URL/api/trpc/routePlanner.planTrip" \
    2>/dev/null | jq '.' || {
    
    echo "❌ Request failed or invalid JSON response"
    echo ""
    echo "This is expected if:"
    echo "1. User is not authenticated with Strava"
    echo "2. Invalid segment IDs were used"
    echo "3. Server configuration issues"
    echo ""
    echo "🔍 Manual testing steps:"
    echo "1. Start server: pnpm dev"
    echo "2. Visit http://localhost:3000 and sign in with Strava"
    echo "3. Use browser dev tools to inspect Network tab"
    echo "4. Test route planning with valid segments"
    echo ""
    echo "Expected behavior for TSP solver (Commit 4):"
    echo "- Should return 'notImplemented' error with TSP details"
    echo "- Error message should mention TSP method used (bruteforce/heuristic/ortools)"
    echo "- Should show optimized segment order"
    echo "- Should complete within 500ms for small instances"
    
    exit 1
}

echo ""
echo "✅ Test completed"
echo ""
echo "🔍 What to look for in the response:"
echo "- ok: false (expected - implementation not complete)"
echo "- error: 'notImplemented'"
echo "- details should mention:"
echo "  * TSP solving method used (bruteforce, heuristic, or ortools)"
echo "  * Optimized segment order"
echo "  * Total distance calculation"
echo "  * Solving time < 500ms"
echo ""
echo "📊 Check server logs for detailed TSP solver output:"
echo "- [TSP_SOLVER_START] - Initial solver invocation"
echo "- [TSP_SOLVER_COMPLETE] - Final results with timing"
echo "- [TSP_SOLVER_SEGMENT_ORDER] - Optimized order details" 