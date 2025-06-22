"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { 
  Home, 
  Compass, 
  MapPin, 
  Heart, 
  Route, 
  Menu, 
  User,
  LogIn,
  Bike
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "~/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { api } from "~/trpc/react";

interface NavigationItem {
  title: string;
  href: string;
  description?: string;
  icon?: React.ReactNode;
}

const navigationItems: NavigationItem[] = [
  { title: "Home", href: "/", icon: <Home className="h-4 w-4" /> },
  { title: "Explore", href: "/explore", icon: <Compass className="h-4 w-4" /> },
  { title: "Plan Trip", href: "/new-trip", icon: <MapPin className="h-4 w-4" /> },
  { title: "Favourites", href: "/favourites", icon: <Heart className="h-4 w-4" /> },
  { title: "Itineraries", href: "/itineraries", icon: <Route className="h-4 w-4" /> }
];

export const CyclingHeader: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: session, status } = useSession();
  
  // Get favourite count for badge
  const { data: favouriteCount } = api.favourite.count.useQuery(undefined, {
    enabled: !!session,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 0, // Always consider stale for real-time updates
  });

  const handleSignOut = async () => {
    try {
      await signOut({ redirectTo: "/" });
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleSignIn = async () => {
    try {
      await signIn("strava", { redirectTo: "/" });
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <Bike className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold text-foreground">Cycling Trip Planner</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            <NavigationMenu>
              <NavigationMenuList>
                {navigationItems.map((item) => (
                  <NavigationMenuItem key={item.title}>
                    <NavigationMenuLink asChild>
                      <Link
                        href={item.href}
                        className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50"
                      >
                        <span className="flex items-center space-x-2">
                          {item.icon}
                          <span>{item.title}</span>
                          {/* Show favourite count badge */}
                          {item.title === "Favourites" && favouriteCount && favouriteCount.count > 0 && (
                            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                              {favouriteCount.count}
                            </span>
                          )}
                        </span>
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Desktop Auth Buttons */}
          <div className="hidden md:flex items-center space-x-2">
            {status === "loading" ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
            ) : session ? (
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      {session.user?.name ?? "User"}
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
                  Sign out
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => void handleSignIn()} className="bg-orange-500 hover:bg-orange-600">
                <LogIn className="h-4 w-4 mr-2" />
                Connect with Strava
              </Button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle className="flex items-center space-x-2">
                    <Bike className="h-5 w-5 text-blue-600" />
                    <span>Cycling Trip Planner</span>
                  </SheetTitle>
                </SheetHeader>
                
                <div className="mt-6 space-y-6">
                  {/* Mobile Navigation Links */}
                  <nav className="space-y-2">
                    {navigationItems.map((item) => (
                      <Link
                        key={item.title}
                        href={item.href}
                        className="flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.icon}
                        <span>{item.title}</span>
                        {/* Show favourite count badge in mobile */}
                        {item.title === "Favourites" && favouriteCount && favouriteCount.count > 0 && (
                          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                            {favouriteCount.count}
                          </span>
                        )}
                      </Link>
                    ))}
                  </nav>

                  {/* Mobile Auth Section */}
                  <div className="border-t border-border pt-6">
                    {status === "loading" ? (
                      <div className="animate-pulse space-y-3">
                        <div className="h-12 bg-gray-200 rounded-lg"></div>
                        <div className="h-10 bg-gray-200 rounded-lg"></div>
                      </div>
                    ) : session ? (
                      <div className="space-y-4">
                        <div className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-accent/50">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {session.user?.name ?? "User"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {session.user?.email ?? ""}
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          className="w-full" 
                          onClick={() => {
                            void handleSignOut();
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          Sign out
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        className="w-full bg-orange-500 hover:bg-orange-600" 
                        onClick={() => {
                          void handleSignIn();
                          setIsMobileMenuOpen(false);
                        }}
                      >
                        <LogIn className="h-4 w-4 mr-2" />
                        Connect with Strava
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default CyclingHeader; 