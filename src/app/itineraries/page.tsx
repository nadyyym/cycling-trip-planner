"use client";

import React, { useState } from 'react';
import { Calendar, MapPin, Clock, Eye, Share2, Route, TrendingUp } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '~/components/ui/card';
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { capture } from "~/lib/posthogClient";

// Type for trip day data from JSONB
type TripDay = {
  day: number;
  dayName?: string;
  startLocality: string;
  endLocality: string;
  distanceKm: number;
  elevationM: number;
  geometry?: {
    type: string;
    coordinates: [number, number][];
  };
};

export default function ItinerariesPage() {
  const [filter, setFilter] = useState<'all' | 'recent' | 'longer'>('all');
  const { toast } = useToast();
  const router = useRouter();

  // Fetch user's trips
  const { data: trips = [], isLoading, error } = api.trip.getAllForUser.useQuery();

  const filteredTrips = trips.filter(trip => {
    if (filter === 'recent') {
      // Show trips from last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return new Date(trip.createdAt) >= sixMonthsAgo;
    }
    if (filter === 'longer') {
      // Show trips with 3+ days
      const dayCount = Array.isArray(trip.days) ? trip.days.length : 0;
      return dayCount >= 3;
    }
    return true;
  });

  // Get trip difficulty based on total distance and elevation
  const getTripDifficulty = (distanceKm: number, elevationM: number): 'Easy' | 'Moderate' | 'Hard' => {
    const totalScore = distanceKm / 10 + elevationM / 100;
    if (totalScore > 150) return 'Hard';
    if (totalScore > 80) return 'Moderate';
    return 'Easy';
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'Moderate': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'Hard': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  // Get trip title from day data
  const getTripTitle = (trip: { days: unknown }): string => {
    if (!Array.isArray(trip.days) || trip.days.length === 0) {
      return "Untitled Trip";
    }

    const firstDay = trip.days[0] as TripDay;
    const lastDay = trip.days[trip.days.length - 1] as TripDay;
    
    if (trip.days.length === 1) {
      return firstDay.dayName ?? `${firstDay.startLocality} Circuit`;
    }

    return `${firstDay.startLocality} to ${lastDay.endLocality}`;
  };

  // Get trip location summary
  const getTripLocation = (trip: { days: unknown }): string => {
    if (!Array.isArray(trip.days) || trip.days.length === 0) {
      return "Unknown Location";
    }

    const firstDay = trip.days[0] as TripDay;
    return firstDay.startLocality ?? "Unknown Location";
  };

  // Calculate trip duration in days
  const getTripDuration = (startDate: string, endDate: string): string => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  };

  // Handle view trip
  const handleViewTrip = (slug: string, dayCount: number) => {
    // Track itinerary open event
    void capture('itinerary_open', {
      itinerary_id: slug,
      day_count: dayCount
    });

    console.log("[ITINERARIES_VIEW_TRIP]", {
      slug,
      timestamp: new Date().toISOString(),
    });
    router.push(`/trip/${slug}`);
  };

  // Handle share trip
  const handleShareTrip = (shareUrl: string, tripTitle: string, tripId: string) => {
    // Track itinerary share event
    void capture('itinerary_share', {
      itinerary_id: tripId,
      trip_title: tripTitle
    });

    console.log("[ITINERARIES_SHARE_TRIP]", {
      shareUrl,
      tripTitle,
      timestamp: new Date().toISOString(),
    });

    navigator.clipboard.writeText(shareUrl).then(() => {
      toast({
        title: "🔗 Link copied!",
        description: "Trip share link copied to clipboard",
        variant: "default",
      });
    }).catch(() => {
      toast({
        title: "❌ Copy Failed",
        description: "Failed to copy link to clipboard",
        variant: "destructive",
      });
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
            <p className="text-muted-foreground">Loading your trips...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-6xl text-red-400">⚠️</div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Failed to Load Trips</h2>
            <p className="text-muted-foreground mb-4">
              {error.message || "An unexpected error occurred"}
            </p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Filter Controls */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Cycling Itineraries</h1>
            <p className="text-muted-foreground mt-2">
              Explore your saved cycling adventures and plan new journeys
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => {
                setFilter('all');
                void capture('itinerary_filter_change', {
                  filter: 'all',
                  result_count: trips.length
                });
              }}
              size="sm"
            >
              All Trips ({trips.length})
            </Button>
            <Button
              variant={filter === 'recent' ? 'default' : 'outline'}
              onClick={() => {
                const recentCount = trips.filter(trip => {
                  const sixMonthsAgo = new Date();
                  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                  return new Date(trip.createdAt) >= sixMonthsAgo;
                }).length;
                setFilter('recent');
                void capture('itinerary_filter_change', {
                  filter: 'recent',
                  result_count: recentCount
                });
              }}
              size="sm"
            >
              Recent ({trips.filter(trip => {
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                return new Date(trip.createdAt) >= sixMonthsAgo;
              }).length})
            </Button>
            <Button
              variant={filter === 'longer' ? 'default' : 'outline'}
              onClick={() => {
                const longerCount = trips.filter(trip => {
                  const dayCount = Array.isArray(trip.days) ? trip.days.length : 0;
                  return dayCount >= 3;
                }).length;
                setFilter('longer');
                void capture('itinerary_filter_change', {
                  filter: 'longer',
                  result_count: longerCount
                });
              }}
              size="sm"
            >
              Multi-day ({trips.filter(trip => {
                const dayCount = Array.isArray(trip.days) ? trip.days.length : 0;
                return dayCount >= 3;
              }).length})
            </Button>
          </div>
        </div>
      </div>

      {/* Trip Cards Grid */}
      <div className="container mx-auto px-4 pb-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredTrips.map((trip) => {
            const difficulty = getTripDifficulty(trip.totalDistanceKm, trip.totalElevationM);
            const tripTitle = getTripTitle(trip);
            const tripLocation = getTripLocation(trip);
            const duration = getTripDuration(trip.startDate, trip.endDate);
            const dayCount = Array.isArray(trip.days) ? trip.days.length : 0;

            return (
              <div key={trip.id}>
                <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300">
                  {/* Trip Header with gradient background */}
                  <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-blue-500 via-purple-500 to-green-500">
                    <div className="absolute inset-0 bg-black/20" />
                    <div className="absolute top-4 left-4 flex gap-2">
                      <Badge className={getDifficultyColor(difficulty)}>
                        {difficulty}
                      </Badge>
                      <Badge className="bg-white/90 text-gray-800">
                        {dayCount} day{dayCount !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="absolute bottom-4 left-4 text-white">
                      <h3 className="text-lg font-semibold">{tripTitle}</h3>
                      <p className="text-sm text-white/80">{tripLocation}</p>
                    </div>
                  </div>

                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}</span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Trip Stats */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{duration}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-muted-foreground" />
                        <span>{Math.round(trip.totalDistanceKm)} km</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span>{Math.round(trip.totalElevationM).toLocaleString()} m</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{dayCount} locations</span>
                      </div>
                    </div>

                    {/* Daily Summary */}
                    {Array.isArray(trip.days) && trip.days.length > 0 && (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <h4 className="text-sm font-medium text-foreground">Daily Breakdown</h4>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {(trip.days as TripDay[]).slice(0, 3).map((day, dayIndex) => (
                            <div key={dayIndex} className="text-xs text-muted-foreground">
                              <span className="font-medium">Day {day.day}:</span> {day.dayName ?? `${day.startLocality} - ${day.endLocality}`}
                            </div>
                          ))}
                          {trip.days.length > 3 && (
                            <div className="text-xs text-muted-foreground">
                              +{trip.days.length - 3} more days...
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Trip Tags */}
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-xs">
                        Multi-day
                      </Badge>
                      {difficulty === 'Hard' && (
                        <Badge variant="secondary" className="text-xs">
                          Challenging
                        </Badge>
                      )}
                      {trip.totalDistanceKm > 200 && (
                        <Badge variant="secondary" className="text-xs">
                          Long Distance
                        </Badge>
                      )}
                      {trip.totalElevationM > 2000 && (
                        <Badge variant="secondary" className="text-xs">
                          Mountainous
                        </Badge>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0 gap-2">
                    <Button
                      onClick={() => handleViewTrip(trip.slug, dayCount)}
                      className="flex-1"
                      size="sm"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                    <Button
                      onClick={() => handleShareTrip(trip.shareUrl, tripTitle, trip.id)}
                      variant="outline"
                      size="sm"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredTrips.length === 0 && trips.length > 0 && (
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
              <Route className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No trips found</h3>
            <p className="text-muted-foreground">
              {filter === 'recent' && "No trips from the last 6 months."}
              {filter === 'longer' && "No multi-day trips found."}
            </p>
          </div>
        )}

        {/* No Trips Yet */}
        {trips.length === 0 && (
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
              <Route className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No trips yet</h3>
            <p className="text-muted-foreground mb-6">
              Start planning your first cycling adventure!
            </p>
            <div className="flex gap-4 justify-center">
              <Button asChild>
                <Link href="/explore">
                  <MapPin className="h-4 w-4 mr-2" />
                  Explore Segments
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/new-trip">
                  <Route className="h-4 w-4 mr-2" />
                  Plan New Trip
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 