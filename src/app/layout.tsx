import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { SessionProvider } from "next-auth/react";

import { TRPCReactProvider } from "~/trpc/react";
import { Toaster } from "~/components/ui/toaster";
import { CyclingHeader } from "~/components/ui/cycling-header";
import { PostHogProvider } from "~/components/PostHogProvider";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Cycling Trip Planner - Discover & Plan Epic Multi-Day Cycling Adventures",
  description: "Plan amazing multi-day cycling trips by discovering the best Strava segments. Build custom itineraries, explore routes, and download GPX files for your next cycling adventure.",
  keywords: "cycling, bike touring, trip planning, strava segments, cycling routes, gpx, multi-day cycling, bike travel, cycling itinerary",
  authors: [{ name: "Cycling Trip Planner" }],
  creator: "Cycling Trip Planner",
  publisher: "Cycling Trip Planner",
  robots: "index, follow",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://cycling-trip-planner.vercel.app",
    title: "Cycling Trip Planner - Plan Epic Multi-Day Cycling Adventures",
    description: "Discover amazing cycling segments from Strava and build personalized multi-day cycling itineraries. Get GPX files and detailed route planning for your next bike tour.",
    siteName: "Cycling Trip Planner",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cycling Trip Planner - Plan Epic Multi-Day Cycling Adventures",
    description: "Discover amazing cycling segments from Strava and build personalized multi-day cycling itineraries.",
  },
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <SessionProvider session={session}>
          <PostHogProvider>
            <TRPCReactProvider>
              <CyclingHeader />
              {children}
            </TRPCReactProvider>
          </PostHogProvider>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
