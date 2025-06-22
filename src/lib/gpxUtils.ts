import JSZip from 'jszip';

/**
 * Route data structure for GPX generation
 */
export interface RouteForGPX {
  dayNumber: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  distanceKm: number;
  elevationGainM: number; // Legacy field for backward compatibility
  ascentM: number;
  descentM: number;
  segmentNames: string[];
  // Optional locality names for better filename generation
  startLocality?: string;
  endLocality?: string;
  dayName?: string; // Full formatted day name from saved trip data
}

/**
 * Generate GPX content from route geometry
 */
export function generateGPX(route: RouteForGPX, fileName: string): string {
  const now = new Date().toISOString();
  
  // Create track points from coordinates
  const trackPoints = route.geometry.coordinates
    .map(([lng, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
    .join('\n');

  // Use locality information in description if available
  const localityInfo = route.startLocality && route.endLocality 
    ? ` from ${route.startLocality} to ${route.endLocality}`
    : '';

  const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cycling Trip Planner" 
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"
     xmlns="http://www.topografix.com/GPX/1/1" 
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <name>${fileName}</name>
    <desc>Cycling route for Day ${route.dayNumber}${localityInfo} - Distance: ${Math.round(route.distanceKm)}km, Ascent: ${Math.round(route.ascentM)}m, Descent: ${Math.round(route.descentM)}m</desc>
    <author>
      <name>Cycling Trip Planner</name>
    </author>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>Day ${route.dayNumber}${localityInfo}</name>
    <desc>Segments: ${route.segmentNames.join(', ')}</desc>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;

  return gpxContent;
}

/**
 * Generate a human-readable filename for a daily route GPX
 * Uses locality names when available, falls back to coordinates/segments
 */
export function generateGPXFileName(route: RouteForGPX, tripStartDate?: Date): string {
  // If we have a pre-formatted day name from saved trip data, use it
  if (route.dayName) {
    const datePrefix = tripStartDate ? formatDateForFilename(tripStartDate, route.dayNumber) : null;
    return datePrefix ? `${datePrefix} – ${route.dayName}` : route.dayName;
  }

  // Use locality names if available
  if (route.startLocality && route.endLocality) {
    const distanceKm = Math.round(route.distanceKm);
    const dayName = `Day ${route.dayNumber} – ${route.startLocality} - ${route.endLocality} – ${distanceKm} km`;
    const datePrefix = tripStartDate ? formatDateForFilename(tripStartDate, route.dayNumber) : null;
    return datePrefix ? `${datePrefix} – ${dayName}` : dayName;
  }

  // Fallback to original logic with coordinates and segment names
  const startCoord = route.geometry.coordinates[0];
  const endCoord = route.geometry.coordinates[route.geometry.coordinates.length - 1];
  
  if (!startCoord || !endCoord) {
    return `Day ${route.dayNumber}`;
  }

  // If we have segment names, use the first and last for context
  if (route.segmentNames.length > 0) {
    const firstSegment = route.segmentNames[0]?.replace(/[^a-zA-Z0-9\s-]/g, '').trim().substring(0, 20);
    const lastSegment = route.segmentNames[route.segmentNames.length - 1]?.replace(/[^a-zA-Z0-9\s-]/g, '').trim().substring(0, 20);
    
    if (firstSegment && lastSegment && firstSegment !== lastSegment) {
      return `Day ${route.dayNumber} – ${firstSegment} to ${lastSegment}`;
    } else if (firstSegment) {
      return `Day ${route.dayNumber} – ${firstSegment}`;
    }
  }
  
  // Fallback to coordinate-based naming
  const startLat = startCoord[1].toFixed(2);
  const startLng = startCoord[0].toFixed(2);
  const endLat = endCoord[1].toFixed(2);
  const endLng = endCoord[0].toFixed(2);
  
  return `Day ${route.dayNumber} – ${startLat},${startLng} to ${endLat},${endLng}`;
}

/**
 * Format date for filename with day offset
 * @param startDate - Trip start date
 * @param dayNumber - Day number (1-based)
 * @returns Formatted date string (YYYY-MM-DD)
 */
function formatDateForFilename(startDate: Date, dayNumber: number): string {
  const dayDate = new Date(startDate);
  dayDate.setDate(dayDate.getDate() + (dayNumber - 1));
  const dateString = dayDate.toISOString().split('T')[0];
  return dateString ?? ''; // Ensure we always return a string
}

/**
 * Create and download a ZIP file containing all route GPX files
 * This function only works in browser environments
 */
export async function downloadRoutesAsZip(routes: RouteForGPX[], tripStartDate?: Date): Promise<void> {
  // Ensure this only runs in browser
  if (typeof window === 'undefined') {
    throw new Error('GPX download is only available in browser environments');
  }

  console.log('[GPX_DOWNLOAD_START]', {
    routeCount: routes.length,
    tripStartDate: tripStartDate?.toISOString(),
    timestamp: new Date().toISOString(),
  });

  try {
    const zip = new JSZip();

    // Generate GPX files for each route
    for (const route of routes) {
      try {
        const fileName = generateGPXFileName(route, tripStartDate);
        const gpxContent = generateGPX(route, fileName);
        
        // Add to ZIP with .gpx extension
        zip.file(`${fileName}.gpx`, gpxContent);
        
        console.log('[GPX_FILE_GENERATED]', {
          dayNumber: route.dayNumber,
          fileName: `${fileName}.gpx`,
          startLocality: route.startLocality,
          endLocality: route.endLocality,
          coordinateCount: route.geometry.coordinates.length,
          distanceKm: Math.round(route.distanceKm),
          elevationGainM: Math.round(route.elevationGainM),
          ascentM: Math.round(route.ascentM),
          descentM: Math.round(route.descentM),
        });
      } catch (error) {
        console.error(`[GPX_ERROR] Failed to generate GPX for Day ${route.dayNumber}:`, error);
        
        // Fallback filename if anything fails
        const fallbackFileName = `Day ${route.dayNumber}`;
        const gpxContent = generateGPX(route, fallbackFileName);
        zip.file(`${fallbackFileName}.gpx`, gpxContent);
      }
    }

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Create download link with better filename
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    
    // Use trip date in ZIP filename if available
    const datePrefix = tripStartDate ? tripStartDate.toISOString().split('T')[0] : 'cycling-trip';
    link.download = `${datePrefix}-routes-${routes.length}-days.zip`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    console.log('[GPX_DOWNLOAD_SUCCESS]', {
      fileName: link.download,
      routeCount: routes.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GPX_DOWNLOAD_ERROR]', error);
    
    // Provide a more specific error message
    if (error instanceof Error) {
      throw new Error(`GPX download failed: ${error.message}`);
    } else {
      throw new Error('Failed to generate or download ZIP file');
    }
  }
} 