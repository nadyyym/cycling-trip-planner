import type { CostMatrix } from "~/server/integrations/mapbox";
import type { SegmentInput } from "~/types/routePlanner";

/**
 * Segment metadata for TSP solving
 */
export interface SegmentForTSP {
  segmentId: number;
  forwardDirection: boolean;
  startWaypointIndex: number; // Index in the waypoint array
  endWaypointIndex: number; // Index in the waypoint array
}

/**
 * TSP solution result
 */
export interface TSPSolution {
  /** Ordered array of segments to visit */
  orderedSegments: SegmentForTSP[];
  /** Total distance of the solution in meters */
  totalDistance: number;
  /** Total duration of the solution in seconds */
  totalDuration: number;
  /** Time taken to solve the TSP in milliseconds */
  solvingTimeMs: number;
  /** Method used to solve (ortools, bruteforce, heuristic) */
  method: "ortools" | "bruteforce" | "heuristic";
}

/**
 * TSP solver error
 */
export class TSPSolverError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TSPSolverError";
  }
}

/**
 * Check if OR-Tools is available
 */
function isOrToolsAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node_or_tools");
    return true;
  } catch (error) {
    console.log(`[TSP_SOLVER_ORTOOLS_UNAVAILABLE]`, {
      error: error instanceof Error ? error.message : "Unknown error",
      fallbackToBruteForce: true,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}

/**
 * OR-Tools VRP instance interface
 */
interface OrToolsVRP {
  addPickupDelivery: (pickup: number, delivery: number) => void;
  solve: (
    options: { timeLimit: number; numSolutions: number },
    callback: (err: Error | null, solution: OrToolsSolution | null) => void,
  ) => void;
}

/**
 * OR-Tools solution interface
 */
interface OrToolsSolution {
  routes: number[][];
  cost: number;
}

/**
 * OR-Tools module interface
 */
interface OrToolsModule {
  VRP: new (config: {
    numVehicles: number;
    depot: number;
    costMatrix: number[][];
  }) => OrToolsVRP;
}

/**
 * Solve TSP using OR-Tools (if available)
 */
async function solveWithOrTools(
  matrix: CostMatrix,
  segments: SegmentForTSP[],
  tripStartIndex?: number,
): Promise<TSPSolution> {
  const solveStart = Date.now();

  try {
    // Attempt to require OR-Tools
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ortools = require("node_or_tools") as OrToolsModule;

    console.log(`[TSP_SOLVER_ORTOOLS_START]`, {
      segmentCount: segments.length,
      waypointCount: matrix.distances.length,
      hasTripStart: tripStartIndex !== undefined,
      timestamp: new Date().toISOString(),
    });

    const vrp = new ortools.VRP({
      numVehicles: 1,
      depot: tripStartIndex ?? 0,
      costMatrix: matrix.distances,
    });

    // Add constraint for each segment: start -> end with zero cost
    // This ensures we visit each segment in the correct direction
    for (const segment of segments) {
      // Force the vehicle to go from segment start to segment end
      // This is done by setting a very high penalty for not following this constraint
      vrp.addPickupDelivery(
        segment.startWaypointIndex,
        segment.endWaypointIndex,
      );
    }

    return new Promise<TSPSolution>((resolve, reject) => {
      vrp.solve(
        {
          timeLimit: 30000, // 30 seconds
          numSolutions: 1,
        },
        (err: Error | null, solution: OrToolsSolution | null) => {
          const solvingTimeMs = Date.now() - solveStart;

          if (err) {
            console.error(`[TSP_SOLVER_ORTOOLS_ERROR]`, {
              error: err.message,
              solvingTimeMs,
              timestamp: new Date().toISOString(),
            });
            reject(new TSPSolverError("OR-Tools solver failed", err));
            return;
          }

          if (!solution?.routes?.[0]) {
            console.error(`[TSP_SOLVER_ORTOOLS_NO_SOLUTION]`, {
              solvingTimeMs,
              timestamp: new Date().toISOString(),
            });
            reject(new TSPSolverError("No solution found by OR-Tools"));
            return;
          }

          const route = solution.routes[0];
          const orderedSegments = extractSegmentOrderFromRoute(route, segments);

          console.log(`[TSP_SOLVER_ORTOOLS_SUCCESS]`, {
            segmentCount: orderedSegments.length,
            totalDistance: solution.cost,
            solvingTimeMs,
            objective: solution.cost,
            timestamp: new Date().toISOString(),
          });

          resolve({
            orderedSegments,
            totalDistance: solution.cost,
            totalDuration: calculateTotalDuration(orderedSegments, matrix),
            solvingTimeMs,
            method: "ortools",
          });
        },
      );
    });
  } catch (error) {
    const solvingTimeMs = Date.now() - solveStart;
    console.error(`[TSP_SOLVER_ORTOOLS_FAILED]`, {
      error: error instanceof Error ? error.message : "Unknown error",
      solvingTimeMs,
      timestamp: new Date().toISOString(),
    });
    throw new TSPSolverError(
      "Failed to initialize OR-Tools",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Extract segment order from OR-Tools route solution
 */
function extractSegmentOrderFromRoute(
  route: number[],
  segments: SegmentForTSP[],
): SegmentForTSP[] {
  const orderedSegments: SegmentForTSP[] = [];

  // The route contains waypoint indices in order
  // We need to match pairs of consecutive waypoints to segments
  for (let i = 0; i < route.length - 1; i++) {
    const fromWaypoint = route[i];
    const toWaypoint = route[i + 1];

    // Find the segment that goes from this waypoint to the next
    const segment = segments.find(
      (seg) =>
        seg.startWaypointIndex === fromWaypoint &&
        seg.endWaypointIndex === toWaypoint,
    );

    if (segment) {
      orderedSegments.push(segment);
    }
  }

  return orderedSegments;
}

/**
 * Fallback brute-force TSP solver for small instances
 */
function solveWithBruteForce(
  matrix: CostMatrix,
  segments: SegmentForTSP[],
  tripStartIndex?: number,
): TSPSolution {
  const solveStart = Date.now();

  console.log(`[TSP_SOLVER_BRUTEFORCE_START]`, {
    segmentCount: segments.length,
    waypointCount: matrix.distances.length,
    hasTripStart: tripStartIndex !== undefined,
    maxFeasibleSegments: 8,
    timestamp: new Date().toISOString(),
  });

  // Brute force is only feasible for small instances
  if (segments.length > 8) {
    throw new TSPSolverError(
      `Brute force solver limited to 8 segments, got ${segments.length}. Consider using heuristic or installing OR-Tools.`,
    );
  }

  let bestSolution: TSPSolution | null = null;
  let bestCost = Infinity;

  // Generate all permutations of segments
  const permutations = generatePermutations(segments);

  console.log(`[TSP_SOLVER_BRUTEFORCE_PERMUTATIONS]`, {
    totalPermutations: permutations.length,
    segmentCount: segments.length,
    timestamp: new Date().toISOString(),
  });

  for (const permutation of permutations) {
    const cost = calculateSolutionCost(permutation, matrix, tripStartIndex);

    if (cost < bestCost) {
      bestCost = cost;
      bestSolution = {
        orderedSegments: permutation,
        totalDistance: cost,
        totalDuration: calculateTotalDuration(permutation, matrix),
        solvingTimeMs: Date.now() - solveStart,
        method: "bruteforce",
      };
    }
  }

  const solvingTimeMs = Date.now() - solveStart;

  if (!bestSolution) {
    throw new TSPSolverError("No valid solution found by brute force");
  }

  bestSolution.solvingTimeMs = solvingTimeMs;

  console.log(`[TSP_SOLVER_BRUTEFORCE_SUCCESS]`, {
    segmentCount: bestSolution.orderedSegments.length,
    totalDistance: bestSolution.totalDistance,
    solvingTimeMs,
    permutationsEvaluated: permutations.length,
    timestamp: new Date().toISOString(),
  });

  return bestSolution;
}

/**
 * Heuristic TSP solver using nearest neighbor algorithm
 */
function solveWithHeuristic(
  matrix: CostMatrix,
  segments: SegmentForTSP[],
  tripStartIndex?: number,
): TSPSolution {
  const solveStart = Date.now();

  console.log(`[TSP_SOLVER_HEURISTIC_START]`, {
    segmentCount: segments.length,
    waypointCount: matrix.distances.length,
    hasTripStart: tripStartIndex !== undefined,
    algorithm: "nearest-neighbor",
    timestamp: new Date().toISOString(),
  });

  const orderedSegments: SegmentForTSP[] = [];
  const remainingSegments = [...segments];

  // Start from trip start or first segment
  let currentWaypointIndex =
    tripStartIndex ?? segments[0]?.startWaypointIndex ?? 0;

  while (remainingSegments.length > 0) {
    let nearestSegment: SegmentForTSP | null = null;
    let nearestDistance = Infinity;

    // Find nearest unvisited segment
    for (const segment of remainingSegments) {
      const distanceToStart =
        matrix.distances[currentWaypointIndex]?.[segment.startWaypointIndex] ??
        Infinity;

      if (distanceToStart < nearestDistance) {
        nearestDistance = distanceToStart;
        nearestSegment = segment;
      }
    }

    if (!nearestSegment) {
      throw new TSPSolverError(
        "No reachable segment found in heuristic solver",
      );
    }

    // Add the nearest segment to the solution
    orderedSegments.push(nearestSegment);

    // Remove from remaining segments
    const index = remainingSegments.indexOf(nearestSegment);
    remainingSegments.splice(index, 1);

    // Move to the end of this segment
    currentWaypointIndex = nearestSegment.endWaypointIndex;
  }

  const solvingTimeMs = Date.now() - solveStart;
  const totalDistance = calculateSolutionCost(
    orderedSegments,
    matrix,
    tripStartIndex,
  );

  console.log(`[TSP_SOLVER_HEURISTIC_SUCCESS]`, {
    segmentCount: orderedSegments.length,
    totalDistance,
    solvingTimeMs,
    algorithm: "nearest-neighbor",
    timestamp: new Date().toISOString(),
  });

  return {
    orderedSegments,
    totalDistance,
    totalDuration: calculateTotalDuration(orderedSegments, matrix),
    solvingTimeMs,
    method: "heuristic",
  };
}

/**
 * Generate all permutations of an array
 */
function generatePermutations<T>(arr: T[]): T[][] {
  if (arr.length === 0) return [[]];
  if (arr.length === 1) return [arr];

  const result: T[][] = [];

  for (let i = 0; i < arr.length; i++) {
    const current = arr[i]!;
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const perms = generatePermutations(remaining);

    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }

  return result;
}

/**
 * Calculate the total cost of a solution
 */
function calculateSolutionCost(
  segmentOrder: SegmentForTSP[],
  matrix: CostMatrix,
  tripStartIndex?: number,
): number {
  if (segmentOrder.length === 0) return 0;

  let totalCost = 0;
  let currentWaypointIndex =
    tripStartIndex ?? segmentOrder[0]?.startWaypointIndex ?? 0;

  for (const segment of segmentOrder) {
    // Cost to get to the start of this segment
    const costToSegmentStart =
      matrix.distances[currentWaypointIndex]?.[segment.startWaypointIndex] ?? 0;
    totalCost += costToSegmentStart;

    // Cost within the segment (start -> end) - this should be 0 for forced edges
    const segmentInternalCost =
      matrix.distances[segment.startWaypointIndex]?.[
        segment.endWaypointIndex
      ] ?? 0;
    totalCost += segmentInternalCost;

    // Move to the end of this segment
    currentWaypointIndex = segment.endWaypointIndex;
  }

  return totalCost;
}

/**
 * Calculate total duration of a solution
 */
function calculateTotalDuration(
  segmentOrder: SegmentForTSP[],
  matrix: CostMatrix,
): number {
  if (segmentOrder.length === 0) return 0;

  let totalDuration = 0;
  let currentWaypointIndex = segmentOrder[0]?.startWaypointIndex ?? 0;

  for (const segment of segmentOrder) {
    // Duration to get to the start of this segment
    const durationToSegmentStart =
      matrix.durations[currentWaypointIndex]?.[segment.startWaypointIndex] ?? 0;
    totalDuration += durationToSegmentStart;

    // Duration within the segment
    const segmentInternalDuration =
      matrix.durations[segment.startWaypointIndex]?.[
        segment.endWaypointIndex
      ] ?? 0;
    totalDuration += segmentInternalDuration;

    // Move to the end of this segment
    currentWaypointIndex = segment.endWaypointIndex;
  }

  return totalDuration;
}

/**
 * Main TSP solver function that chooses the best available method
 * Tries OR-Tools first, falls back to brute force for small instances,
 * or uses heuristic for larger instances
 *
 * @param matrix Cost matrix from Mapbox Matrix API
 * @param segments Array of segments to visit in order
 * @param tripStartIndex Optional starting waypoint index
 * @returns Optimized segment order with cost and timing information
 */
export async function solveOrderedSegments(
  matrix: CostMatrix,
  segments: SegmentInput[],
  tripStartIndex?: number,
): Promise<TSPSolution> {
  const totalStart = Date.now();

  console.log(`[TSP_SOLVER_START]`, {
    segmentCount: segments.length,
    waypointCount: matrix.distances.length,
    hasTripStart: tripStartIndex !== undefined,
    timestamp: new Date().toISOString(),
  });

  // Validate inputs
  if (segments.length === 0) {
    throw new TSPSolverError("No segments provided to TSP solver");
  }

  if (segments.length > 10) {
    throw new TSPSolverError(
      `Too many segments for TSP solver: ${segments.length}. Maximum is 10.`,
    );
  }

  // Convert segments to TSP format with waypoint indices
  const tspSegments: SegmentForTSP[] = segments.map((segment, index) => {
    const baseIndex = tripStartIndex !== undefined ? 1 : 0; // Account for trip start taking index 0
    const startIndex = baseIndex + index * 2;
    const endIndex = baseIndex + index * 2 + 1;

    return {
      segmentId: segment.segmentId,
      forwardDirection: segment.forwardDirection,
      startWaypointIndex: startIndex,
      endWaypointIndex: endIndex,
    };
  });

  // Validate waypoint indices are within matrix bounds
  const maxWaypointIndex = Math.max(
    ...tspSegments.flatMap((seg) => [
      seg.startWaypointIndex,
      seg.endWaypointIndex,
    ]),
  );

  if (maxWaypointIndex >= matrix.distances.length) {
    throw new TSPSolverError(
      `Waypoint index ${maxWaypointIndex} exceeds matrix size ${matrix.distances.length}`,
    );
  }

  let solution: TSPSolution;

  // Try OR-Tools first if available
  if (isOrToolsAvailable()) {
    try {
      solution = await solveWithOrTools(matrix, tspSegments, tripStartIndex);
    } catch (error) {
      console.warn(`[TSP_SOLVER_ORTOOLS_FALLBACK]`, {
        error: error instanceof Error ? error.message : "Unknown error",
        fallbackMethod: segments.length <= 8 ? "bruteforce" : "heuristic",
        timestamp: new Date().toISOString(),
      });

      // Fall back to brute force or heuristic
      if (segments.length <= 8) {
        solution = solveWithBruteForce(matrix, tspSegments, tripStartIndex);
      } else {
        solution = solveWithHeuristic(matrix, tspSegments, tripStartIndex);
      }
    }
  } else {
    // Use fallback method based on problem size
    if (segments.length <= 8) {
      solution = solveWithBruteForce(matrix, tspSegments, tripStartIndex);
    } else {
      solution = solveWithHeuristic(matrix, tspSegments, tripStartIndex);
    }
  }

  const totalTimeMs = Date.now() - totalStart;

  console.log(`[TSP_SOLVER_COMPLETE]`, {
    segmentCount: solution.orderedSegments.length,
    totalDistance: solution.totalDistance,
    totalDuration: solution.totalDuration,
    solvingTimeMs: solution.solvingTimeMs,
    totalTimeMs,
    method: solution.method,
    runtimeMs: solution.solvingTimeMs,
    withinTimeLimit: solution.solvingTimeMs <= 500,
    timestamp: new Date().toISOString(),
  });

  // Log the final segment order for debugging
  console.log(`[TSP_SOLVER_SEGMENT_ORDER]`, {
    order: solution.orderedSegments.map((seg, index) => ({
      position: index + 1,
      segmentId: seg.segmentId,
      direction: seg.forwardDirection ? "forward" : "reverse",
      waypointRange: `${seg.startWaypointIndex}->${seg.endWaypointIndex}`,
    })),
    timestamp: new Date().toISOString(),
  });

  return solution;
}
