#!/bin/bash

# Test script for route planner with geometry stitching
# This script tests the planTrip endpoint with multiple segments
# to verify geometry stitching and elevation retrieval works correctly

echo "Testing Route Planner with Geometry Stitching..."
echo "============================================="

# Base URL for the API
BASE_URL="http://localhost:3000"

# Sample request with multiple segments for geometry stitching
# Using some well-known cycling segments for testing
REQUEST_BODY='{
  "segments": [
    {
      "segmentId": 229781,
      "forwardDirection": true
    },
    {
      "segmentId": 1073806,
      "forwardDirection": true
    },
    {
      "segmentId": 2192146,
      "forwardDirection": false
    }
  ],
  "maxDays": 3,
  "tripStart": [-122.4194, 37.7749]
}'

echo "Request body:"
echo "$REQUEST_BODY" | jq .

echo ""
echo "Making request to planTrip endpoint..."
echo "URL: $BASE_URL/api/trpc/routePlanner.planTrip"

# Make the request
RESPONSE=$(curl -s -X POST \
  "$BASE_URL/api/trpc/routePlanner.planTrip" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

echo ""
echo "Response:"
echo "$RESPONSE" | jq .

# Check if the response contains geometry stitching information
if echo "$RESPONSE" | jq -e '.result.data.routes[0].geometry.coordinates | length > 2' > /dev/null 2>&1; then
  echo ""
  echo "✅ SUCCESS: Geometry stitching appears to be working!"
  echo "   - Route contains more than 2 coordinates (not just start/end)"
  
  # Display geometry information
  ROUTE_COUNT=$(echo "$RESPONSE" | jq -r '.result.data.routes | length')
  echo "   - Number of routes: $ROUTE_COUNT"
  
  for i in $(seq 0 $((ROUTE_COUNT - 1))); do
    COORD_COUNT=$(echo "$RESPONSE" | jq -r ".result.data.routes[$i].geometry.coordinates | length")
    DISTANCE=$(echo "$RESPONSE" | jq -r ".result.data.routes[$i].distanceKm")
    ELEVATION=$(echo "$RESPONSE" | jq -r ".result.data.routes[$i].elevationGainM")
    
    echo "   - Route $((i + 1)): $COORD_COUNT coordinates, ${DISTANCE}km, ${ELEVATION}m elevation"
  done
  
elif echo "$RESPONSE" | jq -e '.result.data.ok == false' > /dev/null 2>&1; then
  echo ""
  echo "❌ FAILED: Route planning failed"
  ERROR=$(echo "$RESPONSE" | jq -r '.result.data.error')
  DETAILS=$(echo "$RESPONSE" | jq -r '.result.data.details')
  echo "   - Error: $ERROR"
  echo "   - Details: $DETAILS"
  
else
  echo ""
  echo "⚠️  UNKNOWN: Could not determine if geometry stitching is working"
  echo "   - Response may not contain expected structure"
fi

echo ""
echo "Test completed." 