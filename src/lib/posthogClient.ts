import type { PostHog } from 'posthog-js';

// PostHog client instance - lazy loaded
let posthogInstance: PostHog | null = null;

// Environment check for PostHog initialization
const isPostHogEnabled = () => {
  return (
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_POSTHOG_KEY &&
    process.env.NEXT_PUBLIC_POSTHOG_HOST &&
    !process.env.NEXT_PUBLIC_ANALYTICS_DISABLED
  );
};

// Lazy initialization of PostHog client
const getPostHogClient = async (): Promise<PostHog | null> => {
  if (!isPostHogEnabled()) {
    return null;
  }

  if (posthogInstance) {
    return posthogInstance;
  }

  try {
    // Dynamic import to reduce initial bundle size
    const { default: posthog } = await import('posthog-js');
    
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.posthog.com',
      person_profiles: 'identified_only', // Only create profiles for identified users
      capture_pageview: false, // We'll handle pageviews manually
      capture_pageleave: true,
      loaded: (_posthog) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[PostHog] Initialized successfully');
        }
      },
    });

    posthogInstance = posthog;
    return posthogInstance;
  } catch (error) {
    console.error('[PostHog] Failed to initialize:', error);
    return null;
  }
};

// Event taxonomy types for type safety
export interface EventProperties {
  // Header events
  nav_click: {
    link_name: 'Explore' | 'Plan Trip' | 'Favourites' | 'Itineraries';
  };
  auth_click: {
    action: 'sign_in' | 'sign_out';
  };

  // Explore page events
  explore_search_submit: {
    query_length: number;
    filter_state?: string;
  };
  explore_segment_click: {
    segment_id: string;
    distance_km: number;
  };
  explore_plan_trip_click: {
    selected_segment_count: number;
  };

  // New Trip page events
  trip_plan_submit: {
    segment_count: number;
    days: number;
    max_daily_distance_km: number;
    max_daily_elevation_m: number;
  };
  trip_plan_cancel: Record<string, never>;
  trip_save_click: {
    total_distance_km: number;
    day_count: number;
  };

  // Trip detail page events
  trip_segment_toggle_visibility: {
    segment_id: string;
    visible: boolean;
  };
  trip_day_tab_click: {
    day_index: number;
  };
  trip_download_gpx: {
    slug: string;
    day_count: number;
  };
  trip_share_click: {
    slug: string;
  };

  // Itineraries page events
  itinerary_open: {
    itinerary_id: string;
    day_count: number;
  };
  itinerary_share: {
    itinerary_id: string;
    trip_title: string;
  };
  itinerary_filter_change: {
    filter: 'all' | 'recent' | 'longer';
    result_count: number;
  };
}

// Get default context properties
const getDefaultContext = () => {
  return {
    context_page: typeof window !== 'undefined' ? window.location.pathname : '',
    context_ts: new Date().toISOString(),
    context_environment: process.env.NODE_ENV ?? 'unknown',
    context_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
};

// Main capture function with type safety
export const capture = async <T extends keyof EventProperties>(
  event: T,
  properties: EventProperties[T]
): Promise<void> => {
  try {
    const client = await getPostHogClient();
    if (!client) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[PostHog] Capture skipped - client not available:', event, properties);
      }
      return;
    }

    // Combine event properties with default context
    const eventData = {
      ...properties,
      ...getDefaultContext(),
    };

    client.capture(event, eventData);

    if (process.env.NODE_ENV === 'development') {
      console.log('[PostHog] Event captured:', event, eventData);
    }
  } catch (error) {
    console.error('[PostHog] Failed to capture event:', event, error);
  }
};

// Identify user for authenticated sessions
export const identify = async (userId: string, userProperties?: Record<string, unknown>): Promise<void> => {
  try {
    const client = await getPostHogClient();
    if (!client) return;

    client.identify(userId, userProperties);

    if (process.env.NODE_ENV === 'development') {
      console.log('[PostHog] User identified:', userId, userProperties);
    }
  } catch (error) {
    console.error('[PostHog] Failed to identify user:', error);
  }
};

// Reset user session (on logout)
export const reset = async (): Promise<void> => {
  try {
    const client = await getPostHogClient();
    if (!client) return;

    client.reset();

    if (process.env.NODE_ENV === 'development') {
      console.log('[PostHog] User session reset');
    }
  } catch (error) {
    console.error('[PostHog] Failed to reset user session:', error);
  }
};

// Manual pageview tracking
export const capturePageview = async (pathname?: string): Promise<void> => {
  try {
    const client = await getPostHogClient();
    if (!client) return;

    const currentPath = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
    
    client.capture('$pageview', {
      $current_url: typeof window !== 'undefined' ? window.location.href : '',
      ...getDefaultContext(),
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('[PostHog] Pageview captured:', currentPath);
    }
  } catch (error) {
    console.error('[PostHog] Failed to capture pageview:', error);
  }
};

const posthogUtils = {
  capture,
  identify,
  reset,
  capturePageview,
};

export default posthogUtils; 