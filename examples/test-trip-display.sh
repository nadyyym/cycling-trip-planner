#!/bin/bash

# Test script for trip display functionality
# Tests the /trip/[slug] route and trip.getBySlug API with route geometry

echo "🧪 Testing Trip Display with Route Geometry..."
echo "==============================================="

# Set the base URL
BASE_URL="http://localhost:3000"

echo ""
echo "📝 Testing trip.getBySlug API..."

# Test with a non-existent slug (should return error)
echo "🔍 Testing with non-existent slug..."
curl -s -X POST "$BASE_URL/api/trpc/trip.getBySlug" \
  -H "Content-Type: application/json" \
  -d '{"slug": "non-existent-trip-12345"}' | jq '.'

echo ""
echo "✅ Trip display tests completed!"
echo ""
echo "To test the full trip display with route geometry:"
echo "1. Start the dev server: npm run dev"
echo "2. Create a trip by visiting /new-trip?segments=229781,1073806"
echo "3. Set trip constraints and plan the trip"
echo "4. Save the trip and note the share URL"
echo "5. Visit the share URL to test the public trip display"
echo ""
echo "Expected features to verify:"
echo "- Trip loads correctly from slug"
echo "- Map displays with ACTUAL route geometry (not placeholder coordinates)"
echo "- Route polylines follow real cycling paths"
echo "- Map automatically centers on routes (regardless of location)"
echo "- GPX download includes actual route geometry"
echo "- Each day has proper start/end markers"
echo "- Hover tooltips show day information"
echo "- Share link copy functionality"
echo "- Creator information displays (if authenticated)"
echo "- Proper error handling for invalid slugs"
echo ""
echo "Debugging tips:"
echo "- Check browser console for '[TRIP_DISPLAY_ROUTE_X]' logs showing geometrySource"
echo "- Look for 'geometrySource: stored' for new trips with saved geometry"
echo "- Look for 'geometrySource: locality-fallback' for older trips using smart fallback"
echo "- Verify coordinateCount > 2 for real routes (not just start/end points)"
echo "- Map should automatically center on routes based on actual coordinates"
echo "- For older trips, fallback coordinates should match trip locality names" 