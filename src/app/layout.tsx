import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import { Toaster } from "~/components/ui/toaster";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster />
      </body>
    </html>
  );
}
