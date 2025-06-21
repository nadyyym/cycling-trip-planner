#!/bin/bash

# Test script for Route Planner Schema Enhancement (Commit #1)
# This script tests that the new segments array is properly populated
# with segment details including id, name, and stravaUrl
# 
# Usage: ./examples/test-route-planner-schema.sh
#
# Prerequisites:
# 1. Server must be running (npm run dev)
# 2. User must be authenticated with Strava
# 3. Need valid Strava segment IDs

echo "🚀 Testing Route Planner Schema Enhancement (Commit #1)"
echo "====================================================="

# Check if server is running
SERVER_URL="http://localhost:3000"
if ! curl -s --fail "$SERVER_URL" > /dev/null 2>&1; then
    echo "❌ Server not running at $SERVER_URL"
    echo "   Please start the server with: npm run dev"
    exit 1
fi

echo "✅ Server is running"

# Test payload with well-known segments
# Using some popular cycling segments that should exist
PAYLOAD='{
  "segments": [
    {
      "segmentId": 229781,
      "forwardDirection": true
    },
    {
      "segmentId": 1073806,
      "forwardDirection": true
    }
  ],
  "maxDays": 4
}'

echo ""
echo "📤 Testing planTrip endpoint with schema validation..."
echo "Request payload:"
echo "$PAYLOAD" | jq '.' || echo "$PAYLOAD"

echo ""
echo "📥 Response:"

# Make the tRPC request
RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$PAYLOAD" \
    "$SERVER_URL/api/trpc/routePlanner.planTrip" 2>/dev/null)

echo "$RESPONSE" | jq '.' || {
    echo "❌ Request failed or invalid JSON response"
    echo "Raw response: $RESPONSE"
    exit 1
}

echo ""
echo "🔍 Schema Validation Results:"
echo "============================="

# Check if response has the new schema structure
if echo "$RESPONSE" | jq -e '.result.data.ok == true' > /dev/null 2>&1; then
    echo "✅ Route planning succeeded"
    
    # Check for new segments array
    if echo "$RESPONSE" | jq -e '.result.data.routes[0].segments' > /dev/null 2>&1; then
        echo "✅ New 'segments' array found in response"
        
        # Check segment structure
        FIRST_SEGMENT=$(echo "$RESPONSE" | jq -r '.result.data.routes[0].segments[0]')
        
        if echo "$FIRST_SEGMENT" | jq -e '.id' > /dev/null 2>&1; then
            SEGMENT_ID=$(echo "$FIRST_SEGMENT" | jq -r '.id')
            echo "✅ Segment ID found: $SEGMENT_ID"
        else
            echo "❌ Missing segment ID"
        fi
        
        if echo "$FIRST_SEGMENT" | jq -e '.name' > /dev/null 2>&1; then
            SEGMENT_NAME=$(echo "$FIRST_SEGMENT" | jq -r '.name')
            echo "✅ Segment name found: '$SEGMENT_NAME'"
        else
            echo "❌ Missing segment name"
        fi
        
        if echo "$FIRST_SEGMENT" | jq -e '.stravaUrl' > /dev/null 2>&1; then
            STRAVA_URL=$(echo "$FIRST_SEGMENT" | jq -r '.stravaUrl')
            echo "✅ Strava URL found: $STRAVA_URL"
            
            # Validate URL format
            if [[ "$STRAVA_URL" =~ ^https://www\.strava\.com/segments/[0-9]+$ ]]; then
                echo "✅ Strava URL format is correct"
            else
                echo "❌ Strava URL format is incorrect: $STRAVA_URL"
            fi
        else
            echo "❌ Missing Strava URL"
        fi
        
    else
        echo "❌ New 'segments' array not found in response"
    fi
    
    # Check for backwards compatibility
    if echo "$RESPONSE" | jq -e '.result.data.routes[0].segmentsVisited' > /dev/null 2>&1; then
        echo "✅ Backwards compatibility: 'segmentsVisited' array still present"
    else
        echo "❌ Backwards compatibility broken: 'segmentsVisited' array missing"
    fi
    
elif echo "$RESPONSE" | jq -e '.result.data.ok == false' > /dev/null 2>&1; then
    ERROR_TYPE=$(echo "$RESPONSE" | jq -r '.result.data.error')
    ERROR_DETAILS=$(echo "$RESPONSE" | jq -r '.result.data.details')
    echo "⚠️  Route planning failed (expected for testing):"
    echo "   Error: $ERROR_TYPE"
    echo "   Details: $ERROR_DETAILS"
    
    echo ""
    echo "This is expected if:"
    echo "1. User is not authenticated with Strava"
    echo "2. Invalid segment IDs were used"
    echo "3. Segments are too far apart or violate constraints"
else
    echo "❌ Unexpected response structure"
fi

echo ""
echo "✅ Schema test completed"
echo ""
echo "Expected new schema structure:"
echo "routes[].segments[] = {"
echo "  id: number,"
echo "  name: string,"
echo "  stravaUrl: string (https://www.strava.com/segments/{id})"
echo "}"
echo ""
echo "Backwards compatibility:"
echo "routes[].segmentsVisited[] = number[] (deprecated but present)" 