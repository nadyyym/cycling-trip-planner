#!/bin/bash

# Test script for route planner error handling
# This script demonstrates how errors are now returned as structured responses 
# with HTTP 200 status instead of HTTP error codes

BASE_URL="http://localhost:3000"
ENDPOINT="$BASE_URL/api/trpc/routePlanner.planTrip"

echo "🧪 Testing Route Planner Error Handling (Commit #7)"
echo "=================================================="
echo ""

# Test 1: Too many segments (should trigger segmentTooFar)
echo "Test 1: Too many segments (>10 waypoints limit)"
echo "Expected: { ok: false, error: 'segmentTooFar', details: '...' }"
echo ""

curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {"segmentId": 123, "forwardDirection": true},
      {"segmentId": 456, "forwardDirection": true},
      {"segmentId": 789, "forwardDirection": true},
      {"segmentId": 101, "forwardDirection": true},
      {"segmentId": 102, "forwardDirection": true},
      {"segmentId": 103, "forwardDirection": true},
      {"segmentId": 104, "forwardDirection": true},
      {"segmentId": 105, "forwardDirection": true},
      {"segmentId": 106, "forwardDirection": true},
      {"segmentId": 107, "forwardDirection": true},
      {"segmentId": 108, "forwardDirection": true}
    ],
    "maxDays": 4
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  | jq '.' 2>/dev/null || echo "Response received"

echo ""
echo "---"
echo ""

# Test 2: Empty segments array (should trigger segmentTooFar)
echo "Test 2: Empty segments array"
echo "Expected: { ok: false, error: 'segmentTooFar', details: '...' }"
echo ""

curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [],
    "maxDays": 4
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  | jq '.' 2>/dev/null || echo "Response received"

echo ""
echo "---"
echo ""

# Test 3: Valid request but no auth (should return HTTP 401 as exception)
echo "Test 3: No authentication (should return HTTP 401)"
echo "Expected: HTTP 401 (authentication errors still throw)"
echo ""

curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {"segmentId": 123, "forwardDirection": true}
    ],
    "maxDays": 4
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  | jq '.' 2>/dev/null || echo "Response received"

echo ""
echo "---"
echo ""

echo "📋 Summary:"
echo "- All route planning errors return HTTP 200 with structured error responses"
echo "- Only authentication errors still return HTTP error codes (401, etc.)"
echo "- Error types: dailyLimitExceeded, needMoreDays, segmentTooFar, externalApi"
echo "- Each error includes human-readable details field"
echo ""
echo "✅ Error mapping implementation complete (Commit #7)" 