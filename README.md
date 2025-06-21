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

### 🚧 Upcoming Features
- **Commit 6-R**: Save Segment Selection to DB
- **Commit 7-R**: Caching & Rate-Limit Resilience  
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
