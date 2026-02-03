import { createFileRoute } from '@tanstack/react-router'
import type {CenterlineConfig, ControlPoint, Point3D, SegmentationMask} from '@/lib/imaging/centerline';
import { db } from '@/db'
import { centerlinePoints, centerlines } from '@/db/schema'
import {
  
  
  
  
  computeCenterline,
  validateCenterline
} from '@/lib/imaging/centerline'
import { createAuditLogger } from '@/lib/imaging/audit'
import { requireAuth } from '@/lib/imaging/auth-check'

/**
 * Centerline Computation API
 *
 * POST /api/imaging/centerline
 * Creates a new centerline for a vessel by computing a B-spline curve through
 * start and end points. Saves the centerline and all computed points to the database.
 *
 * Request body:
 * {
 *   studyId: number
 *   vesselType: 'LAD' | 'LCX' | 'RCA'
 *   startPoint: { x: number, y: number, z: number }
 *   endPoint: { x: number, y: number, z: number }
 *   intermediatePoints?: ControlPoint[]
 *   config?: CenterlineConfig
 *   segmentation?: SegmentationMask
 * }
 *
 * Response:
 * {
 *   centerlineId: number
 *   points: CenterlinePoint[]
 *   totalLength: number
 *   controlPoints: ControlPoint[]
 *   hasDeviations: boolean
 *   validation: { valid: boolean, errors: string[] }
 * }
 */
export const Route = createFileRoute('/api/imaging/centerline')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        const requestSignal = request.signal

        // Create audit logger for this request
        const logAudit = createAuditLogger(request)

        // Check if request is already aborted
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 }) // Client Closed Request
        }

        try {
          // Parse request body
          const body = await request.json()
          const {
            studyId,
            vesselType,
            startPoint,
            endPoint,
            intermediatePoints = [],
            config = {},
            segmentation,
          } = body

          // Validate required fields
          if (!studyId || typeof studyId !== 'number') {
            return new Response(
              JSON.stringify({
                error: 'studyId is required and must be a number',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          if (!vesselType || !['LAD', 'LCX', 'RCA'].includes(vesselType)) {
            return new Response(
              JSON.stringify({ error: 'vesselType must be LAD, LCX, or RCA' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          if (
            !startPoint ||
            typeof startPoint.x !== 'number' ||
            typeof startPoint.y !== 'number' ||
            typeof startPoint.z !== 'number'
          ) {
            return new Response(
              JSON.stringify({
                error: 'startPoint must have x, y, z coordinates',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          if (
            !endPoint ||
            typeof endPoint.x !== 'number' ||
            typeof endPoint.y !== 'number' ||
            typeof endPoint.z !== 'number'
          ) {
            return new Response(
              JSON.stringify({
                error: 'endPoint must have x, y, z coordinates',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Compute centerline using B-spline interpolation
          const centerlineResult = computeCenterline(
            startPoint as Point3D,
            endPoint as Point3D,
            intermediatePoints as Array<ControlPoint>,
            config as CenterlineConfig,
            segmentation as SegmentationMask | undefined,
          )

          // Validate centerline for anatomical plausibility
          const validation = validateCenterline(centerlineResult)

          // Save centerline to database
          const [insertedCenterline] = await db
            .insert(centerlines)
            .values({
              studyId,
              vesselType,
              controlPoints: centerlineResult.controlPoints,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning()

          // Save all centerline points to database
          const pointsToInsert = centerlineResult.points.map(
            (point, index) => ({
              centerlineId: insertedCenterline.id,
              position: index,
              x: point.x,
              y: point.y,
              z: point.z,
              createdAt: new Date(),
            }),
          )

          await db.insert(centerlinePoints).values(pointsToInsert)

          // Log centerline creation to audit log
          await logAudit(
            'create_centerline',
            'centerline',
            insertedCenterline.id,
            {
              studyId,
              vesselType,
              pointCount: centerlineResult.points.length,
              totalLength: centerlineResult.totalLength,
            },
          )

          // Return the computed centerline with database ID
          return new Response(
            JSON.stringify({
              centerlineId: insertedCenterline.id,
              points: centerlineResult.points,
              totalLength: centerlineResult.totalLength,
              controlPoints: centerlineResult.controlPoints,
              hasDeviations: centerlineResult.hasDeviations,
              validation,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: any) {
          // Handle abort errors
          if (error.name === 'AbortError') {
            return new Response(null, { status: 499 })
          }

          // Log error details for debugging
          console.error('Centerline computation error:', error)

          // Return error response
          return new Response(
            JSON.stringify({
              error: 'Failed to compute centerline',
              message: error.message || 'Unknown error',
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
