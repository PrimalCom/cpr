import { describe, expect, it } from 'vitest'
import {
  
  
  calculateArea,
  calculateCentroid,
  calculateDiameters,
  calculateHUStatistics,
  calculateLumenArea,
  calculateVesselWallArea,
  computeAllMeasurements,
  extractContour,
  quantifyPlaque
} from '../measurements'
import type {CrossSectionImage, CrossSectionSegmentation} from '../measurements';

/**
 * Creates a circular lumen mask centered in the image
 */
function createCircularMask(
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= radius * radius) {
        mask[x + y * width] = 1
      }
    }
  }
  return mask
}

describe('measurements', () => {
  describe('calculateArea', () => {
    it('should calculate area from pixel count and spacing', () => {
      const mask = new Uint8Array(100)
      mask.fill(1, 0, 25) // 25 pixels inside
      const result = calculateArea(mask, [10, 10], [0.5, 0.5])

      // 25 pixels * (0.5 * 0.5) mm² per pixel = 6.25 mm²
      expect(result.value).toBeCloseTo(6.25)
      expect(result.pixelCount).toBe(25)
      expect(result.unit).toBe('mm²')
    })

    it('should return zero area for empty mask', () => {
      const mask = new Uint8Array(100)
      const result = calculateArea(mask, [10, 10], [1.0, 1.0])

      expect(result.value).toBe(0)
      expect(result.pixelCount).toBe(0)
    })

    it('should account for non-square spacing', () => {
      const mask = new Uint8Array(4)
      mask.fill(1) // All 4 pixels inside
      const result = calculateArea(mask, [2, 2], [0.5, 1.0])

      // 4 pixels * (0.5 * 1.0) = 2.0 mm²
      expect(result.value).toBeCloseTo(2.0)
    })
  })

  describe('calculateLumenArea', () => {
    it('should calculate lumen area from circular segmentation', () => {
      const width = 20
      const height = 20
      const radius = 5
      const lumenMask = createCircularMask(width, height, 10, 10, radius)

      const seg: CrossSectionSegmentation = {
        dimensions: [width, height],
        spacing: [1.0, 1.0],
        lumenMask,
      }

      const result = calculateLumenArea(seg)
      // Approximate circle area: π * r² ≈ 78.5, discrete should be close
      expect(result.value).toBeGreaterThan(60)
      expect(result.value).toBeLessThan(90)
      expect(result.unit).toBe('mm²')
    })
  })

  describe('calculateVesselWallArea', () => {
    it('should return null when no vessel wall mask provided', () => {
      const seg: CrossSectionSegmentation = {
        dimensions: [10, 10],
        spacing: [1.0, 1.0],
        lumenMask: new Uint8Array(100),
      }
      expect(calculateVesselWallArea(seg)).toBeNull()
    })

    it('should calculate vessel wall area when mask provided', () => {
      const mask = new Uint8Array(100)
      mask.fill(1, 0, 30) // 30 wall pixels

      const seg: CrossSectionSegmentation = {
        dimensions: [10, 10],
        spacing: [0.5, 0.5],
        lumenMask: new Uint8Array(100),
        vesselWallMask: mask,
      }

      const result = calculateVesselWallArea(seg)
      expect(result).not.toBeNull()
      expect(result!.value).toBeCloseTo(30 * 0.25)
      expect(result!.pixelCount).toBe(30)
    })
  })

  describe('calculateDiameters', () => {
    it('should return zero diameters for insufficient contour', () => {
      const seg: CrossSectionSegmentation = {
        dimensions: [10, 10],
        spacing: [1.0, 1.0],
        lumenMask: new Uint8Array(100), // all zeros = no contour
      }

      const result = calculateDiameters(seg)
      expect(result.min).toBe(0)
      expect(result.max).toBe(0)
      expect(result.mean).toBe(0)
      expect(result.unit).toBe('mm')
    })

    it('should compute diameters for a circular mask', () => {
      const width = 40
      const height = 40
      const radius = 10
      const lumenMask = createCircularMask(width, height, 20, 20, radius)

      const seg: CrossSectionSegmentation = {
        dimensions: [width, height],
        spacing: [1.0, 1.0],
        lumenMask,
      }

      const result = calculateDiameters(seg)
      // For a circle with radius 10, diameter ~ 20
      expect(result.min).toBeGreaterThan(15)
      expect(result.max).toBeLessThan(25)
      expect(result.mean).toBeGreaterThan(15)
    })
  })

  describe('calculateHUStatistics', () => {
    it('should compute correct stats for known values', () => {
      const width = 4
      const height = 4
      const data = new Int16Array([
        100, 200, 300, 400, 100, 200, 300, 400, 100, 200, 300, 400, 100, 200,
        300, 400,
      ])
      const mask = new Uint8Array(16)
      mask.fill(1) // All pixels

      const image: CrossSectionImage = {
        dimensions: [width, height],
        spacing: [1.0, 1.0],
        data,
      }

      const stats = calculateHUStatistics(image, mask)
      expect(stats.mean).toBe(250) // (100+200+300+400)*4/16 = 250
      expect(stats.min).toBe(100)
      expect(stats.max).toBe(400)
      expect(stats.pixelCount).toBe(16)
      expect(stats.unit).toBe('HU')
    })

    it('should return zeros for empty mask', () => {
      const image: CrossSectionImage = {
        dimensions: [4, 4],
        spacing: [1.0, 1.0],
        data: new Int16Array(16),
      }
      const mask = new Uint8Array(16) // all zeros

      const stats = calculateHUStatistics(image, mask)
      expect(stats.mean).toBe(0)
      expect(stats.pixelCount).toBe(0)
    })

    it('should compute standard deviation correctly', () => {
      const data = new Int16Array([10, 20, 30, 40])
      const mask = new Uint8Array([1, 1, 1, 1])

      const image: CrossSectionImage = {
        dimensions: [4, 1],
        spacing: [1.0, 1.0],
        data,
      }

      const stats = calculateHUStatistics(image, mask)
      // mean = 25, variance = ((15² + 5² + 5² + 15²)/4) = (225+25+25+225)/4 = 125
      // std = sqrt(125) ≈ 11.18
      expect(stats.mean).toBe(25)
      expect(stats.std).toBeCloseTo(11.18, 1)
    })
  })

  describe('quantifyPlaque', () => {
    it('should return null when no vessel wall mask', () => {
      const image: CrossSectionImage = {
        dimensions: [10, 10],
        spacing: [1.0, 1.0],
        data: new Int16Array(100),
      }
      const seg: CrossSectionSegmentation = {
        dimensions: [10, 10],
        spacing: [1.0, 1.0],
        lumenMask: new Uint8Array(100),
      }

      expect(quantifyPlaque(image, seg)).toBeNull()
    })

    it('should classify calcified vs non-calcified plaque by HU threshold', () => {
      const width = 4
      const height = 1
      // 2 pixels below threshold, 2 above
      const data = new Int16Array([50, 100, 200, 300])
      const wallMask = new Uint8Array([1, 1, 1, 1])

      const image: CrossSectionImage = {
        dimensions: [width, height],
        spacing: [1.0, 1.0],
        data,
      }
      const seg: CrossSectionSegmentation = {
        dimensions: [width, height],
        spacing: [1.0, 1.0],
        lumenMask: new Uint8Array(4),
        vesselWallMask: wallMask,
      }

      const result = quantifyPlaque(image, seg, { calciumThreshold: 130 })
      expect(result).not.toBeNull()
      expect(result!.calcifiedPixelCount).toBe(2) // 200 and 300
      expect(result!.nonCalcifiedPixelCount).toBe(2) // 50 and 100
      expect(result!.calcifiedArea).toBeCloseTo(2.0)
      expect(result!.nonCalcifiedArea).toBeCloseTo(2.0)
      expect(result!.calcifiedPercentage).toBeCloseTo(50)
      expect(result!.calcifiedMeanHU).toBe(250)
      expect(result!.nonCalcifiedMeanHU).toBe(75)
      expect(result!.unit).toBe('mm²')
    })

    it('should handle all calcified plaque', () => {
      const data = new Int16Array([200, 300, 400, 500])
      const wallMask = new Uint8Array([1, 1, 1, 1])

      const image: CrossSectionImage = {
        dimensions: [4, 1],
        spacing: [1.0, 1.0],
        data,
      }
      const seg: CrossSectionSegmentation = {
        dimensions: [4, 1],
        spacing: [1.0, 1.0],
        lumenMask: new Uint8Array(4),
        vesselWallMask: wallMask,
      }

      const result = quantifyPlaque(image, seg)!
      expect(result.calcifiedPercentage).toBeCloseTo(100)
      expect(result.nonCalcifiedPixelCount).toBe(0)
    })

    it('should handle empty vessel wall mask', () => {
      const data = new Int16Array(4)
      const wallMask = new Uint8Array(4) // all zeros

      const image: CrossSectionImage = {
        dimensions: [2, 2],
        spacing: [1.0, 1.0],
        data,
      }
      const seg: CrossSectionSegmentation = {
        dimensions: [2, 2],
        spacing: [1.0, 1.0],
        lumenMask: new Uint8Array(4),
        vesselWallMask: wallMask,
      }

      const result = quantifyPlaque(image, seg)!
      expect(result.totalArea).toBe(0)
      expect(result.calcifiedPercentage).toBe(0)
    })
  })

  describe('extractContour', () => {
    it('should extract boundary pixels from mask', () => {
      // 5x5 mask with a solid 3x3 block in center
      const mask = new Uint8Array(25)
      // Fill center 3x3
      for (let y = 1; y <= 3; y++) {
        for (let x = 1; x <= 3; x++) {
          mask[x + y * 5] = 1
        }
      }

      const contour = extractContour(mask, [5, 5])
      // All 9 pixels in the 3x3 block are boundary pixels (all have outside neighbors)
      expect(contour.length).toBeGreaterThan(0)
      expect(contour.length).toBeLessThanOrEqual(9)
    })

    it('should return empty contour for empty mask', () => {
      const mask = new Uint8Array(25)
      const contour = extractContour(mask, [5, 5])
      expect(contour).toHaveLength(0)
    })
  })

  describe('calculateCentroid', () => {
    it('should compute centroid of contour points', () => {
      const contour = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]

      const centroid = calculateCentroid(contour)
      expect(centroid.x).toBe(5)
      expect(centroid.y).toBe(5)
    })

    it('should return (0,0) for empty contour', () => {
      const centroid = calculateCentroid([])
      expect(centroid.x).toBe(0)
      expect(centroid.y).toBe(0)
    })
  })

  describe('computeAllMeasurements', () => {
    it('should throw if image and segmentation dimensions mismatch', () => {
      const image: CrossSectionImage = {
        dimensions: [10, 10],
        spacing: [1.0, 1.0],
        data: new Int16Array(100),
      }
      const seg: CrossSectionSegmentation = {
        dimensions: [20, 20],
        spacing: [1.0, 1.0],
        lumenMask: new Uint8Array(400),
      }

      expect(() => computeAllMeasurements(image, seg, 5.0)).toThrow(
        'dimensions must match',
      )
    })

    it('should compute all measurements for valid input', () => {
      const width = 20
      const height = 20
      const lumenMask = createCircularMask(width, height, 10, 10, 5)
      const data = new Int16Array(width * height)
      data.fill(100)

      const image: CrossSectionImage = {
        dimensions: [width, height],
        spacing: [0.5, 0.5],
        data,
      }
      const seg: CrossSectionSegmentation = {
        dimensions: [width, height],
        spacing: [0.5, 0.5],
        lumenMask,
      }

      const measurements = computeAllMeasurements(image, seg, 10.0)
      expect(measurements.lumenArea.value).toBeGreaterThan(0)
      expect(measurements.lumenDiameter).toBeDefined()
      expect(measurements.lumenHUStats.mean).toBeCloseTo(100)
      expect(measurements.position).toBe(10.0)
      expect(measurements.timestamp).toBeGreaterThan(0)
    })
  })
})
