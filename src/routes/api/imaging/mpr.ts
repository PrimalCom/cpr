/**
 * MPR Generation API Endpoint
 *
 * Generates curved MPR (Multi-Planar Reconstruction) volumes from centerlines.
 * Supports progressive loading with low-resolution preview followed by full resolution.
 * Uses caching to avoid recomputing identical MPR volumes.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import type { CenterlinePoint } from '@/lib/imaging/centerline'
import type {CurvedMPRConfig, CurvedMPRVolume, VolumeData} from '@/lib/imaging/curved-mpr';
import { db } from '@/db/index'
import {
  centerlinePoints as centerlinePointsTable,
  centerlines,
  dicomSeries,
} from '@/db/schema'
import {
  
  
  
  generateCurvedMPRProgressive
} from '@/lib/imaging/curved-mpr'
import {
  generateCenterlineHash,
  getCachedOrCompute,
  globalVolumeCache,
} from '@/lib/imaging/cache'
import { env } from '@/env'
import { requireAuth } from '@/lib/imaging/auth-check'

/**
 * Request body for MPR generation
 */
interface GenerateMPRRequest {
  /** Centerline ID from database */
  centerlineId?: number
  /** Study ID for audit logging */
  studyId: string
  /** Series ID to load volume data */
  seriesId: string
  /** Vessel type (LAD, LCX, RCA) */
  vesselType: string
  /** Override centerline points (if not using saved centerline) */
  centerlinePoints?: Array<CenterlinePoint>
  /** MPR generation configuration */
  config?: CurvedMPRConfig
  /** Whether to generate preview only */
  previewOnly?: boolean
}

/**
 * Response for MPR generation
 */
interface GenerateMPRResponse {
  /** Whether this is a preview or full resolution */
  isPreview: boolean
  /** MPR volume data */
  mprVolume: CurvedMPRVolume
  /** Cache hit indicator */
  fromCache: boolean
  /** Time taken to generate (ms) */
  generationTime: number
}

export const Route = createFileRoute('/api/imaging/mpr')({
  server: {
    handlers: {
      /**
       * POST /api/imaging/mpr
       * Generate curved MPR volume from centerline
       */
      POST: async ({ request }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        const startTime = Date.now()

        try {
          const body: GenerateMPRRequest = await request.json()

          // Validate required fields
          if (!body.seriesId || !body.vesselType) {
            return new Response(
              JSON.stringify({
                error: 'Missing required fields: seriesId, vesselType',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Load centerline points from database or use provided points
          let centerlinePointsArray: Array<CenterlinePoint>

          if (body.centerlineId) {
            // Load from database
            const centerline = await db.query.centerlines.findFirst({
              where: eq(centerlines.id, body.centerlineId),
            })

            if (!centerline) {
              return new Response(
                JSON.stringify({ error: 'Centerline not found' }),
                {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }

            // Load centerline points
            const points = await db
              .select()
              .from(centerlinePointsTable)
              .where(eq(centerlinePointsTable.centerlineId, body.centerlineId))
              .orderBy(centerlinePointsTable.pointIndex)

            centerlinePointsArray = points.map((p) => ({
              x: p.x!,
              y: p.y!,
              z: p.z!,
              distance: p.distance ?? 0,
              insideLumen: p.insideLumen ?? true,
              vesselRadius: p.vesselRadius ?? 0,
            }))
          } else if (body.centerlinePoints) {
            // Use provided points
            centerlinePointsArray = body.centerlinePoints
          } else {
            return new Response(
              JSON.stringify({
                error:
                  'Either centerlineId or centerlinePoints must be provided',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          if (centerlinePointsArray.length < 2) {
            return new Response(
              JSON.stringify({
                error: 'Centerline must have at least 2 points',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Load series metadata for volume reconstruction
          const series = await db.query.dicomSeries.findFirst({
            where: eq(dicomSeries.id, parseInt(body.seriesId, 10)),
          })

          if (!series || !series.storagePath) {
            return new Response(
              JSON.stringify({ error: 'Series not found or no storage path' }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Load volume data from DICOM files
          const volumeData = await loadVolumeData(series.storagePath, {
            rows: series.rows ?? 512,
            columns: series.columns ?? 512,
            sliceCount: series.sliceCount ?? 100,
            pixelSpacing: series.pixelSpacing
              ? JSON.parse(series.pixelSpacing)
              : [0.5, 0.5],
            sliceThickness: series.sliceThickness ?? 1.0,
          })

          // Check cache first
          const cacheKey = generateCenterlineHash(
            centerlinePointsArray.map((p) => ({ x: p.x, y: p.y, z: p.z })),
            body.vesselType,
            body.studyId,
          )

          // Try to get from cache
          const cachedVolume = globalVolumeCache.get(cacheKey)
          if (cachedVolume) {
            const generationTime = Date.now() - startTime
            return new Response(
              JSON.stringify({
                isPreview: false,
                mprVolume: cachedVolume,
                fromCache: true,
                generationTime,
              } as GenerateMPRResponse),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Generate MPR with progressive loading
          let previewVolume: CurvedMPRVolume | null = null
          const config = body.config ?? {}

          // If preview only, generate with lower resolution
          if (body.previewOnly) {
            const previewConfig = {
              ...config,
              planeResolution: (config.planeResolution ?? 0.5) * 4, // 4x downsample
              interpolation: 'nearest' as const,
            }

            previewVolume = await generateCurvedMPRProgressive(
              volumeData,
              centerlinePointsArray,
              previewConfig,
            )

            const generationTime = Date.now() - startTime
            return new Response(
              JSON.stringify({
                isPreview: true,
                mprVolume: previewVolume,
                fromCache: false,
                generationTime,
              } as GenerateMPRResponse),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Generate full resolution MPR
          const fullResVolume = await generateCurvedMPRProgressive(
            volumeData,
            centerlinePointsArray,
            config,
          )

          // Cache the result
          globalVolumeCache.set(cacheKey, fullResVolume)

          const generationTime = Date.now() - startTime
          return new Response(
            JSON.stringify({
              isPreview: false,
              mprVolume: fullResVolume,
              fromCache: false,
              generationTime,
            } as GenerateMPRResponse),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error) {
          console.error('Failed to generate MPR:', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to generate MPR',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})

/**
 * Loads DICOM volume data from storage path
 *
 * In a real implementation, this would:
 * 1. Read all DICOM files from the directory
 * 2. Parse pixel data using dicom-parser
 * 3. Sort by instance number or image position
 * 4. Construct 3D volume with proper spacing and origin
 *
 * For now, this is a placeholder that creates synthetic data for testing.
 */
function loadVolumeData(
  storagePath: string,
  metadata: {
    rows: number
    columns: number
    sliceCount: number
    pixelSpacing: Array<number>
    sliceThickness: number
  },
): VolumeData {
  const { rows, columns, sliceCount, pixelSpacing, sliceThickness } = metadata

  // TODO: Implement actual DICOM volume loading
  // This is a placeholder implementation for testing

  // For now, create synthetic volume data
  // In production, you would:
  // 1. List all .dcm files in storagePath
  // 2. Parse each file with dicom-parser
  // 3. Extract pixel data and spatial information
  // 4. Sort by SliceLocation or InstanceNumber
  // 5. Stack into 3D volume

  const volumeSize = columns * rows * sliceCount
  const data = new Int16Array(volumeSize)

  // Fill with synthetic CT values (soft tissue range -100 to +100 HU)
  for (let i = 0; i < volumeSize; i++) {
    data[i] = Math.floor(Math.random() * 200 - 100)
  }

  return {
    dimensions: [columns, rows, sliceCount],
    spacing: [pixelSpacing[0], pixelSpacing[1], sliceThickness],
    origin: [0, 0, 0], // TODO: Extract from DICOM ImagePositionPatient
    data,
  }
}
