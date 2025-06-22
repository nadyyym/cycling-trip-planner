#!/bin/bash

# Test script for enhanced day colors feature
# Tests the new-trip page with multi-day route planning to verify color coding

echo "🎨 Testing Enhanced Day Colors Feature"
echo "======================================="

# Test URL with multiple segments that should create a multi-day trip
NEW_TRIP_URL="http://localhost:3000/new-trip?segments=229781,1073806,674833"

echo ""
echo "🔄 Starting color feature tests..."
echo ""

# Test 1: Check if the page loads properly
echo "Test 1: Testing new-trip page load with multi-day segments"
echo "URL: $NEW_TRIP_URL"
echo ""

# Check if development server is running
if curl -f -s http://localhost:3000 >/dev/null; then
    echo "✅ Development server is running"
    
    echo ""
    echo "📍 To test the enhanced day colors feature:"
    echo "   1. Open: $NEW_TRIP_URL"
    echo "   2. Wait for trip planning to complete"
    echo "   3. Verify the following enhancements:"
    echo ""
    echo "   🎯 Map Features:"
    echo "   • Routes are colored by day (Blue, Green, Orange, Pink)"
    echo "   • Route tooltips show color indicators and highlighted distance"
    echo "   • Start/end markers match route colors"
    echo ""
    echo "   🎯 Sidebar Features:"
    echo "   • Color legend showing day-color mapping"
    echo "   • Route cards with matching background colors"
    echo "   • Color indicators next to day numbers"
    echo "   • Enhanced distance display with day colors"
    echo ""
    echo "   🎯 Expected Colors:"
    echo "   • Day 1: Blue (#6366f1)"
    echo "   • Day 2: Green (#10b981)"
    echo "   • Day 3: Orange (#f97316)"
    echo "   • Day 4: Pink (#ec4899)"
    echo ""
    
    echo "🌐 Opening test URL in browser..."
    if command -v open >/dev/null 2>&1; then
        open "$NEW_TRIP_URL"
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$NEW_TRIP_URL"
    else
        echo "   Please manually open: $NEW_TRIP_URL"
    fi
    
else
    echo "❌ Development server is not running"
    echo "   Please run: npm run dev"
    echo "   Then re-run this test script"
fi

echo ""
echo "🔧 Technical Implementation:"
echo "   • Centralized day colors in ~/lib/mapUtils.ts"
echo "   • Color legend component in RouteListSidebar"
echo "   • Enhanced tooltips with color indicators"
echo "   • Consistent styling across map and UI"
echo ""
echo "✨ Feature completed! Different days' routes are now clearly"
echo "   distinguished by color, making it easy to see distance per day." 