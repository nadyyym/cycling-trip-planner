"use client";

import { Heart, MapPin, Route } from "lucide-react";
import { SignInModal } from "./SignInModal";
import { useRequireAuth } from "../_hooks/useRequireAuth";
import { Button } from "~/components/ui/button";

/**
 * Empty state component for favourites page when user is not authenticated
 * 
 * This component displays an informative message about the favourites feature
 * and provides a clear call-to-action to sign in with Strava.
 */
export function AuthEmptyState() {
  const { requireAuth, isModalOpen, triggerSource, onSignInSuccess, onModalClose } = 
    useRequireAuth("empty-state");

  const handleSignInClick = () => {
    requireAuth(() => {
      // After successful sign-in, the page will refresh and show actual favourites
      window.location.reload();
    });
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="text-center max-w-md">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
            <Heart className="h-8 w-8 text-orange-600" />
          </div>

          {/* Title */}
          <h1 className="mb-4 text-2xl font-bold text-gray-900">
            Your Favourite Segments
          </h1>

          {/* Description */}
          <p className="mb-8 text-gray-600 leading-relaxed">
            Save your favorite cycling segments from Strava and build your personal collection. 
            Plan amazing trips by combining segments you love to ride.
          </p>

          {/* Features list */}
          <div className="mb-8 space-y-3 text-left">
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <Heart className="h-4 w-4 text-orange-500 flex-shrink-0" />
              <span>Save segments from the explore page</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <MapPin className="h-4 w-4 text-orange-500 flex-shrink-0" />
              <span>Import your starred segments from Strava</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <Route className="h-4 w-4 text-orange-500 flex-shrink-0" />
              <span>Use favourites to plan multi-day trips</span>
            </div>
          </div>

          {/* Call to action */}
          <Button
            onClick={handleSignInClick}
            size="lg"
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Heart className="mr-2 h-4 w-4" />
            Connect with Strava to Get Started
          </Button>

          {/* Additional context */}
          <p className="mt-4 text-xs text-gray-500">
            Your Strava starred segments will be automatically imported
          </p>
        </div>
      </div>

      {/* Sign-in modal */}
      <SignInModal
        isOpen={isModalOpen}
        onClose={onModalClose}
        triggerSource={triggerSource}
        onSignInSuccess={onSignInSuccess}
      />
    </>
  );
} 