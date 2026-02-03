/**
 * Measurement Computation Module
 *
 * Utilities for computing quantitative measurements from cross-sectional
 * coronary CT angiography images and segmentation masks. Includes:
 * - Lumen area calculation
 * - Vessel wall area calculation
 * - Minimum and maximum diameter measurements
 * - Mean HU (Hounsfield Unit) statistics
 * - Plaque quantification (calcium detection using HU thresholds)
 *
 * All computations work with cross-section pixel data extracted from curved
 * MPR volumes and corresponding segmentation masks.
 */

/**
 * 2D point in pixel coordinates
 */
export interface Point2D {
  x: number
  y: number
}

/**
 * Contour representation as array of 2D points
 */
export type Contour = Array<Point2D>

/**
 * Cross-section image data with spatial information
 */
export interface CrossSectionImage {
  /** Image dimensions [width, height] */
  dimensions: [number, number]
  /** Pixel spacing [x, y] in mm */
  spacing: [number, number]
  /** Pixel data (Int16 for CT HU values) */
  data: Int16Array
}

/**
 * Segmentation data for a cross-section
 */
export interface CrossSectionSegmentation {
  /** Image dimensions [width, height] - must match image dimensions */
  dimensions: [number, number]
  /** Pixel spacing [x, y] in mm - must match image spacing */
  spacing: [number, number]
  /** Lumen mask (1 = inside lumen, 0 = outside) */
  lumenMask: Uint8Array
  /** Vessel wall mask (1 = inside wall, 0 = outside) */
  vesselWallMask?: Uint8Array
  /** Optional lumen contour points */
  lumenContour?: Contour
  /** Optional vessel wall contour points */
  vesselWallContour?: Contour
}

/**
 * Area measurement result
 */
export interface AreaMeasurement {
  /** Area value in mm² */
  value: number
  /** Number of pixels used in calculation */
  pixelCount: number
  /** Unit string for display */
  unit: 'mm²'
}

/**
 * Diameter measurement result
 */
export interface DiameterMeasurement {
  /** Minimum diameter in mm */
  min: number
  /** Maximum diameter in mm */
  max: number
  /** Mean diameter in mm */
  mean: number
  /** Endpoints of minimum diameter line */
  minEndpoints?: [Point2D, Point2D]
  /** Endpoints of maximum diameter line */
  maxEndpoints?: [Point2D, Point2D]
  /** Unit string for display */
  unit: 'mm'
}

/**
 * HU statistics measurement result
 */
export interface HUStatistics {
  /** Mean HU value */
  mean: number
  /** Standard deviation of HU values */
  std: number
  /** Minimum HU value */
  min: number
  /** Maximum HU value */
  max: number
  /** Median HU value */
  median: number
  /** Number of pixels in measurement region */
  pixelCount: number
  /** Unit string for display */
  unit: 'HU'
}

/**
 * Plaque quantification result
 */
export interface PlaqueQuantification {
  /** Total plaque area in mm² */
  totalArea: number
  /** Calcified plaque area (HU > 130) in mm² */
  calcifiedArea: number
  /** Non-calcified plaque area (HU ≤ 130) in mm² */
  nonCalcifiedArea: number
  /** Calcified plaque percentage (0-100) */
  calcifiedPercentage: number
  /** Mean HU of calcified plaque */
  calcifiedMeanHU: number
  /** Mean HU of non-calcified plaque */
  nonCalcifiedMeanHU: number
  /** Number of calcified pixels */
  calcifiedPixelCount: number
  /** Number of non-calcified pixels */
  nonCalcifiedPixelCount: number
  /** Unit string for display */
  unit: 'mm²'
}

/**
 * Complete measurement suite for a cross-section
 */
export interface CrossSectionMeasurements {
  /** Lumen area measurement */
  lumenArea: AreaMeasurement
  /** Vessel wall area measurement (if segmentation includes wall) */
  vesselWallArea?: AreaMeasurement
  /** Total vessel area (lumen + wall) */
  totalVesselArea?: AreaMeasurement
  /** Lumen diameter measurements */
  lumenDiameter: DiameterMeasurement
  /** HU statistics within lumen */
  lumenHUStats: HUStatistics
  /** HU statistics within vessel wall (if available) */
  vesselWallHUStats?: HUStatistics
  /** Plaque quantification (if wall segmentation available) */
  plaqueQuantification?: PlaqueQuantification
  /** Position along centerline (mm) */
  position: number
  /** Timestamp of measurement */
  timestamp: number
}

/**
 * Configuration for measurement computation
 */
export interface MeasurementConfig {
  /** HU threshold for calcium detection. Default: 130 HU */
  calciumThreshold?: number
  /** Minimum area to consider valid (mm²). Default: 0.1 */
  minValidArea?: number
  /** Maximum diameter search iterations. Default: 360 */
  diameterAngles?: number
}

// ============================================================================
// Area Measurements
// ============================================================================

/**
 * Calculates the area of a region defined by a binary mask
 *
 * @param mask - Binary mask (1 = inside, 0 = outside)
 * @param dimensions - Image dimensions [width, height]
 * @param spacing - Pixel spacing [x, y] in mm
 * @returns Area measurement result
 */
export function calculateArea(
  mask: Uint8Array,
  dimensions: [number, number],
  spacing: [number, number],
): AreaMeasurement {
  const [width, height] = dimensions
  const [spacingX, spacingY] = spacing

  // Count pixels inside the mask
  let pixelCount = 0
  for (let i = 0; i < width * height; i++) {
    if (mask[i] === 1) {
      pixelCount++
    }
  }

  // Calculate area: pixel count × pixel area
  const pixelArea = spacingX * spacingY
  const value = pixelCount * pixelArea

  return {
    value,
    pixelCount,
    unit: 'mm²',
  }
}

/**
 * Calculates lumen area from segmentation mask
 *
 * @param segmentation - Cross-section segmentation data
 * @returns Lumen area measurement
 */
export function calculateLumenArea(
  segmentation: CrossSectionSegmentation,
): AreaMeasurement {
  return calculateArea(
    segmentation.lumenMask,
    segmentation.dimensions,
    segmentation.spacing,
  )
}

/**
 * Calculates vessel wall area from segmentation mask
 * Wall area = Total vessel area - Lumen area
 *
 * @param segmentation - Cross-section segmentation data (must include vesselWallMask)
 * @returns Vessel wall area measurement
 */
export function calculateVesselWallArea(
  segmentation: CrossSectionSegmentation,
): AreaMeasurement | null {
  if (!segmentation.vesselWallMask) {
    return null
  }

  return calculateArea(
    segmentation.vesselWallMask,
    segmentation.dimensions,
    segmentation.spacing,
  )
}

// ============================================================================
// Diameter Measurements
// ============================================================================

/**
 * Calculates minimum, maximum, and mean diameters from a contour or mask
 *
 * Uses a rotating caliper approach to find the minimum and maximum
 * distance across the region.
 *
 * @param segmentation - Cross-section segmentation data
 * @param config - Measurement configuration
 * @returns Diameter measurement result
 */
export function calculateDiameters(
  segmentation: CrossSectionSegmentation,
  config: MeasurementConfig = {},
): DiameterMeasurement {
  const diameterAngles = config.diameterAngles ?? 360
  const spacing = segmentation.spacing

  // Use contour if available, otherwise extract from mask
  const contour =
    segmentation.lumenContour ??
    extractContour(segmentation.lumenMask, segmentation.dimensions)

  if (contour.length < 2) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      unit: 'mm',
    }
  }

  // Calculate centroid of the contour
  const centroid = calculateCentroid(contour)

  // For each angle, find the maximum distance from centroid to contour
  let minDiameter = Infinity
  let maxDiameter = 0
  let minEndpoints: [Point2D, Point2D] | undefined
  let maxEndpoints: [Point2D, Point2D] | undefined
  let sumDiameters = 0

  for (let i = 0; i < diameterAngles; i++) {
    const angle = (i * 2 * Math.PI) / diameterAngles

    // Find two points on opposite sides of the contour
    const point1 = findContourPointInDirection(contour, centroid, angle)
    const point2 = findContourPointInDirection(
      contour,
      centroid,
      angle + Math.PI,
    )

    if (point1 && point2) {
      const diameter = calculateDistance(point1, point2, spacing)

      sumDiameters += diameter

      if (diameter < minDiameter) {
        minDiameter = diameter
        minEndpoints = [point1, point2]
      }

      if (diameter > maxDiameter) {
        maxDiameter = diameter
        maxEndpoints = [point1, point2]
      }
    }
  }

  const meanDiameter = sumDiameters / diameterAngles

  return {
    min: minDiameter === Infinity ? 0 : minDiameter,
    max: maxDiameter,
    mean: meanDiameter,
    minEndpoints,
    maxEndpoints,
    unit: 'mm',
  }
}

// ============================================================================
// HU Statistics
// ============================================================================

/**
 * Calculates HU statistics within a masked region
 *
 * @param image - Cross-section image data
 * @param mask - Binary mask defining region of interest
 * @returns HU statistics
 */
export function calculateHUStatistics(
  image: CrossSectionImage,
  mask: Uint8Array,
): HUStatistics {
  const { dimensions, data } = image
  const [width, height] = dimensions

  // Collect HU values within mask
  const values: Array<number> = []
  for (let i = 0; i < width * height; i++) {
    if (mask[i] === 1) {
      values.push(data[i])
    }
  }

  if (values.length === 0) {
    return {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      median: 0,
      pixelCount: 0,
      unit: 'HU',
    }
  }

  // Calculate statistics
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length
  const std = Math.sqrt(variance)
  const min = Math.min(...values)
  const max = Math.max(...values)

  // Calculate median
  const sortedValues = [...values].sort((a, b) => a - b)
  const median = sortedValues[Math.floor(sortedValues.length / 2)]

  return {
    mean,
    std,
    min,
    max,
    median,
    pixelCount: values.length,
    unit: 'HU',
  }
}

/**
 * Calculates HU statistics within lumen
 *
 * @param image - Cross-section image data
 * @param segmentation - Cross-section segmentation data
 * @returns Lumen HU statistics
 */
export function calculateLumenHUStatistics(
  image: CrossSectionImage,
  segmentation: CrossSectionSegmentation,
): HUStatistics {
  return calculateHUStatistics(image, segmentation.lumenMask)
}

/**
 * Calculates HU statistics within vessel wall
 *
 * @param image - Cross-section image data
 * @param segmentation - Cross-section segmentation data (must include vesselWallMask)
 * @returns Vessel wall HU statistics or null if no wall mask
 */
export function calculateVesselWallHUStatistics(
  image: CrossSectionImage,
  segmentation: CrossSectionSegmentation,
): HUStatistics | null {
  if (!segmentation.vesselWallMask) {
    return null
  }

  return calculateHUStatistics(image, segmentation.vesselWallMask)
}

// ============================================================================
// Plaque Quantification
// ============================================================================

/**
 * Quantifies plaque in vessel wall based on HU thresholds
 *
 * Calcifies plaque is defined as HU > 130 (calcium threshold).
 * Non-calcified plaque is defined as HU ≤ 130.
 *
 * @param image - Cross-section image data
 * @param segmentation - Cross-section segmentation data (must include vesselWallMask)
 * @param config - Measurement configuration
 * @returns Plaque quantification result or null if no wall mask
 */
export function quantifyPlaque(
  image: CrossSectionImage,
  segmentation: CrossSectionSegmentation,
  config: MeasurementConfig = {},
): PlaqueQuantification | null {
  if (!segmentation.vesselWallMask) {
    return null
  }

  const calciumThreshold = config.calciumThreshold ?? 130
  const { dimensions, data } = image
  const { vesselWallMask, spacing } = segmentation
  const [width, height] = dimensions
  const pixelArea = spacing[0] * spacing[1]

  // Classify plaque pixels
  let calcifiedPixelCount = 0
  let nonCalcifiedPixelCount = 0
  let calcifiedHUSum = 0
  let nonCalcifiedHUSum = 0

  for (let i = 0; i < width * height; i++) {
    if (vesselWallMask[i] === 1) {
      const huValue = data[i]

      if (huValue > calciumThreshold) {
        calcifiedPixelCount++
        calcifiedHUSum += huValue
      } else {
        nonCalcifiedPixelCount++
        nonCalcifiedHUSum += huValue
      }
    }
  }

  // Calculate areas
  const calcifiedArea = calcifiedPixelCount * pixelArea
  const nonCalcifiedArea = nonCalcifiedPixelCount * pixelArea
  const totalArea = calcifiedArea + nonCalcifiedArea

  // Calculate percentages
  const calcifiedPercentage =
    totalArea > 0 ? (calcifiedArea / totalArea) * 100 : 0

  // Calculate mean HU values
  const calcifiedMeanHU =
    calcifiedPixelCount > 0 ? calcifiedHUSum / calcifiedPixelCount : 0
  const nonCalcifiedMeanHU =
    nonCalcifiedPixelCount > 0 ? nonCalcifiedHUSum / nonCalcifiedPixelCount : 0

  return {
    totalArea,
    calcifiedArea,
    nonCalcifiedArea,
    calcifiedPercentage,
    calcifiedMeanHU,
    nonCalcifiedMeanHU,
    calcifiedPixelCount,
    nonCalcifiedPixelCount,
    unit: 'mm²',
  }
}

// ============================================================================
// Complete Measurement Suite
// ============================================================================

/**
 * Computes all available measurements for a cross-section
 *
 * @param image - Cross-section image data
 * @param segmentation - Cross-section segmentation data
 * @param position - Position along centerline (mm)
 * @param config - Measurement configuration
 * @returns Complete measurement suite
 */
export function computeAllMeasurements(
  image: CrossSectionImage,
  segmentation: CrossSectionSegmentation,
  position: number,
  config: MeasurementConfig = {},
): CrossSectionMeasurements {
  // Validate dimensions match
  if (
    image.dimensions[0] !== segmentation.dimensions[0] ||
    image.dimensions[1] !== segmentation.dimensions[1]
  ) {
    throw new Error('Image and segmentation dimensions must match')
  }

  // Compute lumen measurements
  const lumenArea = calculateLumenArea(segmentation)
  const lumenDiameter = calculateDiameters(segmentation, config)
  const lumenHUStats = calculateLumenHUStatistics(image, segmentation)

  // Compute vessel wall measurements (if available)
  const vesselWallArea = calculateVesselWallArea(segmentation)
  const vesselWallHUStats = calculateVesselWallHUStatistics(image, segmentation)
  const plaqueQuantification = quantifyPlaque(image, segmentation, config)

  // Calculate total vessel area
  const totalVesselArea = vesselWallArea
    ? {
        value: lumenArea.value + vesselWallArea.value,
        pixelCount: lumenArea.pixelCount + vesselWallArea.pixelCount,
        unit: 'mm²' as const,
      }
    : undefined

  return {
    lumenArea,
    vesselWallArea: vesselWallArea ?? undefined,
    totalVesselArea,
    lumenDiameter,
    lumenHUStats,
    vesselWallHUStats: vesselWallHUStats ?? undefined,
    plaqueQuantification: plaqueQuantification ?? undefined,
    position,
    timestamp: Date.now(),
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extracts a contour from a binary mask using edge detection
 *
 * @param mask - Binary mask
 * @param dimensions - Image dimensions [width, height]
 * @returns Array of contour points
 */
export function extractContour(
  mask: Uint8Array,
  dimensions: [number, number],
): Contour {
  const [width, height] = dimensions
  const contour: Contour = []

  // Simple edge detection: find pixels that are inside and have at least one outside neighbor
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = x + y * width

      if (mask[idx] === 1) {
        // Check 8-connected neighbors
        const hasOutsideNeighbor =
          mask[idx - 1] === 0 || // left
          mask[idx + 1] === 0 || // right
          mask[idx - width] === 0 || // top
          mask[idx + width] === 0 || // bottom
          mask[idx - width - 1] === 0 || // top-left
          mask[idx - width + 1] === 0 || // top-right
          mask[idx + width - 1] === 0 || // bottom-left
          mask[idx + width + 1] === 0 // bottom-right

        if (hasOutsideNeighbor) {
          contour.push({ x, y })
        }
      }
    }
  }

  return contour
}

/**
 * Calculates the centroid of a contour
 *
 * @param contour - Array of contour points
 * @returns Centroid point
 */
export function calculateCentroid(contour: Contour): Point2D {
  if (contour.length === 0) {
    return { x: 0, y: 0 }
  }

  const sum = contour.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }),
    { x: 0, y: 0 },
  )

  return {
    x: sum.x / contour.length,
    y: sum.y / contour.length,
  }
}

/**
 * Finds the contour point in a specific direction from a reference point
 *
 * @param contour - Array of contour points
 * @param reference - Reference point (typically centroid)
 * @param angle - Angle in radians
 * @returns Closest contour point in the specified direction, or null if none found
 */
function findContourPointInDirection(
  contour: Contour,
  reference: Point2D,
  angle: number,
): Point2D | null {
  const targetDir = {
    x: Math.cos(angle),
    y: Math.sin(angle),
  }

  let closestPoint: Point2D | null = null
  let minAngleDiff = Infinity

  for (const point of contour) {
    // Vector from reference to point
    const dx = point.x - reference.x
    const dy = point.y - reference.y
    const length = Math.sqrt(dx * dx + dy * dy)

    if (length < 0.1) continue // Skip points too close to reference

    // Normalize direction
    const pointDir = {
      x: dx / length,
      y: dy / length,
    }

    // Calculate angle difference
    const dotProduct = pointDir.x * targetDir.x + pointDir.y * targetDir.y
    const angleDiff = Math.acos(Math.max(-1, Math.min(1, dotProduct)))

    if (angleDiff < minAngleDiff) {
      minAngleDiff = angleDiff
      closestPoint = point
    }
  }

  return closestPoint
}

/**
 * Calculates the Euclidean distance between two points in mm
 *
 * @param p1 - First point
 * @param p2 - Second point
 * @param spacing - Pixel spacing [x, y] in mm
 * @returns Distance in mm
 */
function calculateDistance(
  p1: Point2D,
  p2: Point2D,
  spacing: [number, number],
): number {
  const dx = (p2.x - p1.x) * spacing[0]
  const dy = (p2.y - p1.y) * spacing[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Validates measurement configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result with errors if any
 */
export function validateMeasurementConfig(config: MeasurementConfig): {
  valid: boolean
  errors: Array<string>
} {
  const errors: Array<string> = []

  const calciumThreshold = config.calciumThreshold ?? 130
  const minValidArea = config.minValidArea ?? 0.1
  const diameterAngles = config.diameterAngles ?? 360

  if (calciumThreshold < 0 || calciumThreshold > 1000) {
    errors.push('Calcium threshold must be between 0 and 1000 HU')
  }

  if (minValidArea < 0 || minValidArea > 100) {
    errors.push('Minimum valid area must be between 0 and 100 mm²')
  }

  if (diameterAngles < 8 || diameterAngles > 1000) {
    errors.push('Diameter angles must be between 8 and 1000')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
