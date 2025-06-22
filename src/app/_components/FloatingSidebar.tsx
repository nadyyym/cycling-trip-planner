"use client";

import { useState, useContext, createContext, useCallback, useMemo } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

interface FloatingSidebarProps {
  children: React.ReactNode;
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  position?: "left" | "right";
  width?: number;
}

export function FloatingSidebar({
  children,
  title,
  isOpen = true,
  onClose,
  className,
  position = "left",
  width = 320,
}: FloatingSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!isOpen) return null;

  const sidebarStyles = {
    width: isCollapsed ? 48 : width,
    [position]: 16,
  };

  return (
    <div
      className={cn(
        "fixed top-20 z-30 flex flex-col overflow-hidden rounded-lg border border-gray-200/50 bg-white/95 shadow-xl backdrop-blur-sm transition-all duration-300 ease-in-out",
        "max-h-[calc(100vh-6rem)]",
        className
      )}
      style={sidebarStyles}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-gray-200/50 bg-white/80 px-3">
        {!isCollapsed && (
          <>
            {title && (
              <h3 className="truncate text-sm font-semibold text-gray-900">
                {title}
              </h3>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsCollapsed(true)}
                className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                title="Collapse sidebar"
              >
                {position === "left" ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  title="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        )}

        {isCollapsed && (
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Expand sidebar"
          >
            {position === "left" ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

// Context for managing sidebar state across the app
interface SidebarContextType {
  isOpen: boolean;
  content: React.ReactNode;
  title?: string;
  openSidebar: (content: React.ReactNode, title?: string) => void;
  closeSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<React.ReactNode>(null);
  const [title, setTitle] = useState<string | undefined>();

  const openSidebar = useCallback((newContent: React.ReactNode, newTitle?: string) => {
    setContent(newContent);
    setTitle(newTitle);
    setIsOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsOpen(false);
    // Clear content after animation
    setTimeout(() => {
      setContent(null);
      setTitle(undefined);
    }, 300);
  }, []);

  const contextValue = useMemo(
    () => ({
      isOpen,
      content,
      title,
      openSidebar,
      closeSidebar,
    }),
    [isOpen, content, title, openSidebar, closeSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      {children}
      <FloatingSidebar
        isOpen={isOpen}
        onClose={closeSidebar}
        title={title}
      >
        {content}
      </FloatingSidebar>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}