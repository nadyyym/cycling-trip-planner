"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2, ExternalLink } from "lucide-react";
import { api } from "~/trpc/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

interface FavouritesTableProps {
  className?: string;
}

export function FavouritesTable({ className }: FavouritesTableProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Get favourites data
  const {
    data: favourites = [],
    isLoading,
    error,
  } = api.favourite.getMyFavourites.useQuery();

  // Remove favourite mutation
  const utils = api.useUtils();
  const removeMutation = api.favourite.remove.useMutation({
    onMutate: async (variables) => {
      setRemovingId(variables.segmentId);
      
      // Cancel outgoing refetches
      await utils.favourite.getMyFavourites.cancel();
      await utils.favourite.count.cancel();

      // Snapshot previous values
      const previousFavourites = utils.favourite.getMyFavourites.getData();
      const previousCount = utils.favourite.count.getData();

      // Optimistically update favourites list
      utils.favourite.getMyFavourites.setData(undefined, (old) =>
        old?.filter((fav) => fav.id !== variables.segmentId) ?? []
      );

      // Optimistically update count
      utils.favourite.count.setData(undefined, (old) => ({
        count: Math.max(0, (old?.count ?? 1) - 1),
      }));

      return { previousFavourites, previousCount };
    },
    onError: (error, variables, context) => {
      console.error("Failed to remove favourite:", error);
      
      // Revert optimistic updates on error
      if (context?.previousFavourites) {
        utils.favourite.getMyFavourites.setData(undefined, context.previousFavourites);
      }
      if (context?.previousCount) {
        utils.favourite.count.setData(undefined, context.previousCount);
      }
    },
    onSettled: () => {
      setRemovingId(null);
      // Refetch to ensure consistency
      void utils.favourite.getMyFavourites.invalidate();
      void utils.favourite.count.invalidate();
    },
  });

  const handleRemove = (segmentId: string, segmentName: string) => {
    if (confirm(`Remove "${segmentName}" from favourites?`)) {
      removeMutation.mutate({ segmentId });
    }
  };

  const formatDistance = (meters: number) => {
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatGrade = (grade: number) => {
    return `${grade.toFixed(1)}%`;
  };

  const formatElevation = (meters: number) => {
    return `${Math.round(meters)}m`;
  };

  const getStravaUrl = (segmentId: string) => {
    return `https://www.strava.com/segments/${segmentId}`;
  };

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="text-center py-8">
          <div className="text-red-600 font-medium">Failed to load favourites</div>
          <div className="text-gray-600 text-sm mt-1">{error.message}</div>
        </div>
      </div>
    );
  }

  if (favourites.length === 0) {
    return (
      <div className={className}>
        <div className="text-center py-12">
          <div className="text-6xl mb-4">⭐</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No favourites yet
          </h3>
          <p className="text-gray-600 mb-6">
            Start exploring segments and add them to your favourites!
          </p>
          <Link
            href="/explore"
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Explore Segments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Avg Grade</TableHead>
              <TableHead>Elevation</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>KOM Time</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {favourites.map((favourite) => (
              <TableRow key={favourite.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-xs" title={favourite.name}>
                      {favourite.name}
                    </span>
                    <a
                      href={getStravaUrl(favourite.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-600 hover:text-orange-700"
                      title="View on Strava"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </TableCell>
                <TableCell>{formatDistance(favourite.distance)}</TableCell>
                <TableCell>{formatGrade(favourite.averageGrade)}</TableCell>
                <TableCell>{formatElevation(favourite.elevationGain)}</TableCell>
                <TableCell>
                  {favourite.climbCategory ? (
                    <span className="rounded bg-orange-100 px-2 py-1 text-xs text-orange-800">
                      Cat {favourite.climbCategory}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {favourite.komTime ? (
                    <span className="font-mono text-sm">{favourite.komTime}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => handleRemove(favourite.id, favourite.name)}
                    disabled={removingId === favourite.id}
                    className="flex items-center justify-center rounded p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                    title="Remove from favourites"
                    aria-label={`Remove ${favourite.name} from favourites`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {favourites.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          Showing {favourites.length} favourite{favourites.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
} 