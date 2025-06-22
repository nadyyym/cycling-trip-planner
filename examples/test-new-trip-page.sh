#!/bin/bash

# Test script for the new trip planning page
# Tests the /new-trip page with sample segments

echo "🧪 Testing New Trip Planning Page"
echo "=================================="

# Test URL with sample segments
TEST_URL="http://localhost:3001/new-trip?segments=229781,1073806"

echo "Testing new trip page with segments: 229781, 1073806"
echo "URL: $TEST_URL"
echo ""

# Check if development server is running
if ! curl -s http://localhost:3001 > /dev/null; then
    echo "❌ Development server not running on localhost:3001"
    echo "Please start it with: npm run dev"
    exit 1
fi

echo "✅ Development server is running"
echo ""

# Make request to the new-trip page
echo "Making request to new-trip page..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$TEST_URL")

if [ "$RESPONSE" = "200" ]; then
    echo "✅ New trip page loads successfully (HTTP 200)"
    echo ""
    echo "🌐 Open the following URL in your browser to test:"
    echo "   $TEST_URL"
    echo ""
    echo "Expected behavior:"
    echo "• Page should load with 'Planning your trip...' loading state"
    echo "• Routes should appear on map as colored polylines"
    echo "• Start/end markers should be visible for each route"
    echo "• Sidebar should show trip summary and daily routes"
    echo "• Map should automatically fit to show all routes"
else
    echo "❌ New trip page failed to load (HTTP $RESPONSE)"
    echo "Check console for errors"
fi

echo ""
echo "🔍 Manual test checklist:"
echo "• ✓ Routes visible as colored lines on map"
echo "• ✓ Start markers (white circles with colored border)"
echo "• ✓ End markers (colored circles with white border)"
echo "• ✓ Hover tooltips show day number, distance, elevation"
echo "• ✓ Sidebar shows trip summary with statistics"
echo "• ✓ Daily route cards match map colors"
echo "• ✓ Map automatically centers on routes"
echo "• ✓ Back to Explore button works" 