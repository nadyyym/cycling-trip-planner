#!/bin/bash

# Test script for listing user favourites
# Tests the favourite.getMyFavourites and favourite.count tRPC procedures

set -e

echo "🚲 Testing Favourites - List & Count"
echo "===================================="

# Configuration
BASE_URL="http://localhost:3000"
LIST_URL="$BASE_URL/api/trpc/favourite.getMyFavourites"
COUNT_URL="$BASE_URL/api/trpc/favourite.count"

echo "📋 Testing favourite count..."
echo "🔗 Making request to: $COUNT_URL"

# Get count
COUNT_RESPONSE=$(curl -s -X GET "$COUNT_URL" \
  -H "Accept: application/json")

echo ""
echo "📥 Count Response:"
echo "$COUNT_RESPONSE" | jq '.'

# Extract count
if echo "$COUNT_RESPONSE" | jq -e '.result.data.count' > /dev/null 2>&1; then
  COUNT=$(echo "$COUNT_RESPONSE" | jq -r '.result.data.count')
  echo ""
  echo "✅ Count Success! You have $COUNT favourite(s)"
else
  echo ""
  echo "❌ Error: Could not get count"
  exit 1
fi

echo ""
echo "📋 Testing favourites list..."
echo "🔗 Making request to: $LIST_URL"

# Get list
LIST_RESPONSE=$(curl -s -X GET "$LIST_URL" \
  -H "Accept: application/json")

echo ""
echo "📥 List Response:"
echo "$LIST_RESPONSE" | jq '.'

# Check if response contains expected fields
if echo "$LIST_RESPONSE" | jq -e '.result.data' > /dev/null 2>&1; then
  FAVOURITES=$(echo "$LIST_RESPONSE" | jq '.result.data')
  ACTUAL_COUNT=$(echo "$FAVOURITES" | jq 'length')
  
  echo ""
  echo "✅ List Success!"
  echo "   Found: $ACTUAL_COUNT favourite(s)"
  
  # Verify count matches
  if [ "$COUNT" = "$ACTUAL_COUNT" ]; then
    echo "   ✅ Count matches list length"
  else
    echo "   ⚠️  Count ($COUNT) doesn't match list length ($ACTUAL_COUNT)"
  fi
  
  # Show details if any favourites exist
  if [ "$ACTUAL_COUNT" -gt 0 ]; then
    echo ""
    echo "📍 Favourite Details:"
    echo "$FAVOURITES" | jq -r '.[] | "   • \(.name) - \(.distance/1000 | round*10/10)km, \(.averageGrade | round*10/10)% grade"'
  else
    echo ""
    echo "📝 No favourites found. Try running test-favourites-create.sh first!"
  fi
else
  echo ""
  echo "❌ Error: Unexpected response format"
  echo "   Expected: { result: { data: [...] } }"
  exit 1
fi

echo ""
echo "🎯 Test completed successfully!"
echo "   Visit $BASE_URL/favourites to see the table view" 