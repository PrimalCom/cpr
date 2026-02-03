/**
 * Centerline Computation Module
 *
 * Server-side B-spline interpolation for computing smooth centerlines through
 * coronary vessels. Takes start/end points and optional control points, computes
 * a smooth curve using B-spline interpolation, and returns an array of 3D points
 * at regular intervals along the curve.
 *
 * Optionally guided by segmentation mask using distance transform to ensure
 * the centerline stays within the vessel lumen.
 */

import BSpline from 'b-spline'

/**
 * 3D point in space
 */
export interface Point3D {
  x: number
  y: number
  z: number
}

/**
 * Control point for B-spline curve with optional weight
 */
export interface ControlPoint extends Point3D {
  /** Optional weight for weighted B-spline (default: 1.0) */
  weight?: number
}

/**
 * Computed centerline point with additional properties
 */
export interface CenterlinePoint extends Point3D {
  /** Distance along the centerline from start (mm) */
  distance: number
  /** Radius of the vessel at this point (if available) */
  radius?: number
  /** Whether this point is inside the vessel lumen (if segmentation provided) */
  insideLumen?: boolean
}

/**
 * Configuration for centerline computation
 */
export interface CenterlineConfig {
  /** Sampling interval along the curve (mm). Default: 0.5mm */
  samplingInterval?: number
  /** Degree of the B-spline curve. Default: 3 (cubic) */
  degree?: number
  /** Number of knot points for B-spline. Default: auto-calculated */
  numKnots?: number
  /** Whether to use uniform knot vector. Default: true */
  uniformKnots?: boolean
}

/**
 * Segmentation mask data for vessel guidance
 */
export interface SegmentationMask {
  /** 3D volume dimensions [width, height, depth] */
  dimensions: [number, number, number]
  /** Voxel spacing [x, y, z] in mm */
  spacing: [number, number, number]
  /** Origin point [x, y, z] in mm */
  origin: [number, number, number]
  /** Binary mask data (1 = inside vessel, 0 = outside) */
  data: Uint8Array
  /** Optional distance transform (distance to vessel boundary) */
  distanceTransform?: Float32Array
}

/**
 * Result of centerline computation
 */
export interface CenterlineResult {
  /** Array of centerline points at regular intervals */
  points: Array<CenterlinePoint>
  /** Total length of the centerline (mm) */
  totalLength: number
  /** Control points used to generate the curve */
  controlPoints: Array<ControlPoint>
  /** Whether the centerline deviates outside vessel lumen */
  hasDeviations: boolean
}

/**
 * Computes a smooth centerline using B-spline interpolation
 *
 * This is the main function for centerline generation. It takes start and end
 * points, optional intermediate control points, and computes a smooth curve
 * using B-spline interpolation.
 *
 * @param startPoint - Starting point of the centerline (first click on 3D surface)
 * @param endPoint - Ending point of the centerline (second click on 3D surface)
 * @param intermediatePoints - Optional control points between start and end
 * @param config - Configuration for the computation
 * @param segmentation - Optional segmentation mask for vessel guidance
 * @returns Computed centerline result
 */
export function computeCenterline(
  startPoint: Point3D,
  endPoint: Point3D,
  intermediatePoints: Array<ControlPoint> = [],
  config: CenterlineConfig = {},
  segmentation?: SegmentationMask,
): CenterlineResult {
  // Set default configuration
  const samplingInterval = config.samplingInterval ?? 0.5
  const degree = config.degree ?? 3
  const uniformKnots = config.uniformKnots ?? true

  // Build control points array: start -> intermediate -> end
  const controlPoints: Array<ControlPoint> = [
    { ...startPoint, weight: 1.0 },
    ...intermediatePoints.map((pt) => ({ ...pt, weight: pt.weight ?? 1.0 })),
    { ...endPoint, weight: 1.0 },
  ]

  // Ensure we have enough control points for the specified degree
  const minPoints = degree + 1
  if (controlPoints.length < minPoints) {
    throw new Error(
      `B-spline of degree ${degree} requires at least ${minPoints} control points, got ${controlPoints.length}`,
    )
  }

  // Convert control points to array format for b-spline library
  // b-spline library expects: [[x1, y1, z1], [x2, y2, z2], ...]
  const controlPointsArray = controlPoints.map((pt) => [pt.x, pt.y, pt.z])

  // Generate knot vector
  const numControlPoints = controlPoints.length
  const numKnots = config.numKnots ?? numControlPoints + degree + 1
  const knots = uniformKnots
    ? generateUniformKnots(numControlPoints, degree)
    : generateChordLengthKnots(controlPointsArray, degree)

  // Compute the total parametric length we need to sample
  // The parameter t ranges from knots[degree] to knots[numControlPoints]
  const tMin = knots[degree]
  const tMax = knots[numControlPoints]
  const tRange = tMax - tMin

  // Estimate the curve length to determine how many samples we need
  const estimatedLength = estimateCurveLength(controlPointsArray)
  const numSamples = Math.max(2, Math.ceil(estimatedLength / samplingInterval))

  // Sample the B-spline curve at regular parametric intervals
  const sampledPoints: Array<CenterlinePoint> = []
  let cumulativeDistance = 0
  let previousPoint: Point3D | null = null
  let hasDeviations = false

  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (tRange * i) / numSamples

    // Evaluate B-spline at parameter t
    const pointArray = BSpline(t, degree, controlPointsArray, knots)
    const point: Point3D = {
      x: pointArray[0],
      y: pointArray[1],
      z: pointArray[2],
    }

    // Calculate distance from previous point
    if (previousPoint) {
      const dx = point.x - previousPoint.x
      const dy = point.y - previousPoint.y
      const dz = point.z - previousPoint.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      cumulativeDistance += distance
    }

    // Check if point is inside vessel lumen (if segmentation provided)
    let insideLumen: boolean | undefined = undefined
    let radius: number | undefined = undefined

    if (segmentation) {
      const lumenCheck = checkPointInLumen(point, segmentation)
      insideLumen = lumenCheck.inside
      radius = lumenCheck.radius

      if (!insideLumen) {
        hasDeviations = true
      }
    }

    sampledPoints.push({
      ...point,
      distance: cumulativeDistance,
      radius,
      insideLumen,
    })

    previousPoint = point
  }

  return {
    points: sampledPoints,
    totalLength: cumulativeDistance,
    controlPoints,
    hasDeviations,
  }
}

/**
 * Generates a uniform knot vector for B-spline interpolation
 *
 * @param numControlPoints - Number of control points
 * @param degree - Degree of the B-spline
 * @returns Uniform knot vector
 */
function generateUniformKnots(
  numControlPoints: number,
  degree: number,
): Array<number> {
  const numKnots = numControlPoints + degree + 1
  const knots: Array<number> = []

  // First (degree + 1) knots are 0
  for (let i = 0; i <= degree; i++) {
    knots.push(0)
  }

  // Middle knots are uniformly spaced
  const numInteriorKnots = numKnots - 2 * (degree + 1)
  for (let i = 1; i <= numInteriorKnots; i++) {
    knots.push(i / (numInteriorKnots + 1))
  }

  // Last (degree + 1) knots are 1
  for (let i = 0; i <= degree; i++) {
    knots.push(1)
  }

  return knots
}

/**
 * Generates a chord-length knot vector for B-spline interpolation
 * This produces better parameterization for unevenly spaced control points
 *
 * @param controlPoints - Array of control points [[x, y, z], ...]
 * @param degree - Degree of the B-spline
 * @returns Chord-length knot vector
 */
function generateChordLengthKnots(
  controlPoints: Array<Array<number>>,
  degree: number,
): Array<number> {
  const n = controlPoints.length
  const numKnots = n + degree + 1
  const knots: Array<number> = []

  // Calculate chord lengths between consecutive control points
  const chordLengths: Array<number> = [0]
  let totalLength = 0

  for (let i = 1; i < n; i++) {
    const dx = controlPoints[i][0] - controlPoints[i - 1][0]
    const dy = controlPoints[i][1] - controlPoints[i - 1][1]
    const dz = controlPoints[i][2] - controlPoints[i - 1][2]
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
    totalLength += length
    chordLengths.push(totalLength)
  }

  // Normalize chord lengths to [0, 1]
  const normalizedChordLengths = chordLengths.map((len) =>
    totalLength > 0 ? len / totalLength : 0,
  )

  // First (degree + 1) knots are 0
  for (let i = 0; i <= degree; i++) {
    knots.push(0)
  }

  // Interior knots based on chord lengths
  for (let i = 1; i < n - degree; i++) {
    let sum = 0
    for (let j = i; j < i + degree; j++) {
      sum += normalizedChordLengths[j]
    }
    knots.push(sum / degree)
  }

  // Last (degree + 1) knots are 1
  for (let i = 0; i <= degree; i++) {
    knots.push(1)
  }

  return knots
}

/**
 * Estimates the length of a curve defined by control points
 * Uses the sum of chord lengths as a rough estimate
 *
 * @param controlPoints - Array of control points [[x, y, z], ...]
 * @returns Estimated curve length in mm
 */
function estimateCurveLength(controlPoints: Array<Array<number>>): number {
  let length = 0

  for (let i = 1; i < controlPoints.length; i++) {
    const dx = controlPoints[i][0] - controlPoints[i - 1][0]
    const dy = controlPoints[i][1] - controlPoints[i - 1][1]
    const dz = controlPoints[i][2] - controlPoints[i - 1][2]
    length += Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  return length
}

/**
 * Checks if a 3D point is inside the vessel lumen using the segmentation mask
 *
 * @param point - 3D point to check
 * @param segmentation - Segmentation mask data
 * @returns Object with inside flag and optional radius
 */
function checkPointInLumen(
  point: Point3D,
  segmentation: SegmentationMask,
): { inside: boolean; radius?: number } {
  const { dimensions, spacing, origin, data, distanceTransform } = segmentation

  // Convert world coordinates to voxel indices
  const i = Math.round((point.x - origin[0]) / spacing[0])
  const j = Math.round((point.y - origin[1]) / spacing[1])
  const k = Math.round((point.z - origin[2]) / spacing[2])

  // Check bounds
  if (
    i < 0 ||
    i >= dimensions[0] ||
    j < 0 ||
    j >= dimensions[1] ||
    k < 0 ||
    k >= dimensions[2]
  ) {
    return { inside: false }
  }

  // Calculate linear index
  const index = i + j * dimensions[0] + k * dimensions[0] * dimensions[1]

  // Check if inside lumen
  const inside = data[index] === 1

  // If distance transform is available, use it to estimate radius
  let radius: number | undefined = undefined
  if (distanceTransform && inside) {
    radius = distanceTransform[index]
  }

  return { inside, radius }
}

/**
 * Refines a centerline to better follow the vessel centerline using the
 * distance transform of the segmentation mask. This is an advanced feature
 * that can improve centerline accuracy by following the medial axis of the vessel.
 *
 * @param initialCenterline - Initial centerline to refine
 * @param segmentation - Segmentation mask with distance transform
 * @param iterations - Number of refinement iterations (default: 3)
 * @returns Refined centerline result
 */
export function refineCenterlineWithDistanceTransform(
  initialCenterline: CenterlineResult,
  segmentation: SegmentationMask,
  iterations: number = 3,
): CenterlineResult {
  if (!segmentation.distanceTransform) {
    throw new Error('Distance transform is required for centerline refinement')
  }

  // For each iteration, adjust control points toward medial axis
  let refinedControlPoints = [...initialCenterline.controlPoints]

  for (let iter = 0; iter < iterations; iter++) {
    refinedControlPoints = refinedControlPoints.map((cp, index) => {
      // Don't move start and end points
      if (index === 0 || index === refinedControlPoints.length - 1) {
        return cp
      }

      // Search in a small neighborhood for maximum distance transform value
      // (i.e., points furthest from vessel boundary = medial axis)
      const searchRadius = 2.0 // mm
      const numSearchPoints = 8
      let maxDistance = 0
      let bestPoint = cp

      for (let i = 0; i < numSearchPoints; i++) {
        const angle = (2 * Math.PI * i) / numSearchPoints
        const testPoint = {
          x: cp.x + searchRadius * Math.cos(angle),
          y: cp.y + searchRadius * Math.sin(angle),
          z: cp.z,
        }

        const lumenCheck = checkPointInLumen(testPoint, segmentation)
        if (
          lumenCheck.inside &&
          lumenCheck.radius !== undefined &&
          lumenCheck.radius > maxDistance
        ) {
          maxDistance = lumenCheck.radius
          bestPoint = testPoint
        }
      }

      return { ...bestPoint, weight: cp.weight }
    })
  }

  // Recompute centerline with refined control points
  const startPoint = refinedControlPoints[0]
  const endPoint = refinedControlPoints[refinedControlPoints.length - 1]
  const intermediatePoints = refinedControlPoints.slice(1, -1)

  return computeCenterline(
    startPoint,
    endPoint,
    intermediatePoints,
    {}, // Use default config
    segmentation,
  )
}

/**
 * Validates that a centerline is anatomically plausible
 * Checks for sudden direction changes, unrealistic curvature, etc.
 *
 * @param centerline - Centerline to validate
 * @returns Validation result with errors if any
 */
export function validateCenterline(centerline: CenterlineResult): {
  valid: boolean
  errors: Array<string>
} {
  const errors: Array<string> = []

  // Check minimum length
  if (centerline.totalLength < 5.0) {
    errors.push('Centerline is too short (< 5mm)')
  }

  // Check maximum length (coronary arteries typically < 200mm)
  if (centerline.totalLength > 250.0) {
    errors.push('Centerline is unrealistically long (> 250mm)')
  }

  // Check for sharp angles between consecutive segments
  const points = centerline.points
  for (let i = 1; i < points.length - 1; i++) {
    const v1 = {
      x: points[i].x - points[i - 1].x,
      y: points[i].y - points[i - 1].y,
      z: points[i].z - points[i - 1].z,
    }
    const v2 = {
      x: points[i + 1].x - points[i].x,
      y: points[i + 1].y - points[i].y,
      z: points[i + 1].z - points[i].z,
    }

    const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z)
    const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z)

    if (len1 > 0 && len2 > 0) {
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
      const cosAngle = dot / (len1 * len2)
      const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)))

      // Flag angles > 90 degrees as suspicious
      if (angle > Math.PI / 2) {
        errors.push(
          `Sharp angle detected at point ${i} (${((angle * 180) / Math.PI).toFixed(1)}°)`,
        )
      }
    }
  }

  // Check for deviations outside vessel lumen
  if (centerline.hasDeviations) {
    const numDeviations = centerline.points.filter(
      (pt) => pt.insideLumen === false,
    ).length
    const percentDeviation = (numDeviations / centerline.points.length) * 100

    if (percentDeviation > 10) {
      errors.push(
        `Centerline deviates outside vessel lumen (${percentDeviation.toFixed(1)}% of points)`,
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Interpolates a point on the centerline at a specific distance from start
 * Useful for finding a point at a specific position along the vessel
 *
 * @param centerline - Computed centerline
 * @param distance - Distance from start (mm)
 * @returns Interpolated point or null if distance is out of range
 */
export function interpolatePointAtDistance(
  centerline: CenterlineResult,
  distance: number,
): CenterlinePoint | null {
  if (distance < 0 || distance > centerline.totalLength) {
    return null
  }

  const points = centerline.points

  // Find the two points that bracket the desired distance
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].distance <= distance && points[i + 1].distance >= distance) {
      // Linear interpolation between points[i] and points[i+1]
      const t =
        (distance - points[i].distance) /
        (points[i + 1].distance - points[i].distance)

      return {
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y),
        z: points[i].z + t * (points[i + 1].z - points[i].z),
        distance,
        radius:
          points[i].radius !== undefined && points[i + 1].radius !== undefined
            ? points[i].radius! +
              t * (points[i + 1].radius! - points[i].radius!)
            : undefined,
        insideLumen:
          points[i].insideLumen !== undefined &&
          points[i + 1].insideLumen !== undefined
            ? points[i].insideLumen && points[i + 1].insideLumen
            : undefined,
      }
    }
  }

  // If we reach here, return the last point
  return points[points.length - 1]
}
