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
