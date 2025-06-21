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

### Explore Segments
The `/explore` page provides an interactive map-based segment exploration experience:

- **Interactive Map**: Mapbox GL-powered map with segment visualization
- **Live Segment Loading**: Segments automatically load as you navigate the map
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

## Operations

### Token Refresh
Strava tokens expire every 6 hours. Run the refresh job:
```bash
npm run cron:start
```

## Implementation Status

### ✅ Completed Features
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

### 🚧 Frontend Integration
- **Commit 8-R**: QA, Analytics & Docs

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
