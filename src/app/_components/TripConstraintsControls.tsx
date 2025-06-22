"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "~/components/ui/calendar";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useTripConstraintStore } from "~/app/_hooks/useTripConstraintStore";
import { cn } from "~/lib/utils";

/**
 * Props for the TripConstraintsControls component
 */
interface TripConstraintsControlsProps {
  /** Whether the Plan Trip button should be disabled */
  disabled?: boolean;
  /** Callback when Plan Trip button is clicked */
  onPlanTrip?: () => void;
  /** Number of selected segments for display */
  selectedSegmentCount?: number;
}

/**
 * Component for managing trip planning constraints
 * Includes date range picker, distance/elevation inputs, and plan trip button
 */
export function TripConstraintsControls({
  disabled = false,
  onPlanTrip,
  selectedSegmentCount = 0,
}: TripConstraintsControlsProps) {
  const {
    constraints,
    setStartDate,
    setEndDate,
    setMaxDailyDistance,
    setMaxDailyElevation,
    isValid,
    getValidationErrors,
  } = useTripConstraintStore();

  const [isStartDateOpen, setIsStartDateOpen] = useState(false);
  const [isEndDateOpen, setIsEndDateOpen] = useState(false);

  // Calculate trip duration
  const startDate = new Date(constraints.startDate);
  const endDate = new Date(constraints.endDate);
  const tripDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Validation
  const validationErrors = getValidationErrors();
  const isFormValid = isValid() && selectedSegmentCount > 0;

  const handleStartDateSelect = (date: Date | undefined) => {
    if (date) {
      setStartDate(date.toISOString().split('T')[0]!);
      setIsStartDateOpen(false);
    }
  };

  const handleEndDateSelect = (date: Date | undefined) => {
    if (date) {
      setEndDate(date.toISOString().split('T')[0]!);
      setIsEndDateOpen(false);
    }
  };

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setMaxDailyDistance(value);
    }
  };

  const handleElevationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setMaxDailyElevation(value);
    }
  };

  const handlePlanTrip = () => {
    if (isFormValid && onPlanTrip) {
      console.log("[TRIP_CONSTRAINTS_PLAN_TRIP]", {
        constraints,
        selectedSegmentCount,
        tripDays,
        timestamp: new Date().toISOString(),
      });
      onPlanTrip();
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Date Range Picker */}
      <div className="flex items-center gap-2">
        {/* Start Date */}
        <Popover open={isStartDateOpen} onOpenChange={setIsStartDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[140px] justify-start text-left font-normal",
                !constraints.startDate && "text-muted-foreground",
                validationErrors.some(e => e.includes("Start date")) && "border-red-500"
              )}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              {constraints.startDate ? format(startDate, "MMM dd") : "Start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={handleStartDateSelect}
              disabled={(date) => date < new Date() || date > endDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <span className="text-sm text-gray-500">to</span>

        {/* End Date */}
        <Popover open={isEndDateOpen} onOpenChange={setIsEndDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[140px] justify-start text-left font-normal",
                !constraints.endDate && "text-muted-foreground",
                validationErrors.some(e => e.includes("End date")) && "border-red-500"
              )}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              {constraints.endDate ? format(endDate, "MMM dd") : "End date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={handleEndDateSelect}
              disabled={(date) => date < startDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Trip Duration Display */}
        {tripDays > 0 && (
          <span className="text-sm text-gray-600">
            ({tripDays} day{tripDays === 1 ? '' : 's'})
          </span>
        )}
      </div>

      {/* Distance Input */}
      <div className="flex items-center gap-2">
        <label htmlFor="max-distance" className="text-sm font-medium text-gray-700">
          Max km/day:
        </label>
        <Input
          id="max-distance"
          type="number"
          min="20"
          max="300"
          value={constraints.maxDailyDistanceKm}
          onChange={handleDistanceChange}
          className={cn(
            "w-20",
            validationErrors.some(e => e.includes("distance")) && "border-red-500"
          )}
          aria-label="Maximum daily distance in kilometers"
        />
      </div>

      {/* Elevation Input */}
      <div className="flex items-center gap-2">
        <label htmlFor="max-elevation" className="text-sm font-medium text-gray-700">
          Max m/day:
        </label>
        <Input
          id="max-elevation"
          type="number"
          min="200"
          max="5000"
          value={constraints.maxDailyElevationM}
          onChange={handleElevationChange}
          className={cn(
            "w-20",
            validationErrors.some(e => e.includes("elevation")) && "border-red-500"
          )}
          aria-label="Maximum daily elevation in meters"
        />
      </div>

      {/* Plan Trip Button */}
      <Button
        onClick={handlePlanTrip}
        disabled={disabled || !isFormValid}
        className="bg-green-600 hover:bg-green-700"
        title={
          !isFormValid
            ? selectedSegmentCount === 0
              ? "Select segments to plan trip"
              : validationErrors.join(", ")
            : `Plan trip with ${selectedSegmentCount} segments`
        }
      >
        🚴 Plan trip
        {selectedSegmentCount > 0 && (
          <span className="ml-1">({selectedSegmentCount})</span>
        )}
      </Button>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="absolute top-full left-0 mt-1 rounded-md bg-red-50 p-2 text-sm text-red-700 shadow-md z-10">
          <ul className="list-disc list-inside">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
} 