import { create } from "zustand";
import type { EasierDayRule } from "~/types/routePlanner";

/**
 * Trip planning constraints that users can customize
 */
export interface TripConstraints {
  /** Trip start date (ISO yyyy-mm-dd format) */
  startDate: string;
  /** Trip end date (ISO yyyy-mm-dd format) */
  endDate: string;
  /** Maximum daily distance in kilometers */
  maxDailyDistanceKm: number;
  /** Maximum daily elevation gain in meters */
  maxDailyElevationM: number;
  /** Easier day rule configuration */
  easierDayRule: EasierDayRule;
}

/**
 * Store for managing trip planning constraints
 */
export interface TripConstraintStore {
  /** Current trip constraints */
  constraints: TripConstraints;
  
  /** Whether constraints have been set by user (vs defaults) */
  isCustomized: boolean;
  
  /** Actions */
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setMaxDailyDistance: (km: number) => void;
  setMaxDailyElevation: (meters: number) => void;
  setEasierDayRule: (rule: EasierDayRule) => void;
  setConstraints: (constraints: Partial<TripConstraints>) => void;
  resetToDefaults: () => void;
  
  /** Validation */
  isValid: () => boolean;
  getValidationErrors: () => string[];
}

/**
 * Default trip constraints
 */
const DEFAULT_CONSTRAINTS: TripConstraints = {
  startDate: new Date().toISOString().split('T')[0]!, // Today
  endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!, // 4 days from now
  maxDailyDistanceKm: 100,
  maxDailyElevationM: 1000,
  easierDayRule: {
    every: 3,
    maxDistanceKm: 60,
    maxElevationM: 1000,
  },
};

/**
 * Calculate the number of days between two dates (inclusive)
 */
function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
  return diffDays;
}

/**
 * Validate trip constraints
 */
function validateConstraints(constraints: TripConstraints): string[] {
  const errors: string[] = [];
  
  // Date validation
  const startDate = new Date(constraints.startDate);
  const endDate = new Date(constraints.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset to start of day for comparison
  
  if (isNaN(startDate.getTime())) {
    errors.push("Start date is invalid");
  }
  
  if (isNaN(endDate.getTime())) {
    errors.push("End date is invalid");
  }
  
  if (startDate >= endDate) {
    errors.push("End date must be after start date");
  }
  
  if (startDate < today) {
    errors.push("Start date cannot be in the past");
  }
  
  const tripDays = calculateDays(constraints.startDate, constraints.endDate);
  if (tripDays > 14) {
    errors.push("Trip duration cannot exceed 14 days");
  }
  
  // Distance validation
  if (constraints.maxDailyDistanceKm < 20) {
    errors.push("Maximum daily distance must be at least 20 km");
  }
  
  if (constraints.maxDailyDistanceKm > 300) {
    errors.push("Maximum daily distance cannot exceed 300 km");
  }
  
  // Elevation validation
  if (constraints.maxDailyElevationM < 200) {
    errors.push("Maximum daily elevation must be at least 200 m");
  }
  
  if (constraints.maxDailyElevationM > 5000) {
    errors.push("Maximum daily elevation cannot exceed 5000 m");
  }
  
  // Easier day rule validation
  const rule = constraints.easierDayRule;
  if (rule.every < 2 || rule.every > 7) {
    errors.push("Easier day frequency must be between 2 and 7 days");
  }
  
  if (rule.maxDistanceKm < 20 || rule.maxDistanceKm > 100) {
    errors.push("Easier day distance must be between 20 and 100 km");
  }
  
  if (rule.maxElevationM < 200 || rule.maxElevationM > 2000) {
    errors.push("Easier day elevation must be between 200 and 2000 m");
  }
  
  // Logical validation: easier day limits should be <= regular limits
  if (rule.maxDistanceKm > constraints.maxDailyDistanceKm) {
    errors.push("Easier day distance cannot exceed regular daily limit");
  }
  
  if (rule.maxElevationM > constraints.maxDailyElevationM) {
    errors.push("Easier day elevation cannot exceed regular daily limit");
  }
  
  return errors;
}

/**
 * Zustand store for managing trip constraint state
 * Used for storing and validating user's custom trip planning preferences
 */
export const useTripConstraintStore = create<TripConstraintStore>((set, get) => ({
  constraints: DEFAULT_CONSTRAINTS,
  isCustomized: false,

  setStartDate: (date: string) => {
    console.log("[TRIP_CONSTRAINT_SET_START_DATE]", {
      date,
      timestamp: new Date().toISOString(),
    });

    set((state) => ({
      constraints: { ...state.constraints, startDate: date },
      isCustomized: true,
    }));
  },

  setEndDate: (date: string) => {
    console.log("[TRIP_CONSTRAINT_SET_END_DATE]", {
      date,
      timestamp: new Date().toISOString(),
    });

    set((state) => ({
      constraints: { ...state.constraints, endDate: date },
      isCustomized: true,
    }));
  },

  setMaxDailyDistance: (km: number) => {
    console.log("[TRIP_CONSTRAINT_SET_MAX_DISTANCE]", {
      km,
      timestamp: new Date().toISOString(),
    });

    set((state) => ({
      constraints: { ...state.constraints, maxDailyDistanceKm: km },
      isCustomized: true,
    }));
  },

  setMaxDailyElevation: (meters: number) => {
    console.log("[TRIP_CONSTRAINT_SET_MAX_ELEVATION]", {
      meters,
      timestamp: new Date().toISOString(),
    });

    set((state) => ({
      constraints: { ...state.constraints, maxDailyElevationM: meters },
      isCustomized: true,
    }));
  },

  setEasierDayRule: (rule: EasierDayRule) => {
    console.log("[TRIP_CONSTRAINT_SET_EASIER_DAY_RULE]", {
      rule,
      timestamp: new Date().toISOString(),
    });

    set((state) => ({
      constraints: { ...state.constraints, easierDayRule: rule },
      isCustomized: true,
    }));
  },

  setConstraints: (newConstraints: Partial<TripConstraints>) => {
    console.log("[TRIP_CONSTRAINT_SET_MULTIPLE]", {
      newConstraints,
      timestamp: new Date().toISOString(),
    });

    set((state) => ({
      constraints: { ...state.constraints, ...newConstraints },
      isCustomized: true,
    }));
  },

  resetToDefaults: () => {
    console.log("[TRIP_CONSTRAINT_RESET]", {
      timestamp: new Date().toISOString(),
    });

    set({
      constraints: DEFAULT_CONSTRAINTS,
      isCustomized: false,
    });
  },

  isValid: () => {
    const { constraints } = get();
    const errors = validateConstraints(constraints);
    return errors.length === 0;
  },

  getValidationErrors: () => {
    const { constraints } = get();
    return validateConstraints(constraints);
  },
})); 