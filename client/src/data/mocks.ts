import type { RouteRequest, RouteResult } from '@/types';
import { REGIONS, TARGETS } from '@/data/mars-data';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3389500;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateIntermediateWaypoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  count: number
): { lat: number; lon: number; elevation: number }[] {
  const waypoints: { lat: number; lon: number; elevation: number }[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const lat = startLat + (endLat - startLat) * t;
    const lon = startLon + (endLon - startLon) * t;
    const baseElev = -2500 + Math.sin(lat * 0.1) * 800 + Math.cos(lon * 0.05) * 500;
    waypoints.push({ lat, lon, elevation: Math.round(baseElev + (Math.random() - 0.5) * 200) });
  }
  return waypoints;
}

export function planRoute(request: RouteRequest): Promise<RouteResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const distance = haversine(request.startLat, request.startLon, request.endLat, request.endLon);
      const baseSpeed = request.vehicleSpeed || 0.1;
      const terrainFactor = request.avoidHazards ? 1.5 : 1.2;
      const estimatedTime = distance / (baseSpeed * terrainFactor) / 60;
      const maxSlope = request.avoidHazards ? Math.min(request.maxSlope, 15) : 25 + Math.random() * 15;
      const avgSlope = maxSlope * 0.6 + Math.random() * 5;
      const hazardCount = request.avoidHazards ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 5);
      const hazardLevel: RouteResult['hazardLevel'] = hazardCount === 0 ? 'low' : hazardCount <= 2 ? 'moderate' : 'high';
      const confidence = request.avoidHazards ? 0.85 + Math.random() * 0.1 : 0.65 + Math.random() * 0.15;
      const waypoints = generateIntermediateWaypoints(
        request.startLat,
        request.startLon,
        request.endLat,
        request.endLon,
        8
      );

      const reasoning = request.avoidHazards
        ? `Route avoids terrain exceeding ${request.maxSlope}° slope. ${hazardCount} minor hazard${hazardCount !== 1 ? 's' : ''} identified and bypassed. Path follows lower-elevation corridors where MOLA data supports safe traverse.`
        : `Direct route computed without hazard avoidance. ${hazardCount} hazard${hazardCount !== 1 ? 's' : ''} along path. Maximum slope ${maxSlope.toFixed(1)}° may exceed nominal rover limits.`;

      resolve({
        id: `route-${Date.now()}`,
        startLat: request.startLat,
        startLon: request.startLon,
        endLat: request.endLat,
        endLon: request.endLon,
        distance: Math.round(distance),
        estimatedTime: Math.round(estimatedTime),
        maxSlope: Math.round(maxSlope * 10) / 10,
        avgSlope: Math.round(avgSlope * 10) / 10,
        hazardCount,
        hazardLevel,
        waypoints,
        confidence: Math.round(confidence * 100) / 100,
        reasoning,
      });
    }, 600 + Math.random() * 400);
  });
}

export function generateRouteAlternatives(request: RouteRequest): Promise<RouteResult[]> {
  return Promise.all([
    planRoute(request),
    planRoute({ ...request, avoidHazards: true, maxSlope: Math.min(request.maxSlope, 12) }),
    planRoute({ ...request, avoidHazards: false, vehicleSpeed: request.vehicleSpeed * 1.3 }),
  ]);
}

const ASSISTANT_FIXTURES: { keywords: string[]; response: string; evidence?: string[]; sources?: string[]; uncertainty?: 'low' | 'medium' | 'high' }[] = [
  {
    keywords: ['interesting', 'target', 'science', 'find'],
    response: '[DEMO FIXTURE] Based on active layers and the selected region, here are scientifically interesting targets nearby. This is demo content, not live mission data.',
    evidence: ['Demo fixture — not from integrated dataset'],
    sources: ['Demo fixture'],
    uncertainty: 'high',
  },
  {
    keywords: ['route', 'path', 'safe', 'traverse', 'travel'],
    response: '[DEMO FIXTURE] Route planning considers terrain slope and vehicle traverse limits. This is demo content, not live mission data.',
    evidence: ['Demo fixture — not from integrated dataset'],
    sources: ['Demo fixture'],
    uncertainty: 'high',
  },
  {
    keywords: ['water', 'ice', 'ice resource', 'isru'],
    response: '[DEMO FIXTURE] Subsurface water ice accessibility claims are general Mars science, not derived from integrated MARSYN data. This is demo content.',
    evidence: ['Demo fixture — not from integrated dataset'],
    sources: ['Demo fixture'],
    uncertainty: 'high',
  },
  {
    keywords: ['hazard', 'danger', 'risk', 'slope', 'steep'],
    response: '[DEMO FIXTURE] Terrain hazard classifications are derived from MOLA elevation data where available. Slopes >15° may be challenging for rover traverse. This is demo content.',
    evidence: ['MOLA-derived slope (demo only)'],
    sources: ['MGS/MOLA (demo)'],
    uncertainty: 'high',
  },
  {
    keywords: ['mineral', 'composition', 'clay', 'sulfate', 'carbonate'],
    response: '[DEMO FIXTURE] Hydrated mineral claims reference published Mars science but are not from MARSYN-integrated datasets. Only MOLA elevation terrain is integrated. This is demo content.',
    evidence: ['Demo fixture — not from integrated dataset'],
    sources: ['Demo fixture'],
    uncertainty: 'high',
  },
  {
    keywords: ['life', 'biosignature', 'organics', 'biology'],
    response: '[DEMO FIXTURE] No confirmed biosignatures have been detected on Mars to date. Organic molecule claims reference published mission science, not MARSYN-integrated data. This is demo content.',
    evidence: ['Demo fixture — not from integrated dataset'],
    sources: ['Demo fixture'],
    uncertainty: 'high',
  },
];

export function queryAssistant(query: string, regionId?: string): Promise<{
  content: string;
  evidence?: string[];
  sources?: string[];
  uncertainty?: 'low' | 'medium' | 'high';
}> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const lowerQuery = query.toLowerCase();
      const match = ASSISTANT_FIXTURES.find((f) => f.keywords.some((k) => lowerQuery.includes(k)));

      if (match) {
        let response = match.response;
        if (regionId) {
          const region = REGIONS.find((r) => r.id === regionId);
          if (region) {
            const regionTargets = TARGETS.filter((t) => t.regionId === regionId);
            response = `In the context of ${region.name}: ${match.response} ${regionTargets.length} known targets are catalogued in this region.`;
          }
        }
        resolve({
          content: response,
          evidence: match.evidence,
          sources: match.sources,
          uncertainty: match.uncertainty,
        });
      } else {
        reject(new Error('No relevant data found for this query. Try asking about targets, routes, hazards, minerals, water ice, or biosignatures.'));
      }
    }, 800 + Math.random() * 600);
  });
}
