import { describe, it, expect } from 'vitest';
import { planRoute, generateRouteAlternatives, queryAssistant } from '@/data/mocks';

describe('planRoute', () => {
  it('returns a route result with required fields', async () => {
    const result = await planRoute({
      startLat: -4.59,
      startLon: 137.44,
      endLat: 18.43,
      endLon: 77.70,
      avoidHazards: true,
      maxSlope: 15,
      vehicleSpeed: 0.1,
      regionId: 'gale-crater',
    });

    expect(result.distance).toBeGreaterThan(0);
    expect(result.estimatedTime).toBeGreaterThan(0);
    expect(result.waypoints.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(['low', 'moderate', 'high']).toContain(result.hazardLevel);
  });

  it('generates waypoints between start and end', async () => {
    const result = await planRoute({
      startLat: 0,
      startLon: 0,
      endLat: 10,
      endLon: 10,
      avoidHazards: false,
      maxSlope: 20,
      vehicleSpeed: 0.1,
      regionId: 'gale-crater',
    });

    expect(result.waypoints[0].lat).toBeCloseTo(0);
    expect(result.waypoints[result.waypoints.length - 1].lat).toBeCloseTo(10);
  });
});

describe('generateRouteAlternatives', () => {
  it('returns multiple route options', async () => {
    const routes = await generateRouteAlternatives({
      startLat: -4.59,
      startLon: 137.44,
      endLat: 18.43,
      endLon: 77.70,
      avoidHazards: true,
      maxSlope: 15,
      vehicleSpeed: 0.1,
      regionId: 'gale-crater',
    });

    expect(routes.length).toBeGreaterThanOrEqual(2);
    routes.forEach((r) => {
      expect(r.distance).toBeGreaterThan(0);
      expect(r.waypoints.length).toBeGreaterThan(0);
    });
  });
});

describe('queryAssistant', () => {
  it('returns a response for science-related queries', async () => {
    const result = await queryAssistant('Find interesting science targets', 'gale-crater');
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(10);
  });

  it('includes evidence and sources for matching queries', async () => {
    const result = await queryAssistant('Where is water ice accessible?', 'hellas-basin');
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.length).toBeGreaterThan(0);
    expect(result.sources).toBeDefined();
  });

  it('rejects for unrecognized queries', async () => {
    await expect(queryAssistant('asdfjkl')).rejects.toThrow();
  });

  it('includes region name in response when regionId provided', async () => {
    const result = await queryAssistant('What are the hazards here?', 'jezero-crater');
    expect(result.content).toContain('Jezero Crater');
  });
});
