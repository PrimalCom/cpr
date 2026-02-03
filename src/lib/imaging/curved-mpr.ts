/**
 * Curved MPR (Multi-Planar Reconstruction) Module
 *
 * Server-side volume resampling along a centerline to create curved MPR volumes.
 * At each centerline point (0.5mm intervals):
 * - Compute tangent vector from centerline
 * - Generate orthogonal plane perpendicular to tangent
 * - Resample CT volume onto plane using trilinear interpolation
 * - Stack slices to form curved MPR volume
 *
 * Maintains consistent up-vector throughout to prevent rotation artifacts.
 */

import type { CenterlinePoint } from './centerline'

/**
 * 3D vector for mathematical operations
 */
export interface Vector3D {
  x: number
  y: number
  z: number
}

/**
 * Volume data with spatial information
 */
export interface VolumeData {
  /** Volume dimensions [width, height, depth] */
  dimensions: [number, number, number]
  /** Voxel spacing [x, y, z] in mm */
  spacing: [number, number, number]
  /** Origin point [x, y, z] in mm */
  origin: [number, number, number]
  /** Pixel data as typed array (Int16 for CT HU values) */
  data: Int16Array
}

/**
 * Configuration for curved MPR generation
 */
export interface CurvedMPRConfig {
  /** Sampling interval along centerline (mm). Default: 0.5mm */
  samplingInterval?: number
  /** Width of the MPR plane perpendicular to centerline (mm). Default: 20mm */
  planeWidth?: number
  /** Height of the MPR plane perpendicular to centerline (mm). Default: 20mm */
  planeHeight?: number
  /** Resolution of the MPR plane (mm/pixel). Default: 0.5mm */
  planeResolution?: number
  /** Initial up vector for consistent orientation. Default: [0, 0, 1] (superior direction) */
  initialUpVector?: Vector3D
  /** Interpolation method: 'trilinear' | 'nearest'. Default: 'trilinear' */
  interpolation?: 'trilinear' | 'nearest'
}

/**
 * Resulting curved MPR volume
 */
export interface CurvedMPRVolume {
  /** MPR volume dimensions [width, height, slices] */
  dimensions: [number, number, number]
  /** Pixel spacing [x, y, z] in mm */
  spacing: [number, number, number]
  /** Pixel data (Int16 for CT HU values) */
  data: Int16Array
  /** Centerline points used for generation */
  centerlinePoints: Array<CenterlinePoint>
  /** Total length along centerline (mm) */
  totalLength: number
}

/**
 * Plane definition in 3D space
 */
interface Plane {
  /** Point on the plane (centerline point) */
  point: Vector3D
  /** Normal vector (tangent to centerline) */
  normal: Vector3D
  /** Right vector (perpendicular to normal, in plane) */
  right: Vector3D
  /** Up vector (perpendicular to both normal and right) */
  up: Vector3D
}

/**
 * Generates a curved MPR volume from CT volume data along a centerline
 *
 * @param volumeData - CT volume data with spatial information
 * @param centerlinePoints - Array of centerline points at regular intervals
 * @param config - Configuration for MPR generation
 * @returns Curved MPR volume
 */
export function generateCurvedMPR(
  volumeData: VolumeData,
  centerlinePoints: Array<CenterlinePoint>,
  config: CurvedMPRConfig = {},
): CurvedMPRVolume {
  // Set default configuration
  const samplingInterval = config.samplingInterval ?? 0.5
  const planeWidth = config.planeWidth ?? 20.0
  const planeHeight = config.planeHeight ?? 20.0
  const planeResolution = config.planeResolution ?? 0.5
  const initialUpVector = config.initialUpVector ?? { x: 0, y: 0, z: 1 }
  const interpolation = config.interpolation ?? 'trilinear'

  // Validate inputs
  if (centerlinePoints.length < 2) {
    throw new Error('Centerline must have at least 2 points')
  }

  // Calculate MPR dimensions
  const widthPixels = Math.ceil(planeWidth / planeResolution)
  const heightPixels = Math.ceil(planeHeight / planeResolution)
  const numSlices = centerlinePoints.length

  // Allocate MPR volume
  const mprData = new Int16Array(widthPixels * heightPixels * numSlices)
  mprData.fill(-1024) // Initialize with air HU value

  // Compute tangent vectors at each centerline point
  const tangents = computeTangentVectors(centerlinePoints)

  // Generate orthogonal planes at each centerline point with consistent up-vector
  const planes = generateOrthogonalPlanes(
    centerlinePoints,
    tangents,
    initialUpVector,
  )

  // Resample volume onto each plane
  for (let sliceIdx = 0; sliceIdx < numSlices; sliceIdx++) {
    const plane = planes[sliceIdx]
    resamplePlane(
      volumeData,
      plane,
      mprData,
      sliceIdx,
      widthPixels,
      heightPixels,
      planeResolution,
      interpolation,
    )
  }

  // Calculate total length
  const totalLength = centerlinePoints[centerlinePoints.length - 1].distance

  return {
    dimensions: [widthPixels, heightPixels, numSlices],
    spacing: [planeResolution, planeResolution, samplingInterval],
    data: mprData,
    centerlinePoints,
    totalLength,
  }
}

/**
 * Computes tangent vectors at each centerline point using finite differences
 *
 * @param points - Array of centerline points
 * @returns Array of normalized tangent vectors
 */
function computeTangentVectors(points: Array<CenterlinePoint>): Array<Vector3D> {
  const tangents: Array<Vector3D> = []

  for (let i = 0; i < points.length; i++) {
    let tangent: Vector3D

    if (i === 0) {
      // Forward difference at start
      tangent = {
        x: points[i + 1].x - points[i].x,
        y: points[i + 1].y - points[i].y,
        z: points[i + 1].z - points[i].z,
      }
    } else if (i === points.length - 1) {
      // Backward difference at end
      tangent = {
        x: points[i].x - points[i - 1].x,
        y: points[i].y - points[i - 1].y,
        z: points[i].z - points[i - 1].z,
      }
    } else {
      // Central difference in middle
      tangent = {
        x: points[i + 1].x - points[i - 1].x,
        y: points[i + 1].y - points[i - 1].y,
        z: points[i + 1].z - points[i - 1].z,
      }
    }

    // Normalize tangent vector
    tangents.push(normalize(tangent))
  }

  return tangents
}

/**
 * Generates orthogonal planes at each centerline point with consistent up-vector
 * Uses a parallel transport frame to prevent rotation artifacts
 *
 * @param points - Array of centerline points
 * @param tangents - Array of tangent vectors
 * @param initialUpVector - Initial up vector for first plane
 * @returns Array of plane definitions
 */
function generateOrthogonalPlanes(
  points: Array<CenterlinePoint>,
  tangents: Array<Vector3D>,
  initialUpVector: Vector3D,
): Array<Plane> {
  const planes: Array<Plane> = []

  // For the first point, compute right and up vectors from initial up vector
  let prevUp = normalize(initialUpVector)

  for (let i = 0; i < points.length; i++) {
    const point = { x: points[i].x, y: points[i].y, z: points[i].z }
    const normal = tangents[i]

    // Compute right vector perpendicular to both normal and previous up
    // This implements a parallel transport frame
    let right = cross(prevUp, normal)

    // Handle case where prevUp is parallel to normal
    if (length(right) < 0.001) {
      // Choose an arbitrary perpendicular vector
      if (Math.abs(normal.x) < 0.9) {
        right = cross({ x: 1, y: 0, z: 0 }, normal)
      } else {
        right = cross({ x: 0, y: 1, z: 0 }, normal)
      }
    }
    right = normalize(right)

    // Compute up vector perpendicular to both normal and right
    const up = normalize(cross(normal, right))

    planes.push({
      point,
      normal,
      right,
      up,
    })

    // Update previous up for next iteration (parallel transport)
    prevUp = up
  }

  return planes
}

/**
 * Resamples the CT volume onto a single plane using interpolation
 *
 * @param volumeData - CT volume data
 * @param plane - Plane definition
 * @param mprData - Output MPR volume data
 * @param sliceIdx - Index of current slice
 * @param widthPixels - Width of plane in pixels
 * @param heightPixels - Height of plane in pixels
 * @param resolution - Pixel resolution in mm
 * @param interpolation - Interpolation method
 */
function resamplePlane(
  volumeData: VolumeData,
  plane: Plane,
  mprData: Int16Array,
  sliceIdx: number,
  widthPixels: number,
  heightPixels: number,
  resolution: number,
  interpolation: 'trilinear' | 'nearest',
): void {
  // For each pixel in the plane
  for (let j = 0; j < heightPixels; j++) {
    for (let i = 0; i < widthPixels; i++) {
      // Calculate offset from plane center (in mm)
      // Center the plane at (0, 0) relative to centerline point
      const offsetX = (i - widthPixels / 2) * resolution
      const offsetY = (j - heightPixels / 2) * resolution

      // Calculate 3D world position
      const worldPos: Vector3D = {
        x: plane.point.x + offsetX * plane.right.x + offsetY * plane.up.x,
        y: plane.point.y + offsetX * plane.right.y + offsetY * plane.up.y,
        z: plane.point.z + offsetX * plane.right.z + offsetY * plane.up.z,
      }

      // Sample volume at this position
      const value =
        interpolation === 'trilinear'
          ? sampleVolumeTrilinear(volumeData, worldPos)
          : sampleVolumeNearest(volumeData, worldPos)

      // Write to MPR volume
      const mprIdx = i + j * widthPixels + sliceIdx * widthPixels * heightPixels
      mprData[mprIdx] = value
    }
  }
}

/**
 * Samples CT volume at a world position using trilinear interpolation
 *
 * @param volumeData - CT volume data
 * @param worldPos - World position to sample
 * @returns Interpolated HU value
 */
function sampleVolumeTrilinear(
  volumeData: VolumeData,
  worldPos: Vector3D,
): number {
  const { dimensions, spacing, origin, data } = volumeData

  // Convert world position to voxel coordinates (continuous)
  const voxelX = (worldPos.x - origin[0]) / spacing[0]
  const voxelY = (worldPos.y - origin[1]) / spacing[1]
  const voxelZ = (worldPos.z - origin[2]) / spacing[2]

  // Get integer voxel coordinates for 8 corners of interpolation cube
  const x0 = Math.floor(voxelX)
  const y0 = Math.floor(voxelY)
  const z0 = Math.floor(voxelZ)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const z1 = z0 + 1

  // Check bounds
  if (
    x0 < 0 ||
    x1 >= dimensions[0] ||
    y0 < 0 ||
    y1 >= dimensions[1] ||
    z0 < 0 ||
    z1 >= dimensions[2]
  ) {
    return -1024 // Return air HU value for out-of-bounds
  }

  // Get fractional parts for interpolation
  const fx = voxelX - x0
  const fy = voxelY - y0
  const fz = voxelZ - z0

  // Sample 8 corners of the cube
  const v000 = getVoxel(data, dimensions, x0, y0, z0)
  const v100 = getVoxel(data, dimensions, x1, y0, z0)
  const v010 = getVoxel(data, dimensions, x0, y1, z0)
  const v110 = getVoxel(data, dimensions, x1, y1, z0)
  const v001 = getVoxel(data, dimensions, x0, y0, z1)
  const v101 = getVoxel(data, dimensions, x1, y0, z1)
  const v011 = getVoxel(data, dimensions, x0, y1, z1)
  const v111 = getVoxel(data, dimensions, x1, y1, z1)

  // Trilinear interpolation
  const v00 = v000 * (1 - fx) + v100 * fx
  const v01 = v001 * (1 - fx) + v101 * fx
  const v10 = v010 * (1 - fx) + v110 * fx
  const v11 = v011 * (1 - fx) + v111 * fx

  const v0 = v00 * (1 - fy) + v10 * fy
  const v1 = v01 * (1 - fy) + v11 * fy

  const value = v0 * (1 - fz) + v1 * fz

  return Math.round(value)
}

/**
 * Samples CT volume at a world position using nearest neighbor interpolation
 *
 * @param volumeData - CT volume data
 * @param worldPos - World position to sample
 * @returns Nearest neighbor HU value
 */
function sampleVolumeNearest(
  volumeData: VolumeData,
  worldPos: Vector3D,
): number {
  const { dimensions, spacing, origin, data } = volumeData

  // Convert world position to voxel coordinates
  const voxelX = Math.round((worldPos.x - origin[0]) / spacing[0])
  const voxelY = Math.round((worldPos.y - origin[1]) / spacing[1])
  const voxelZ = Math.round((worldPos.z - origin[2]) / spacing[2])

  // Check bounds
  if (
    voxelX < 0 ||
    voxelX >= dimensions[0] ||
    voxelY < 0 ||
    voxelY >= dimensions[1] ||
    voxelZ < 0 ||
    voxelZ >= dimensions[2]
  ) {
    return -1024 // Return air HU value for out-of-bounds
  }

  return getVoxel(data, dimensions, voxelX, voxelY, voxelZ)
}

/**
 * Gets a voxel value from the volume using linear indexing
 *
 * @param data - Volume data array
 * @param dimensions - Volume dimensions
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns Voxel value
 */
function getVoxel(
  data: Int16Array,
  dimensions: [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  const index = x + y * dimensions[0] + z * dimensions[0] * dimensions[1]
  return data[index]
}

// ============================================================================
// Vector Math Utilities
// ============================================================================

/**
 * Computes the length (magnitude) of a vector
 */
function length(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

/**
 * Normalizes a vector to unit length
 */
function normalize(v: Vector3D): Vector3D {
  const len = length(v)
  if (len < 1e-10) {
    return { x: 0, y: 0, z: 1 } // Return arbitrary unit vector if input is zero
  }
  return {
    x: v.x / len,
    y: v.y / len,
    z: v.z / len,
  }
}

/**
 * Computes the cross product of two vectors
 */
function cross(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

/**
 * Computes the dot product of two vectors
 */
function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

// ============================================================================
// Progressive Loading Support
// ============================================================================

/**
 * Configuration for progressive MPR generation
 */
export interface ProgressiveMPRConfig extends CurvedMPRConfig {
  /** Generate low-resolution preview first. Default: true */
  generatePreview?: boolean
  /** Preview downsample factor (2 = half resolution). Default: 4 */
  previewDownsample?: number
}

/**
 * Generates a curved MPR with progressive loading support
 * Returns a low-resolution preview quickly, then full resolution
 *
 * @param volumeData - CT volume data
 * @param centerlinePoints - Array of centerline points
 * @param config - Configuration including progressive settings
 * @param onPreviewReady - Callback when preview is ready
 * @returns Promise that resolves to full-resolution MPR volume
 */
export async function generateCurvedMPRProgressive(
  volumeData: VolumeData,
  centerlinePoints: Array<CenterlinePoint>,
  config: ProgressiveMPRConfig = {},
  onPreviewReady?: (preview: CurvedMPRVolume) => void,
): Promise<CurvedMPRVolume> {
  const generatePreview = config.generatePreview ?? true
  const previewDownsample = config.previewDownsample ?? 4

  // Generate low-resolution preview first
  if (generatePreview && onPreviewReady) {
    const previewConfig: CurvedMPRConfig = {
      ...config,
      planeResolution: (config.planeResolution ?? 0.5) * previewDownsample,
      interpolation: 'nearest', // Use faster interpolation for preview
    }

    const preview = generateCurvedMPR(
      volumeData,
      centerlinePoints,
      previewConfig,
    )
    onPreviewReady(preview)
  }

  // Generate full-resolution MPR
  // In a real implementation, this could use Web Workers or chunking
  // For now, we use setTimeout to allow preview to render first
  return new Promise((resolve) => {
    setTimeout(() => {
      const fullRes = generateCurvedMPR(volumeData, centerlinePoints, config)
      resolve(fullRes)
    }, 0)
  })
}

/**
 * Validates curved MPR configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result with errors if any
 */
export function validateMPRConfig(config: CurvedMPRConfig): {
  valid: boolean
  errors: Array<string>
} {
  const errors: Array<string> = []

  const samplingInterval = config.samplingInterval ?? 0.5
  const planeWidth = config.planeWidth ?? 20.0
  const planeHeight = config.planeHeight ?? 20.0
  const planeResolution = config.planeResolution ?? 0.5

  if (samplingInterval <= 0 || samplingInterval > 2.0) {
    errors.push('Sampling interval must be between 0 and 2.0 mm')
  }

  if (planeWidth <= 0 || planeWidth > 100.0) {
    errors.push('Plane width must be between 0 and 100 mm')
  }

  if (planeHeight <= 0 || planeHeight > 100.0) {
    errors.push('Plane height must be between 0 and 100 mm')
  }

  if (planeResolution <= 0 || planeResolution > 2.0) {
    errors.push('Plane resolution must be between 0 and 2.0 mm')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
