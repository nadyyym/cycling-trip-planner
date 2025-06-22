"use client";

/*
  Shared Header component – displayed on every app page.
  - Fixed height (h-14) and high z-index so it floats over map.
  - Lightweight translucent background with backdrop blur for map visibility.
  - Includes: logo (home), primary nav links, auth avatar/sign-in button.
  - Highlights active route for consistency across pages.
  - Uses Tailwind CSS and lucide-react icons already present in the project.

  NOTE: Add <Header/> to a RootLayout that wraps dashboard pages to enable unified navigation.
*/

import { Bike, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

import { cn } from "~/lib/utils";

// Central definition of navigation links so it's easy to extend
const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "/explore", label: "Explore" },
  { href: "/new-trip", label: "New Trip" },
  { href: "/itineraries", label: "My Trips" },
];

export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isLoadingSession = status === "loading";

  // Utility to render nav link with active styling
  const renderLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "text-sm font-medium transition-colors",
        pathname.startsWith(href)
          ? "text-gray-900 dark:text-white"
          : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white",
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-14 border-b bg-white/80 backdrop-blur-sm supports-[backdrop-filter]:bg-white/60 dark:border-gray-800 dark:bg-gray-900/80">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
        {/* Left: Logo + nav links */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Bike className="h-5 w-5 text-green-600" />
            <span className="sr-only">Home</span>
          </Link>

          {/* Desktop nav – hide on small screens; mobile nav footprint TBD */}
          <nav className="hidden gap-4 md:flex">
            {NAV_LINKS.map(({ href, label }) => renderLink(href, label))}
          </nav>
        </div>

        {/* Right: Auth controls */}
        <div className="flex items-center gap-2">
          {isLoadingSession ? (
            // Skeleton avatar while session is loading
            <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
          ) : session?.user ? (
            // Logged-in state – show avatar, click to sign out
            <button
              onClick={() => void signOut()}
              className="group relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all focus:outline-none focus:ring-2 focus:ring-green-600"
              title="Sign out"
            >
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? "Avatar"}
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              ) : (
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {session.user.name?.charAt(0).toUpperCase() ?? "U"}
                </span>
              )}
              {/* Tooltip */}
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                Sign out
              </span>
            </button>
          ) : (
            // Logged-out state – sign-in button
            <button
              onClick={() => void signIn()}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;