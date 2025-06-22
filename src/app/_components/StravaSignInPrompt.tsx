"use client";

import { LogIn } from "lucide-react";
import { Button } from "~/components/ui/button";

interface StravaSignInPromptProps {
  /** Title for the prompt */
  title?: string;
  /** Description text */
  description?: string;
  /** Icon emoji to display */
  icon?: string;
  /** Whether the button should be full width */
  fullWidth?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Click handler for the sign in button */
  onSignIn: () => void;
}

/**
 * Reusable component that prompts users to sign in with Strava
 * Used when no segments are available to guide users to authentication
 */
export function StravaSignInPrompt({
  title = "Sign in with Strava to find segments",
  description = "Connect your Strava account to discover cycling segments in this area and start planning your trips.",
  icon = "🚴‍♀️",
  fullWidth = true,
  className = "",
  onSignIn,
}: StravaSignInPromptProps) {
  return (
    <div className={`py-8 text-center ${className}`}>
      <div className="mb-3 text-4xl text-gray-400">{icon}</div>
      <div className="mb-2 text-sm font-medium text-gray-900">
        {title}
      </div>
      <div className="mb-4 text-sm text-gray-500 max-w-xs mx-auto">
        {description}
      </div>
      <Button
        onClick={onSignIn}
        className={`bg-orange-500 hover:bg-orange-600 text-white ${fullWidth ? 'w-full max-w-xs' : ''}`}
        size="sm"
      >
        <LogIn className="mr-2 h-4 w-4" />
        Connect with Strava
      </Button>
    </div>
  );
} 