"use client";

import { useState } from "react";
import { Bike, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

import { cn } from "~/lib/utils";

// Navigation links configuration
const NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/new-trip", label: "New Trip" },
  { href: "/itineraries", label: "My Trips" },
] as const;

export function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isLoadingSession = status === "loading";

  // Check if current path matches nav link
  const isActiveLink = (href: string) => {
    if (href === "/" && pathname === "/") return true;
    if (href !== "/" && pathname.startsWith(href)) return true;
    return false;
  };

  return (
    <>
      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-200/20 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link 
            href="/" 
            className="flex items-center gap-2 text-gray-900 transition-colors hover:text-green-600"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600 text-white">
              <Bike className="h-4 w-4" />
            </div>
            <span className="hidden font-semibold sm:block">CyclePlan</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center space-x-8 md:flex">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "text-sm font-medium transition-colors",
                  isActiveLink(href)
                    ? "text-green-600"
                    : "text-gray-600 hover:text-gray-900"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side - Auth + Mobile menu */}
          <div className="flex items-center gap-3">
            {/* Auth Section */}
            {isLoadingSession ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
            ) : session?.user ? (
              <div className="group relative">
                <button
                  onClick={() => void signOut()}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-green-600/20 focus:outline-none focus:ring-2 focus:ring-green-600"
                  title={`Sign out ${session.user.name || ""}`}
                >
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name ?? "User"}
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-green-600 text-sm font-medium text-white">
                      {session.user.name?.charAt(0)?.toUpperCase() ?? "U"}
                    </div>
                  )}
                </button>
                
                {/* Tooltip */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 transform rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Sign out
                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900"></div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => void signIn()}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
              >
                Sign In
              </button>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="border-t border-gray-200 bg-white md:hidden">
            <div className="space-y-1 px-4 py-3">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActiveLink(href)
                      ? "bg-green-50 text-green-600"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Header spacer - ensures content doesn't hide behind fixed header */}
      <div className="h-14" />
    </>
  );
}

export default Header;