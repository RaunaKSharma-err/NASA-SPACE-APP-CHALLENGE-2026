import { describe, it, expect } from 'vitest';
import { backendRegionToRegion, backendDatasetToLayer } from '@/lib/api-client';
import type { BackendRegion, BackendDataset } from '@/types';

describe('backendRegionToRegion', () => {
  it('converts a backend Region to a frontend Region', () => {
    const backend: BackendRegion = {
      id: 'gale-crater',
      name: 'Gale Crater',
      bbox: [137.0, -5.0, 138.0, -4.0],
      description: 'Test crater',
      layer_ids: ['mola-elevation'],
      terrain_dataset_id: 'mola-megdr',
      status: 'verified',
    };

    const result = backendRegionToRegion(backend);

    expect(result.id).toBe('gale-crater');
    expect(result.name).toBe('Gale Crater');
    expect(result.fullName).toBe('Gale Crater');
    expect(result.lat).toBeCloseTo(-4.5);
    expect(result.lon).toBeCloseTo(137.5);
    expect(result.description).toBe('Test crater');
    expect(result.missionStatus).toBe('active');
    expect(result.hazardLevel).toBe('moderate');
  });

  it('maps synthetic status to candidate mission status', () => {
    const backend: BackendRegion = {
      id: 'synthetic-demo',
      name: 'Synthetic Demo',
      bbox: [0, 0, 10, 10],
      description: 'Synthetic',
      layer_ids: [],
      terrain_dataset_id: null,
      status: 'synthetic',
    };

    const result = backendRegionToRegion(backend);

    expect(result.missionStatus).toBe('candidate');
    expect(result.hazardLevel).toBe('extreme');
  });

  it('handles unverified status', () => {
    const backend: BackendRegion = {
      id: 'test-region',
      name: 'Test',
      bbox: [0, 0, 5, 5],
      description: '',
      layer_ids: [],
      terrain_dataset_id: null,
      status: 'unverified',
    };

    const result = backendRegionToRegion(backend);

    expect(result.missionStatus).toBe('proposed');
    expect(result.hazardLevel).toBe('moderate');
  });

  it('uses default description when backend description is empty', () => {
    const backend: BackendRegion = {
      id: 'test-region',
      name: 'Test',
      bbox: [0, 0, 5, 5],
      description: '',
      layer_ids: [],
      terrain_dataset_id: null,
      status: 'verified',
    };

    const result = backendRegionToRegion(backend);

    expect(result.description).toContain('Test');
  });
});

describe('backendDatasetToLayer', () => {
  it('converts a verified backend dataset to an available DataLayer', () => {
    const backend: BackendDataset = {
      id: 'mola-megdr',
      name: 'MOLA Elevation',
      authoritative_source: 'MGS/MOLA',
      access_url: null,
      format: 'Esri ASCII Grid',
      crs: 'Simple cylindrical',
      coverage: 'Global Mars',
      resolution: '463 m/pixel',
      units: 'metres',
      license: 'CC0',
      storage_estimate_mb: 2000,
      processing_steps: ['download', 'clip'],
      limitations: ['coarse resolution'],
      status: 'verified',
      verified_on: '2026-10-25',
      terrain_file: 'region.asc',
    };

    const result = backendDatasetToLayer(backend);

    expect(result.id).toBe('mola-megdr');
    expect(result.name).toBe('MOLA Elevation');
    expect(result.source).toBe('MGS/MOLA');
    expect(result.available).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.loading).toBe(false);
    expect(result.visible).toBe(false);
    expect(result.type).toBe('elevation');
  });

  it('maps unverified dataset to unavailable layer', () => {
    const backend: BackendDataset = {
      id: 'test-ds',
      name: 'Test Dataset',
      authoritative_source: 'MRO/CRISM',
      access_url: null,
      format: 'Hyperspectral',
      crs: null,
      coverage: 'Test region',
      resolution: null,
      units: null,
      license: null,
      storage_estimate_mb: null,
      processing_steps: [],
      limitations: [],
      status: 'unverified',
      verified_on: null,
      terrain_file: null,
    };

    const result = backendDatasetToLayer(backend);

    expect(result.available).toBe(false);
    expect(result.type).toBe('composition');
  });

  it('maps synthetic dataset to unavailable layer', () => {
    const backend: BackendDataset = {
      id: 'synthetic-ds',
      name: 'Synthetic',
      authoritative_source: 'Unknown',
      access_url: null,
      format: 'Unknown',
      crs: null,
      coverage: 'Synthetic',
      resolution: null,
      units: null,
      license: null,
      storage_estimate_mb: null,
      processing_steps: [],
      limitations: ['synthetic'],
      status: 'synthetic',
      verified_on: null,
      terrain_file: null,
    };

    const result = backendDatasetToLayer(backend);

    expect(result.available).toBe(false);
    expect(result.visible).toBe(false);
  });
});
