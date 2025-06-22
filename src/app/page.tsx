import Link from "next/link";
import { auth, signIn } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function Home() {
  const session = await auth();
  
  // Get favourite count for authenticated users
  const favouriteCount = session ? await api.favourite.count() : null;

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Hero Section */}
      <div className="container mx-auto flex flex-col items-center justify-center gap-12 px-4 py-16">
        <div className="text-center max-w-4xl">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
            Plan <span className="text-blue-600">Multi-Day</span> Cycling Trips
          </h1>
          <p className="text-xl md:text-2xl text-gray-700 leading-relaxed mb-8">
            Discover cycling segments from Strava, build custom itineraries, 
            and download GPX files for your next bike tour
          </p>
          
          {/* Key Features Highlight */}
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-sm font-medium text-blue-800">
              Interactive Map Explorer
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-800">
              Elevation & Distance Analysis
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-800">
              GPX Download Ready
            </span>
          </div>
        </div>

        {/* Authentication Section */}
        <div className="flex flex-col items-center gap-6 w-full max-w-md">
          {session ? (
            <div className="text-center w-full">
              <div className="mb-6 rounded-lg bg-white p-6 shadow-lg border border-gray-100">
                <p className="text-lg text-gray-700 mb-2">
                  Welcome back, <span className="font-semibold text-blue-600">{session.user?.name}</span>
                </p>
                <p className="text-sm text-gray-500">Plan your cycling trip</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <Link
                  href="/explore"
                  className="group relative overflow-hidden rounded-lg bg-blue-600 px-6 py-4 text-white font-medium shadow-lg hover:bg-blue-700 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Explore Segments
                  </span>
                </Link>
                
                <Link
                  href="/new-trip"
                  className="group relative overflow-hidden rounded-lg bg-green-600 px-6 py-4 text-white font-medium shadow-lg hover:bg-green-700 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Plan Trip
                  </span>
                </Link>
                
                <Link
                  href="/favourites"
                  className="relative rounded-lg border-2 border-gray-200 bg-white px-6 py-4 text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 hover:shadow-md"
                >
                  <span className="flex items-center justify-center gap-2">
                    Favourites
                    {favouriteCount && favouriteCount.count > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                        {favouriteCount.count}
                      </span>
                    )}
                  </span>
                </Link>
                
                <Link
                  href="/api/auth/signout"
                  className="rounded-lg border-2 border-gray-200 bg-white px-6 py-4 text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                >
                  Sign out
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center w-full">
              <div className="mb-6 rounded-lg bg-white p-6 shadow-lg border border-gray-100">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Connect with Strava to Get Started
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  Sign in with your Strava account to access cycling segments 
                  and start building your multi-day cycling itinerary
                </p>
              </div>
              
              <form
                action={async () => {
                  "use server";
                  await signIn("strava", { redirectTo: "/" });
                }}
                className="w-full"
              >
                <button
                  type="submit"
                  className="group relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-4 font-semibold text-white shadow-lg hover:from-orange-600 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
                >
                  <span className="relative z-10 flex items-center justify-center gap-3">
                    Connect with Strava
                  </span>
                </button>
              </form>
              
              <p className="mt-4 text-xs text-gray-500">
                Secure authentication • Your data stays private • No spam
              </p>
            </div>
          )}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From discovery to download, planning your cycling trip
            </p>
          </div>
          
          <div className="grid max-w-6xl mx-auto grid-cols-1 gap-8 md:grid-cols-3">
            <div className="group text-center p-6 rounded-xl hover:bg-blue-50 transition-colors duration-200">
              <div className="mb-4 text-5xl group-hover:scale-110 transition-transform duration-200">🗺️</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Discover & Explore</h3>
              <p className="text-gray-600 leading-relaxed">
                Search cycling segments by location or browse the interactive map. 
                Filter by difficulty, distance, and elevation gain to find suitable routes.
              </p>
            </div>
            
            <div className="group text-center p-6 rounded-xl hover:bg-green-50 transition-colors duration-200">
              <div className="mb-4 text-5xl group-hover:scale-110 transition-transform duration-200">🎯</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Select & Customize</h3>
              <p className="text-gray-600 leading-relaxed">
                Choose segments from Strava&apos;s database. 
                Save them to your favourites and combine different routes.
              </p>
            </div>
            
            <div className="group text-center p-6 rounded-xl hover:bg-purple-50 transition-colors duration-200">
              <div className="mb-4 text-5xl group-hover:scale-110 transition-transform duration-200">📅</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Plan & Download</h3>
              <p className="text-gray-600 leading-relaxed">
                Generate multi-day itineraries with detailed daily routes. 
                Download GPX files for your cycling trip.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="bg-gradient-to-r from-blue-600 to-green-600 py-16 text-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Use Our Trip Planner
            </h2>
            <p className="text-lg text-blue-100 max-w-2xl mx-auto">
              Built by cyclists, for cyclists. Tools you need for bike tour planning.
            </p>
          </div>
          
          <div className="grid max-w-4xl mx-auto grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-2xl">🔐</div>
              <div>
                <h3 className="font-bold text-lg mb-2">Secure & Private</h3>
                <p className="text-blue-100">Your Strava data stays secure. We only access what&apos;s needed for route planning.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-2xl">⚡</div>
              <div>
                <h3 className="font-bold text-lg mb-2">Fast Processing</h3>
                <p className="text-blue-100">Algorithms create daily routes efficiently.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-2xl">📊</div>
              <div>
                <h3 className="font-bold text-lg mb-2">Detailed Analytics</h3>
                <p className="text-blue-100">Get elevation profiles, distance breakdowns, and difficulty ratings for every route.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-2xl">🌍</div>
              <div>
                <h3 className="font-bold text-lg mb-2">Global Coverage</h3>
                <p className="text-blue-100">Access cycling segments from around the world through Strava&apos;s database.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="bg-gray-50 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Start Planning Your Trip
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Join cyclists who have planned their routes with our trip planner
          </p>
          
          {!session && (
            <form
              action={async () => {
                "use server";
                await signIn("strava", { redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="inline-flex items-center gap-3 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-4 font-semibold text-white shadow-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5"
              >
                Get Started with Strava
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
