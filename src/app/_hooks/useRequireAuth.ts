"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";

/**
 * Type for trigger sources that require authentication
 */
export type AuthTriggerSource = "sidebar-save" | "empty-state" | "itinerary-save" | "gpx-download";

/**
 * Hook for managing authentication requirements for actions
 * 
 * This hook provides a wrapper function that checks authentication status
 * and shows a sign-in modal if the user is not authenticated.
 * 
 * @param triggerSource - The source that triggered the auth requirement
 * @returns Object with wrapped action function and modal state
 */
export function useRequireAuth(triggerSource: AuthTriggerSource) {
  const { data: session, status } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  /**
   * Wraps an action to require authentication
   * If user is authenticated, executes immediately
   * If not authenticated, shows sign-in modal and stores action for later
   */
  const requireAuth = useCallback((action: () => void) => {
    // If still loading session, wait
    if (status === "loading") {
      console.log("[AUTH_CHECK_LOADING]", {
        triggerSource,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // If authenticated, execute action immediately
    if (session?.user) {
      console.log("[AUTH_CHECK_SUCCESS]", {
        triggerSource,
        userId: session.user.id,
        timestamp: new Date().toISOString(),
      });
      action();
      return;
    }

    // If not authenticated, store action and show modal
    console.log("[AUTH_CHECK_REQUIRED]", {
      triggerSource,
      timestamp: new Date().toISOString(),
    });
    
    setPendingAction(() => action);
    setIsModalOpen(true);
  }, [session, status, triggerSource]);

  /**
   * Handles successful sign-in by executing the pending action
   */
  const handleSignInSuccess = useCallback(() => {
    console.log("[AUTH_SIGNIN_SUCCESS_CALLBACK]", {
      triggerSource,
      hasPendingAction: !!pendingAction,
      timestamp: new Date().toISOString(),
    });

    if (pendingAction) {
      // Execute the pending action
      pendingAction();
      setPendingAction(null);
    }
    setIsModalOpen(false);
  }, [pendingAction, triggerSource]);

  /**
   * Handles modal close (cancel or success)
   */
  const handleModalClose = useCallback(() => {
    console.log("[AUTH_MODAL_CLOSE]", {
      triggerSource,
      wasCancelled: !!pendingAction,
      timestamp: new Date().toISOString(),
    });

    setIsModalOpen(false);
    setPendingAction(null);
  }, [pendingAction, triggerSource]);

  return {
    /** Function to wrap actions that require authentication */
    requireAuth,
    /** Whether the sign-in modal is currently open */
    isModalOpen,
    /** Trigger source for the modal */
    triggerSource,
    /** Callback for successful sign-in */
    onSignInSuccess: handleSignInSuccess,
    /** Callback for modal close */
    onModalClose: handleModalClose,
    /** Current session (null if not authenticated) */
    session,
    /** Whether session is currently loading */
    isLoading: status === "loading",
  };
} 