# Cycling Trip Planner 🚲

A smart cycling trip planner that helps you discover amazing cycling segments and build multi-day itineraries.

## Vision

Plan epic cycling trips by:
- 🗺️ Discovering cycling segments through map exploration or city search
- 🎯 Selecting your favorite segments from Strava's database
- 📅 Building multi-day itineraries with half-day cycling routes (≤7 hours)
- 🏨 Finding accommodations and transportation (coming soon)

## Tech Stack

- **Frontend**: Next.js 15 + Tailwind CSS + shadcn/ui
- **Backend**: tRPC + Drizzle ORM + PostgreSQL
- **Auth**: NextAuth.js with Strava OAuth
- **Maps**: Mapbox GL JS
- **Integrations**: Strava API for segments and routes

## Quick Start

1. **Setup environment**:
   ```bash
   cp .env.example .env.local
   # Add your API keys (see Environment Variables section)
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Setup database**:
   ```bash
   # Start local PostgreSQL (Docker required)
   ./start-database.sh
   
   # Run migrations
   npm run db:migrate
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Open browser**: http://localhost:3000

## Environment Variables

Create `.env.local` with:

```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/cycling_planner"

# NextAuth
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Strava OAuth
STRAVA_CLIENT_ID="your-strava-client-id"
STRAVA_CLIENT_SECRET="your-strava-client-secret"

# Mapbox
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="your-mapbox-token"
```

## Deployment

### Vercel Deployment

1. **Prepare your production database**:
   - Set up a PostgreSQL database (recommended: Neon, Supabase, or Railway)
   - Note your production DATABASE_URL

2. **Configure Strava OAuth**:
   - Go to [Strava API Settings](https://www.strava.com/settings/api)
   - Update Authorization Callback Domain to your Vercel domain (e.g., `your-app.vercel.app`)
   - Note your Client ID and Client Secret

3. **Deploy to Vercel**:
   ```bash
   # Connect to Vercel
   npx vercel

   # Add environment variables
   vercel env add AUTH_SECRET
   vercel env add NEXTAUTH_URL
   vercel env add DATABASE_URL
   vercel env add STRAVA_CLIENT_ID
   vercel env add STRAVA_CLIENT_SECRET
   vercel env add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

   # Deploy
   vercel --prod
   ```

4. **Required Environment Variables for Production**:
   ```bash
   # Generate with: openssl rand -base64 32
   AUTH_SECRET="your-production-secret-32-chars-long"
   
   # Your production domain
   NEXTAUTH_URL="https://your-app.vercel.app"
   
   # Production PostgreSQL database (must support SSL)
   DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
   
   # Strava OAuth credentials
   STRAVA_CLIENT_ID="your-strava-client-id"
   STRAVA_CLIENT_SECRET="your-strava-client-secret"
   
   # Mapbox token
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN="your-mapbox-token"
   ```

5. **Run database migrations on production**:
   ```bash
   # Set production DATABASE_URL locally
   export DATABASE_URL="your-production-database-url"
   
   # Run migrations
   npm run db:migrate
   ```

### Troubleshooting Deployment Issues

**Authentication Not Working:**
- Ensure `NEXTAUTH_URL` matches your deployed domain exactly
- Verify Strava OAuth callback domain is set correctly
- Check that `AUTH_SECRET` is set and sufficiently long (32+ characters)

**Database Connection Errors:**
- Ensure your production database supports SSL connections
- Verify DATABASE_URL format: `postgresql://user:password@host:5432/database?sslmode=require`
- Check that your database accepts connections from Vercel's IP ranges

**Environment Variable Issues:**
- Use `vercel env ls` to verify all variables are set
- Ensure no trailing spaces or quotes in environment variable values
- Redeploy after adding/updating environment variables

## Database Schema

### Users
- `id` (uuid, PK)
- `stravaId` (string, unique)
- `name` (string)
- `accessToken` (string)
- `refreshToken` (string)
- `expiresAt` (timestamp)
- `createdAt` (timestamp)

### Segments
- `id` (bigint, PK) - Strava segment ID
- `name` (string)
- `distance` (float) - in meters
- `averageGrade` (float) - percentage
- `polyline` (string) - encoded polyline
- `latStart` (float)
- `lonStart` (float)
- `latEnd` (float)
- `lonEnd` (float)
- `elevHigh` (float, nullable)
- `elevLow` (float, nullable)
- `createdAt` (timestamp)

### Favourites
- `userId` (varchar, FK) - References users.id
- `segmentId` (bigint, FK) - References segments.id (Strava segment ID)
- `createdAt` (timestamp)
- **Composite Primary Key**: (userId, segmentId)
- **Cascade Delete**: Removes favourites when user or segment is deleted

### Itineraries
- `id` (uuid, PK)
- `userId` (uuid, FK)
- `name` (string)
- `startDate` (date)
- `endDate` (date)
- `json` (jsonb) - itinerary details
- `createdAt` (timestamp)

## Features

### Route Planning API
The route planner takes a set of Strava segments and creates optimized multi-day cycling itineraries:

- **Smart Segment Ordering**: Uses TSP algorithms to minimize transfer distances between segments
- **Realistic Route Geometry**: Stitches together actual cycling routes using Mapbox Directions API
- **Elevation-Aware Planning**: Incorporates real elevation data for accurate difficulty assessment
- **Daily Constraints**: Ensures each day is 40-100km with ≤1000m elevation gain
- **Multi-Day Optimization**: Distributes segments across up to 4 days for balanced trips

**API Endpoint**: `POST /api/trpc/routePlanner.planTrip`

**Request Schema**:
```typescript
{
  segments: Array<{
    segmentId: number;
    forwardDirection: boolean;
  }>;
  maxDays: number; // 1-4
  tripStart?: [longitude, latitude]; // Optional starting point
}
```

**Success Response**:
```typescript
{
  ok: true;
  routes: Array<{
    dayNumber: number;
    distanceKm: number;
    elevationGainM: number;
    geometry: GeoJSON.LineString; // Full route geometry
    segmentsVisited: number[];
    durationMinutes: number;
  }>;
  totalDistanceKm: number;
  totalElevationGainM: number;
  totalDurationMinutes: number;
}
```

**Error Response** (HTTP 200 with structured error):
```typescript
{
  ok: false;
  error: "dailyLimitExceeded" | "needMoreDays" | "segmentTooFar" | "externalApi";
  details: string; // Human-readable error description
}
```

**Error Types**:
- `dailyLimitExceeded`: Single segment exceeds daily distance (100km) or elevation (1000m) limits
- `needMoreDays`: Route cannot fit within maximum 4 days due to constraints
- `segmentTooFar`: Segments too far apart, routing optimization failed, or too many waypoints (>25)
- `externalApi`: Mapbox/Strava API errors, network issues, or invalid API responses

**Note**: All route planning errors return HTTP 200 with structured error responses. Only authentication errors return HTTP error codes (401, etc.).

### Trip Planning

The trip planning feature allows users to create multi-day cycling itineraries from selected segments:

**User Workflow**:
1. **Segment Selection**: Select multiple segments on the `/explore` page using checkboxes
2. **Trip Planning**: Click "🚴 Plan trip" button to open the trip planning modal
3. **Route Generation**: System automatically:
   - Optimizes segment visiting order using TSP algorithms
   - Creates realistic route geometry between segments
   - Partitions route into balanced daily stages (40-100km, ≤1000m elevation)
   - Generates up to 4-day itineraries
4. **Results Display**: View detailed Markdown itinerary with:
   - Day-by-day breakdown with distance, elevation, and duration
   - Segment list with direct Strava links
   - Copy-to-clipboard functionality for sharing
5. **Map Visualization**: Planned routes automatically display on map with:
   - Color-coded daily routes (Blue, Green, Orange, Pink)
   - Trip start marker
   - Automatic zoom to trip area

**Example API Request**:
```bash
curl -X POST http://localhost:3000/api/trpc/routePlanner.planTrip \
  -H "Content-Type: application/json" \
  -d '{
    "segments": [
      {"segmentId": 229781, "forwardDirection": true},
      {"segmentId": 1073806, "forwardDirection": true}
    ],
    "maxDays": 4
  }'
```

**Example Success Response**:
```json
{
  "ok": true,
  "routes": [
    {
      "dayNumber": 1,
      "distanceKm": 85.2,
      "elevationGainM": 890,
      "segments": [
        {
          "id": 229781,
          "name": "Hawk Hill",
          "stravaUrl": "https://www.strava.com/segments/229781"
        }
      ],
      "geometry": {
        "type": "LineString",
        "coordinates": [[-122.4194, 37.7749], ...]
      },
      "segmentsVisited": [229781],
      "durationMinutes": 240
    }
  ],
  "totalDistanceKm": 85.2,
  "totalElevationGainM": 890,
  "totalDurationMinutes": 240
}
```

**Error Handling**:
- **Toast Notifications**: Immediate feedback for success/failure
- **Detailed Error Messages**: Context-specific guidance for resolution
- **Inline Modal Display**: Markdown-formatted error explanations
- **Error Types**:
  - Daily Limit Exceeded: Segment exceeds 100km or 1000m elevation
  - Need More Days: Route requires more than 4 days
  - Segments Too Far Apart: Segments cannot be efficiently routed
  - Service Issues: Temporary Mapbox/Strava API problems

### Favourites System
The favourites system allows users to save and manage their preferred cycling segments:

- **Automatic Import**: On first login, starred segments from Strava are automatically imported
- **Favourites Page**: `/favourites` displays a comprehensive table with segment details:
  - Name (with link to Strava)
  - Distance, average grade, elevation gain
  - Climb category and KOM times
  - Remove action with confirmation
- **Real-time Badge**: Header shows live count of favourites with optimistic updates
- **Explore Integration**: 
  - ⭐ button to add segments to favourites
  - Star indicators show already-favourited segments
  - Instant UI updates with proper error handling
- **API Endpoints**:
  - `favourite.addMany` - Batch add segments to favourites
  - `favourite.remove` - Remove single favourite
  - `favourite.getMyFavourites` - List with joined segment data
  - `favourite.count` - Get count for header badge

### Explore Segments
The `/explore` page provides an interactive map-based segment exploration experience:

- **Interactive Map**: Mapbox GL-powered map with segment visualization
- **Live Segment Loading**: Segments automatically load as you navigate the map
- **Personalized Location Display**: Smart reverse geocoding for location context
  - Automatically converts user coordinates to city names (e.g., "📍 Girona, ES")
  - 1-hour caching to minimize API calls and improve performance
  - Graceful fallbacks to generic "Your Location" if geocoding fails
  - Real-time location updates when user grants location permissions
- **Minimal Location Controls**: Clean, space-efficient location UI
  - Compact map button (📍) replaces bulky sidebar section
  - Saves 56+ pixels of vertical space on mobile devices
  - Accessible with ARIA labels and keyboard navigation
  - Modal dialog with current location and search options
  - Smart search placeholder suggests using current location when not granted
- **Smart Address Autocomplete**: Real-time Mapbox geocoding suggestions
  - Live address suggestions as you type (300ms debounced)
  - Up to 5 relevant suggestions with place names and full addresses
  - Keyboard navigation (Arrow keys, Enter, Escape) and mouse selection
  - In-memory caching prevents duplicate API calls for better performance
  - Smooth map navigation to selected locations with automatic input clearing
  - Full accessibility support with proper ARIA attributes
  - Works in both sidebar search and location dialog
- **Segment Visualization**: 
  - Green lines (color: `#10b981`) show discovered segments
  - Red highlighting (color: `#ef4444`) on hover
  - Smooth 1.5-second zoom animations when clicking segments
- **Smart Cards**: Rich segment information cards with:
  - Distance, elevation gain, average grade
  - KOM times and climb categorization
  - Selection checkboxes for trip planning
  - Hover interactions that highlight segments on map
- **State Management**: Zustand-powered state for segment interactions
- **Responsive Design**: Optimized sidebar with location controls and segment list
- **Accurate Geometry**: Full polyline support via Strava segment detail API
  - Fetches encoded polylines for all visible segments
  - Decodes polylines to show exact road paths
  - Falls back gracefully when polylines unavailable

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format:check` - Check code formatting
- `npm run format:write` - Fix code formatting
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio

### Testing Route Planner

Test the route planning functionality:
```bash
# Start the development server
npm run dev

# In another terminal, test the route planner
./examples/test-route-planner-geometry.sh
```

The test script verifies:
- Route planning with multiple segments
- Geometry stitching (routes have >2 coordinates)
- Elevation and distance calculations
- Multi-day itinerary generation

### Testing Address Autocomplete

Test the Mapbox address autocomplete functionality:
```bash
# Start the development server
npm run dev

# In another terminal, test autocomplete
./examples/test-autocomplete.sh
```

The test script verifies:
- Real-time address suggestions with debouncing
- Keyboard navigation and mouse selection
- Caching and performance optimization
- Accessibility and ARIA compliance
- Integration in both sidebar and dialog

### Testing Favourites

Test the favourites functionality:
```bash
# Start the development server
npm run dev

# In another terminal, test favourites API
./examples/test-favourites-create.sh
./examples/test-favourites-list.sh
```

The test scripts verify:
- Adding segments to favourites with batch operations
- Listing favourites with joined segment data
- Removing favourites with proper error handling
- Count endpoint for header badge updates
- First-login import of Strava starred segments

## Operations

### Token Refresh
Strava tokens expire every 6 hours. Run the refresh job:
```bash
npm run cron:start
```

## Implementation Status

### ✅ Completed Features
- **Favourites System**: Complete user favourite segments management
  - Database schema with favourites table (composite PK: userId, segmentId)
  - tRPC API with addMany, remove, getMyFavourites, count procedures
  - First-login import of Strava starred segments via NextAuth events
  - Favourites page with shadcn table, remove actions, and empty states
  - Header badge with real-time count and optimistic updates
  - Explore page integration with ⭐ favourite button and indicators
  - Comprehensive error handling and loading states
- **Commit 4-R**: Rich Segment DTO & Debounced Fetch
  - Extended segment data with distance, elevation, grade, KOM times
  - Debounced map bounds for efficient API calls
  - React Query integration with caching
- **Commit 5-R**: Map Layer + Interactive Cards
  - Mapbox segment visualization with full road-following geometry
  - Real-time polyline fetching for accurate segment display
  - Interactive segment cards with hover/click functionality
  - Zustand state management for segment interactions
  - Zoom-to-segment with smooth animations using full geometry bounds
  - Proper empty states and loading skeletons
  - Graceful fallback to straight lines when polylines unavailable
- **Commit 6-R**: Save Segment Selection to DB
  - Segment save functionality with `segment.saveMany` tRPC mutation
  - Database persistence using existing segment table
  - Checkbox selection UI with bulk save operation
  - Visual badges ("•") indicating already-saved segments
  - Smart duplicate handling - only saves new segments
  - Success/error feedback with save count reporting
  - Pre-selection of saved segments on page reload
  - Server logging: "Saved X, Skipped Y existing segments"
- **Commit 7-R**: Caching & Rate-Limit Resilience
  - LRU cache implementation (200 entries, 5-minute TTL)
  - Bounds-based cache key generation with coordinate rounding
  - Automatic cache cleanup and monitoring
  - Cache hit/miss logging for performance monitoring
  - Graceful Strava 429 rate limit handling
  - Toast notifications for rate limit events
  - Automatic pause of API calls during rate limit periods
  - Timer-based rate limit expiration with success notifications
  - Frontend rate limit status indicators
  - Prevents duplicate API calls within cache TTL window

### ✅ Route Planning Engine
- **Commit 1-P**: Core types & tRPC skeleton ✅
  - Defined `PlanRequest`, `DayRoute`, `PlanResponse` types with zod validation
  - Created `routePlanner.planTrip` tRPC procedure with proper error handling
  - Integrated with existing tRPC infrastructure

- **Commit 2-P**: External API wrappers + in-process LRU cache ✅
  - Mapbox Matrix API integration for cycling distances/durations
  - Mapbox Directions API for route geometry between waypoints
  - Mapbox elevation service integration (with heuristic fallback)
  - LRU caching (1000 entries, 24h TTL) for all external API calls
  - Enhanced Strava integration with `getSegmentMeta()` for route planning

- **Commit 3-P**: Cost-matrix retrieval via Mapbox Matrix API ✅
  - Efficient O×D distance matrix generation using cycling profile
  - Support for up to 25 waypoints (Matrix API limit)
  - Proper error handling and validation for matrix responses
  - Waypoint management for trip start + segment start/end coordinates

- **Commit 4-P**: TSP solver (ordering segments) ✅
  - OR-Tools integration with fallback to brute-force and heuristic solvers
  - Optimizes segment visiting order to minimize transfer distances
  - Respects segment direction constraints (forward/reverse)
  - Sub-500ms solving time for up to 10 segments
  - Comprehensive logging and performance monitoring

- **Commit 5-P**: Geometry stitching & elevation retrieval ✅
  - **Advanced Route Geometry**: Creates continuous polylines by stitching:
    - Transfer routes between segments (via Mapbox Directions API)
    - Actual segment geometries with proper coordinate handling
    - Smart coordinate deduplication to avoid geometry gaps
  - **Accurate Elevation Data**: 
    - Retrieves elevation profiles for all transfer routes
    - Accumulates elevation gain across the entire route
    - Provides cumulative distance and elevation arrays for partitioning
  - **Real Road Following**: Routes follow actual cycling paths instead of straight lines
  - **Geometry Extraction**: Extracts day-specific geometry from full route
  - **Comprehensive Logging**: Detailed logging for debugging geometry issues
  - **Graceful Fallbacks**: Falls back to matrix data when Directions API fails

- **Commit 6-P**: Daily partitioning algorithm ✅
  - Dynamic programming approach for optimal day partitioning
  - Enforces constraints: 40-100km distance, ≤1000m elevation per day
  - Maximum 4 days per trip with balanced distribution
  - Uses accurate geometry-stitched distance and elevation data
  - Detailed constraint violation reporting and error handling

- **Commit 7-P**: Error mapping & response formatter ✅
  - **Structured Error Responses**: All errors return HTTP 200 with `{ ok: false, error, details }` format
  - **Custom Error Classes**: `DailyLimitExceededError`, `NeedMoreDaysError`, `SegmentTooFarError`, `ExternalApiPlannerError`
  - **Centralized Error Mapping**: Single `mapErrorToResponse()` function handles all error types
  - **Machine-Readable Error Codes**: `dailyLimitExceeded`, `needMoreDays`, `segmentTooFar`, `externalApi`
  - **Detailed Error Messages**: Human-readable descriptions for debugging and user feedback
  - **Authentication Exception**: Only auth errors still throw HTTP error codes (401, etc.)
  - **Comprehensive Error Handling**: Maps TSP, external API, and constraint violation errors

### 🚧 Upcoming Features
- **Commit 8-P**: Unit & E2E test suite + CI job
- **Commit 9-P**: Docs & example script

### ✅ Trip Planning UI
- **Commit 1-T**: Backend schema enhancement with segment names & Strava links ✅
  - Extended `DayRouteSchema` with `segments` array containing `{id, name, stravaUrl}`
  - Maintained backwards compatibility with deprecated `segmentsVisited` array
  - Updated route planner to populate segment details from Strava metadata
- **Commit 2-T**: TripPlanModal skeleton & routePlanner mutation ✅
  - Created `useTripPlanner` hook wrapping tRPC mutation with payload conversion
  - Built `TripPlanModal` component with loading, success, and error states
  - Implemented automatic trip planning trigger when modal opens
- **Commit 3-T**: Markdown itinerary rendering with Strava links ✅
  - Integrated `react-markdown` for rich itinerary display
  - Created structured Markdown with day-by-day breakdown and segment tables
  - Added copy-to-clipboard functionality for sharing
  - Implemented custom components for proper table styling and Strava link handling
- **Commit 4-T**: "Plan trip" entry point & selection UX ✅
  - Added trip planning button to segment selection controls
  - Integrated with existing segment selection state management
  - Implemented modal trigger with selected segment data conversion
- **Commit 5-T**: Map visualization of planned routes ✅
  - Created `useTripRouteStore` Zustand store for trip route state management
  - Added color-coded route display with day-specific styling
  - Implemented automatic map centering and zoom to trip start point
  - Added trip start marker with distinctive styling
- **Commit 6-T**: UX polish with toast & modal error handling ✅
  - Integrated toast notifications for success and error feedback
  - Enhanced error messages with user-friendly descriptions and solutions
  - Improved Markdown error display with structured problem/solution format
  - Added comprehensive error mapping for all planner error types

### 🚧 Frontend Integration
- **Commit 7-T**: QA, Analytics & Docs

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm run check`
4. Submit a pull request

## Deployment

Deploy to Vercel:
1. Connect your GitHub repository
2. Add environment variables
3. Deploy

---

Built with the [T3 Stack](https://create.t3.gg/) 🚀
