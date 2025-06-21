#!/bin/bash

# Test script for adding segments to favourites
# Tests the favourite.addMany tRPC procedure

set -e

echo "🚲 Testing Favourites - Add Segments"
echo "=================================="

# Configuration
BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api/trpc/favourite.addMany"

# Test data - sample cycling segments
TEST_SEGMENTS='[
  {
    "id": "123456",
    "name": "Test Climb 1",
    "distance": 2500,
    "averageGrade": 8.5,
    "latStart": 41.9794,
    "lonStart": 2.8214,
    "latEnd": 41.9850,
    "lonEnd": 2.8300,
    "elevationGain": 200,
    "komTime": "5:30",
    "climbCategory": "3"
  },
  {
    "id": "789012",
    "name": "Test Sprint",
    "distance": 800,
    "averageGrade": 2.1,
    "latStart": 41.9850,
    "lonStart": 2.8300,
    "latEnd": 41.9870,
    "lonEnd": 2.8350,
    "elevationGain": 15
  }
]'

echo "📍 Testing with sample segments:"
echo "$TEST_SEGMENTS" | jq '.'

echo ""
echo "🔗 Making request to: $API_URL"

# Make the request
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"segments\": $TEST_SEGMENTS
  }")

echo ""
echo "📥 Response:"
echo "$RESPONSE" | jq '.'

# Check if response contains expected fields
if echo "$RESPONSE" | jq -e '.result.data' > /dev/null 2>&1; then
  ADDED=$(echo "$RESPONSE" | jq -r '.result.data.added // 0')
  SKIPPED=$(echo "$RESPONSE" | jq -r '.result.data.skipped // 0')
  TOTAL=$(echo "$RESPONSE" | jq -r '.result.data.total // 0')
  
  echo ""
  echo "✅ Success!"
  echo "   Added: $ADDED"
  echo "   Skipped: $SKIPPED" 
  echo "   Total: $TOTAL"
else
  echo ""
  echo "❌ Error: Unexpected response format"
  echo "   Expected: { result: { data: { added, skipped, total } } }"
  exit 1
fi

echo ""
echo "🎯 Test completed successfully!"
echo "   You can now check /favourites page or run test-favourites-list.sh" 