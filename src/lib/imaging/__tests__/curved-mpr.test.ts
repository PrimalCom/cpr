import { describe, expect, it } from 'vitest'
import {
  
  
  generateCurvedMPR,
  validateMPRConfig
} from '../curved-mpr'
import type {CurvedMPRConfig, VolumeData} from '../curved-mpr';
import type { CenterlinePoint } from '../centerline'

/**
 * Creates a simple test volume with known HU values
 * The volume is a 10x10x10 cube with values equal to voxel index
 */
function createTestVolume(
  dims: [number, number, number] = [10, 10, 10],
  spacing: [number, number, number] = [1.0, 1.0, 1.0],
): VolumeData {
  const totalVoxels = dims[0] * dims[1] * dims[2]
  const data = new Int16Array(totalVoxels)
  for (let i = 0; i < totalVoxels; i++) {
    data[i] = i % 1000 // Fill with sequential values
  }
  return {
    dimensions: dims,
    spacing,
    origin: [0, 0, 0],
    data,
  }
}

/**
 * Creates a simple straight centerline along the X axis
 */
function createStraightCenterline(
  length: number,
  interval: number = 0.5,
): Array<CenterlinePoint> {
  const numPoints = Math.ceil(length / interval) + 1
  const points: Array<CenterlinePoint> = []
  for (let i = 0; i < numPoints; i++) {
    const distance = Math.min(i * interval, length)
    points.push({
      x: distance,
      y: 5, // Center of volume
      z: 5,
      distance,
    })
  }
  return points
}

describe('curved-mpr', () => {
  describe('generateCurvedMPR', () => {
    it('should generate a volume with correct dimensions', () => {
      const volume = createTestVolume()
      const centerline = createStraightCenterline(8)

      const mpr = generateCurvedMPR(volume, centerline, {
        planeWidth: 4,
        planeHeight: 4,
        planeResolution: 1.0,
      })

      // Width: ceil(4 / 1.0) = 4 pixels
      // Height: ceil(4 / 1.0) = 4 pixels
      // Slices: centerline.length points
      expect(mpr.dimensions[0]).toBe(4)
      expect(mpr.dimensions[1]).toBe(4)
      expect(mpr.dimensions[2]).toBe(centerline.length)
    })

    it('should return volume data as Int16Array', () => {
      const volume = createTestVolume()
      const centerline = createStraightCenterline(5)

      const mpr = generateCurvedMPR(volume, centerline, {
        planeWidth: 4,
        planeHeight: 4,
        planeResolution: 1.0,
      })

      expect(mpr.data).toBeInstanceOf(Int16Array)
      expect(mpr.data.length).toBe(
        mpr.dimensions[0] * mpr.dimensions[1] * mpr.dimensions[2],
      )
    })

    it('should throw with fewer than 2 centerline points', () => {
      const volume = createTestVolume()
      const centerline: Array<CenterlinePoint> = [{ x: 0, y: 5, z: 5, distance: 0 }]

      expect(() => generateCurvedMPR(volume, centerline)).toThrow(
        'at least 2 points',
      )
    })

    it('should include centerline points and total length in result', () => {
      const volume = createTestVolume()
      const centerline = createStraightCenterline(5)

      const mpr = generateCurvedMPR(volume, centerline)

      expect(mpr.centerlinePoints).toBe(centerline)
      expect(mpr.totalLength).toBe(centerline[centerline.length - 1].distance)
    })

    it('should use correct spacing values from config', () => {
      const volume = createTestVolume()
      const centerline = createStraightCenterline(5)

      const mpr = generateCurvedMPR(volume, centerline, {
        planeResolution: 0.5,
        samplingInterval: 0.5,
      })

      expect(mpr.spacing[0]).toBe(0.5) // planeResolution
      expect(mpr.spacing[1]).toBe(0.5) // planeResolution
      expect(mpr.spacing[2]).toBe(0.5) // samplingInterval
    })

    it('should initialize out-of-bounds voxels to -1024 (air)', () => {
      // Create a small volume with centerline extending beyond bounds
      const volume = createTestVolume([5, 5, 5])
      const centerline: Array<CenterlinePoint> = [
        { x: -10, y: 2.5, z: 2.5, distance: 0 },
        { x: -5, y: 2.5, z: 2.5, distance: 5 },
      ]

      const mpr = generateCurvedMPR(volume, centerline, {
        planeWidth: 2,
        planeHeight: 2,
        planeResolution: 1.0,
      })

      // All voxels should be -1024 since centerline is outside volume
      for (const voxel of mpr.data) {
        expect(voxel).toBe(-1024)
      }
    })
  })

  describe('validateMPRConfig', () => {
    it('should accept valid default config', () => {
      const result = validateMPRConfig({})
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should accept valid custom config', () => {
      const config: CurvedMPRConfig = {
        samplingInterval: 1.0,
        planeWidth: 30,
        planeHeight: 30,
        planeResolution: 0.5,
      }
      const result = validateMPRConfig(config)
      expect(result.valid).toBe(true)
    })

    it('should reject invalid sampling interval', () => {
      const result = validateMPRConfig({ samplingInterval: -1 })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Sampling interval'))).toBe(
        true,
      )
    })

    it('should reject sampling interval > 2.0', () => {
      const result = validateMPRConfig({ samplingInterval: 3.0 })
      expect(result.valid).toBe(false)
    })

    it('should reject invalid plane width', () => {
      const result = validateMPRConfig({ planeWidth: -5 })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Plane width'))).toBe(true)
    })

    it('should reject invalid plane height', () => {
      const result = validateMPRConfig({ planeHeight: 150 })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Plane height'))).toBe(true)
    })

    it('should reject invalid plane resolution', () => {
      const result = validateMPRConfig({ planeResolution: 0 })
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Plane resolution'))).toBe(
        true,
      )
    })

    it('should collect multiple errors', () => {
      const result = validateMPRConfig({
        samplingInterval: -1,
        planeWidth: -5,
        planeHeight: 200,
        planeResolution: 0,
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })
  })
})
