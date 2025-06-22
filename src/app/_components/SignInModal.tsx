"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { LogIn } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

interface SignInModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** The source that triggered the auth prompt (for analytics) */
  triggerSource: "sidebar-save" | "empty-state" | "itinerary-save" | "gpx-download" | "segment-discovery";
  /** Optional callback to execute after successful sign-in */
  onSignInSuccess?: () => void;
}

/**
 * Reusable modal component for Strava authentication
 * 
 * This component provides a consistent sign-in experience across the app.
 * It can be triggered from various entry points and includes analytics tracking.
 * 
 * @param props - SignInModalProps
 */
export function SignInModal({ 
  isOpen, 
  onClose, 
  triggerSource, 
  onSignInSuccess 
}: SignInModalProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Log auth prompt shown for analytics
  if (isOpen && process.env.NODE_ENV !== "production") {
    console.log("[AUTH_PROMPT_SHOWN]", {
      triggerSource,
      timestamp: new Date().toISOString(),
    });
  }

  const handleSignIn = async () => {
    setIsSigningIn(true);
    
    try {
      console.log("[AUTH_SIGNIN_ATTEMPT]", {
        triggerSource,
        timestamp: new Date().toISOString(),
      });

      // Sign in with Strava and redirect back to current page
      const result = await signIn("strava", { 
        redirect: false // Don't redirect, handle success in callback
      });

      if (result?.ok) {
        console.log("[AUTH_SIGNIN_SUCCESS]", {
          triggerSource,
          timestamp: new Date().toISOString(),
        });

        // Close modal and execute callback if provided
        onClose();
        onSignInSuccess?.();
      } else {
        console.error("[AUTH_SIGNIN_ERROR]", {
          triggerSource,
          error: result?.error ?? "Unknown error",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("[AUTH_SIGNIN_ERROR]", {
        triggerSource,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleCancel = () => {
    console.log("[AUTH_SIGNIN_CANCEL]", {
      triggerSource,
      timestamp: new Date().toISOString(),
    });
    onClose();
  };

  // Get context-specific title and description
  const getModalContent = () => {
    switch (triggerSource) {
      case "sidebar-save":
        return {
          title: "Sign in to Save Segments",
          description: "Connect with Strava to save your favorite cycling segments and build your collection."
        };
      case "empty-state":
        return {
          title: "Sign in to Find Segments",
          description: "Connect with Strava to discover cycling segments in this area and start planning your trips."
        };
      case "segment-discovery":
        return {
          title: "Sign in to Find Segments",
          description: "Connect with Strava to discover cycling segments in this area and start planning your trips."
        };
      case "itinerary-save":
        return {
          title: "Sign in to Save Itinerary",
          description: "Connect with Strava to save your planned cycling trip and share it with others."
        };
      case "gpx-download":
        return {
          title: "Sign in to Download GPX",
          description: "Connect with Strava to download GPX files for your cycling trip and use them on your GPS device."
        };
      default:
        return {
          title: "Sign in with Strava",
          description: "Connect your Strava account to access all features of the cycling trip planner."
        };
    }
  };

  const { title, description } = getModalContent();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          <Button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            size="lg"
          >
            <LogIn className="mr-2 h-4 w-4" />
            {isSigningIn ? "Connecting..." : "Connect with Strava"}
          </Button>
          
          <Button
            onClick={handleCancel}
            variant="outline"
            className="w-full"
            disabled={isSigningIn}
          >
            Cancel
          </Button>
        </div>
        
        <p className="text-xs text-center text-gray-500">
          Secure authentication • Your data stays private • No spam
        </p>
      </DialogContent>
    </Dialog>
  );
} 