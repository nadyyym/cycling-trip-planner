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
  elevationGainM: number;
  segmentNames: string[];
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

  const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cycling Trip Planner" 
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"
     xmlns="http://www.topografix.com/GPX/1/1" 
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <metadata>
    <name>${fileName}</name>
    <desc>Cycling route for Day ${route.dayNumber} - Distance: ${Math.round(route.distanceKm)}km, Elevation: ${Math.round(route.elevationGainM)}m</desc>
    <author>
      <name>Cycling Trip Planner</name>
    </author>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>Day ${route.dayNumber}</name>
    <desc>Segments: ${route.segmentNames.join(', ')}</desc>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;

  return gpxContent;
}

/**
 * Generate a simple filename for a daily route GPX based on coordinates
 */
export function generateGPXFileName(route: RouteForGPX): string {
  const startCoord = route.geometry.coordinates[0];
  const endCoord = route.geometry.coordinates[route.geometry.coordinates.length - 1];
  
  if (!startCoord || !endCoord) {
    return `Day ${route.dayNumber}`;
  }

  // Create a simple filename using coordinates and segment names
  const startLat = startCoord[1].toFixed(2);
  const startLng = startCoord[0].toFixed(2);
  const endLat = endCoord[1].toFixed(2);
  const endLng = endCoord[0].toFixed(2);
  
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
  return `Day ${route.dayNumber} – ${startLat},${startLng} to ${endLat},${endLng}`;
}

/**
 * Create and download a ZIP file containing all route GPX files
 */
export async function downloadRoutesAsZip(routes: RouteForGPX[]): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  console.log('[GPX_DOWNLOAD_START]', {
    routeCount: routes.length,
    timestamp: new Date().toISOString(),
  });

  // Generate GPX files for each route
  for (const route of routes) {
    try {
      const fileName = generateGPXFileName(route);
      const gpxContent = generateGPX(route, fileName);
      
      // Add to ZIP with .gpx extension
      zip.file(`${fileName}.gpx`, gpxContent);
      
      console.log('[GPX_FILE_GENERATED]', {
        dayNumber: route.dayNumber,
        fileName: `${fileName}.gpx`,
        coordinateCount: route.geometry.coordinates.length,
        distanceKm: Math.round(route.distanceKm),
        elevationGainM: Math.round(route.elevationGainM),
      });
    } catch (error) {
      console.error(`[GPX_ERROR] Failed to generate GPX for Day ${route.dayNumber}:`, error);
      
      // Fallback filename if anything fails
      const fallbackFileName = `Day ${route.dayNumber}`;
      const gpxContent = generateGPX(route, fallbackFileName);
      zip.file(`${fallbackFileName}.gpx`, gpxContent);
    }
  }

  try {
    // Generate ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Create download link
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cycling-trip-routes-${routes.length}-days.zip`;
    
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
    throw new Error('Failed to generate or download ZIP file');
  }
} 