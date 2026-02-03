import { describe, expect, it } from 'vitest'
import {
  
  
  computeCenterline,
  interpolatePointAtDistance,
  validateCenterline
} from '../centerline'
import type {ControlPoint, Point3D} from '../centerline';

describe('centerline', () => {
  describe('computeCenterline', () => {
    it('should compute a centerline between two points with enough control points for cubic B-spline', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 100, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 33, y: 10, z: 0 },
        { x: 66, y: -10, z: 0 },
      ]

      const result = computeCenterline(start, end, intermediate)

      expect(result.points.length).toBeGreaterThan(2)
      expect(result.totalLength).toBeGreaterThan(0)
      expect(result.controlPoints).toHaveLength(4) // start + 2 intermediate + end
      expect(result.hasDeviations).toBe(false)
    })

    it('should sample at approximately 0.5mm intervals by default', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 50, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 16, y: 5, z: 0 },
        { x: 33, y: -5, z: 0 },
      ]

      const result = computeCenterline(start, end, intermediate)

      // With ~50mm length at 0.5mm intervals, expect roughly 100 points
      expect(result.points.length).toBeGreaterThan(50)
      expect(result.points.length).toBeLessThan(300)
    })

    it('should have increasing distance values along the centerline', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 50, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 16, y: 5, z: 0 },
        { x: 33, y: -5, z: 0 },
      ]

      const result = computeCenterline(start, end, intermediate)

      for (let i = 1; i < result.points.length; i++) {
        expect(result.points[i].distance).toBeGreaterThanOrEqual(
          result.points[i - 1].distance,
        )
      }
    })

    it('should throw when not enough control points for degree', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 100, y: 0, z: 0 }
      // Degree 3 needs at least 4 control points; only 2 provided (start + end)
      expect(() => computeCenterline(start, end, [])).toThrow(
        'requires at least',
      )
    })

    it('should respect custom sampling interval', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 100, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 33, y: 10, z: 0 },
        { x: 66, y: -10, z: 0 },
      ]

      const result1 = computeCenterline(start, end, intermediate, {
        samplingInterval: 0.5,
      })
      const result2 = computeCenterline(start, end, intermediate, {
        samplingInterval: 1.0,
      })

      // Double sampling interval should give roughly half the points
      expect(result1.points.length).toBeGreaterThan(result2.points.length)
    })

    it('should work with 3D points (non-planar)', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 30, y: 40, z: 50 }
      const intermediate: Array<ControlPoint> = [
        { x: 10, y: 15, z: 20 },
        { x: 20, y: 25, z: 35 },
      ]

      const result = computeCenterline(start, end, intermediate)

      expect(result.points.length).toBeGreaterThan(2)
      // Check that z coordinates vary (truly 3D)
      const zValues = result.points.map((p) => p.z)
      const uniqueZValues = new Set(zValues.map((z) => Math.round(z * 10)))
      expect(uniqueZValues.size).toBeGreaterThan(1)
    })
  })

  describe('validateCenterline', () => {
    it('should validate a reasonable centerline as valid', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 50, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 16, y: 5, z: 0 },
        { x: 33, y: -5, z: 0 },
      ]
      const result = computeCenterline(start, end, intermediate)
      const validation = validateCenterline(result)

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should reject a too-short centerline', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 2, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 0.5, y: 0, z: 0 },
        { x: 1.5, y: 0, z: 0 },
      ]
      const result = computeCenterline(start, end, intermediate)
      const validation = validateCenterline(result)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some((e) => e.includes('too short'))).toBe(true)
    })

    it('should reject an unrealistically long centerline', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 300, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 100, y: 0, z: 0 },
        { x: 200, y: 0, z: 0 },
      ]
      const result = computeCenterline(start, end, intermediate)
      const validation = validateCenterline(result)

      expect(validation.valid).toBe(false)
      expect(validation.errors.some((e) => e.includes('long'))).toBe(true)
    })
  })

  describe('interpolatePointAtDistance', () => {
    it('should return null for negative distance', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 50, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 16, y: 5, z: 0 },
        { x: 33, y: -5, z: 0 },
      ]
      const result = computeCenterline(start, end, intermediate)

      expect(interpolatePointAtDistance(result, -1)).toBeNull()
    })

    it('should return null for distance beyond total length', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 50, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 16, y: 5, z: 0 },
        { x: 33, y: -5, z: 0 },
      ]
      const result = computeCenterline(start, end, intermediate)

      expect(
        interpolatePointAtDistance(result, result.totalLength + 10),
      ).toBeNull()
    })

    it('should return a valid point at a valid distance', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 50, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 16, y: 5, z: 0 },
        { x: 33, y: -5, z: 0 },
      ]
      const result = computeCenterline(start, end, intermediate)
      const midDistance = result.totalLength / 2

      const point = interpolatePointAtDistance(result, midDistance)
      expect(point).not.toBeNull()
      expect(point!.distance).toBeCloseTo(midDistance, 0)
    })

    it('should return start point at distance 0', () => {
      const start: Point3D = { x: 0, y: 0, z: 0 }
      const end: Point3D = { x: 50, y: 0, z: 0 }
      const intermediate: Array<ControlPoint> = [
        { x: 16, y: 5, z: 0 },
        { x: 33, y: -5, z: 0 },
      ]
      const result = computeCenterline(start, end, intermediate)

      const point = interpolatePointAtDistance(result, 0)
      expect(point).not.toBeNull()
      expect(point!.distance).toBe(0)
    })
  })
})
