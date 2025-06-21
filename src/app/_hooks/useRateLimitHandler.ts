import { useState, useCallback, useEffect } from "react";
import { useToast } from "~/hooks/use-toast";

interface RateLimitState {
  isRateLimited: boolean;
  retryAfter?: number;
  rateLimitEndsAt?: number;
}

/**
 * Hook to manage Strava API rate limiting state
 * Shows toast notifications and prevents API calls during rate limit periods
 */
export function useRateLimitHandler() {
  const { toast } = useToast();
  const [rateLimitState, setRateLimitState] = useState<RateLimitState>({
    isRateLimited: false,
  });

  /**
   * Handle rate limit error from Strava API
   * Shows toast notification and sets rate limit state
   */
  const handleRateLimit = useCallback(
    (error: { cause?: { retryAfter?: number } }) => {
      const retryAfter = error?.cause?.retryAfter ?? 60; // Default to 60 seconds
      const rateLimitEndsAt = Date.now() + retryAfter * 1000;

      setRateLimitState({
        isRateLimited: true,
        retryAfter,
        rateLimitEndsAt,
      });

      // Show non-blocking toast notification
      toast({
        title: "⏳ Strava Rate Limit Hit",
        description: `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
        variant: "destructive",
        duration: Math.min(retryAfter * 1000, 10000), // Show for up to 10 seconds
      });

      console.log(`Rate limited by Strava - retry after ${retryAfter} seconds`);
    },
    [toast],
  );

  /**
   * Check if we're currently rate limited
   */
  const isCurrentlyRateLimited = useCallback(() => {
    if (!rateLimitState.isRateLimited || !rateLimitState.rateLimitEndsAt) {
      return false;
    }

    const now = Date.now();
    if (now >= rateLimitState.rateLimitEndsAt) {
      // Rate limit period has expired
      setRateLimitState({ isRateLimited: false });
      return false;
    }

    return true;
  }, [rateLimitState]);

  /**
   * Get remaining time until rate limit expires
   */
  const getRemainingTime = useCallback(() => {
    if (!rateLimitState.isRateLimited || !rateLimitState.rateLimitEndsAt) {
      return 0;
    }

    const now = Date.now();
    return Math.max(
      0,
      Math.ceil((rateLimitState.rateLimitEndsAt - now) / 1000),
    );
  }, [rateLimitState]);

  /**
   * Clear rate limit state manually
   */
  const clearRateLimit = useCallback(() => {
    setRateLimitState({ isRateLimited: false });
  }, []);

  // Auto-clear rate limit when timer expires
  useEffect(() => {
    if (!rateLimitState.isRateLimited || !rateLimitState.rateLimitEndsAt) {
      return;
    }

    const now = Date.now();
    const timeRemaining = rateLimitState.rateLimitEndsAt - now;

    if (timeRemaining <= 0) {
      setRateLimitState({ isRateLimited: false });
      return;
    }

    const timer = setTimeout(() => {
      setRateLimitState({ isRateLimited: false });

      // Show success toast when rate limit expires
      toast({
        title: "✅ Rate Limit Cleared",
        description: "You can now make new requests to Strava.",
        variant: "default",
        duration: 3000,
      });
    }, timeRemaining);

    return () => clearTimeout(timer);
  }, [rateLimitState, toast]);

  return {
    isRateLimited: isCurrentlyRateLimited(),
    remainingTime: getRemainingTime(),
    handleRateLimit,
    clearRateLimit,
  };
}
