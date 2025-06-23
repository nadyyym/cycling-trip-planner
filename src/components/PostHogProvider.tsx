"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { capturePageview, identify, reset } from '~/lib/posthogClient';

interface PostHogProviderProps {
  children: React.ReactNode;
}

/**
 * PostHog Provider Component
 * 
 * Handles:
 * - Client-side PostHog initialization
 * - Automatic pageview tracking on route changes
 * - User identification on authentication
 * - Session reset on logout
 */
export function PostHogProvider({ children }: PostHogProviderProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  // Track pageviews on route changes
  useEffect(() => {
    if (pathname) {
      void capturePageview(pathname);
    }
  }, [pathname]);

  // Handle user identification and session management
  useEffect(() => {
    if (status === 'loading') return;

    if (session?.user) {
      // User is authenticated - identify them
      const userId = session.user.id ?? session.user.email ?? 'unknown';
      const userProperties = {
        name: session.user.name,
        email: session.user.email,
        // Note: We don't include sensitive data like Strava tokens
      };

      void identify(userId, userProperties);
    } else {
      // User logged out - reset session
      void reset();
    }
  }, [session, status]);

  return <>{children}</>;
} 