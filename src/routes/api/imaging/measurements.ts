import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { measurements } from '@/db/schema'
import { createAuditLogger } from '@/lib/imaging/audit'
import { requireAuth } from '@/lib/imaging/auth-check'

/**
 * Measurements CRUD API
 *
 * POST /api/imaging/measurements - Create new measurement
 * GET /api/imaging/measurements?centerlineId=X - Get measurements for a centerline
 * PUT /api/imaging/measurements - Update existing measurement
 * DELETE /api/imaging/measurements?id=X - Delete measurement
 *
 * Request body (POST/PUT):
 * {
 *   id?: number (for PUT)
 *   centerlineId: number
 *   position: number
 *   type: 'lumen_area' | 'wall_area' | 'min_diameter' | 'max_diameter' | 'mean_hu' | 'plaque_volume'
 *   value: number
 *   unit: string
 *   metadata?: {
 *     lumenArea?: number
 *     wallArea?: number
 *     minDiameter?: number
 *     maxDiameter?: number
 *     meanHU?: number
 *     stdHU?: number
 *     minHU?: number
 *     maxHU?: number
 *     plaqueVolume?: number
 *     stenosisPct?: number
 *   }
 * }
 */
export const Route = createFileRoute('/api/imaging/measurements')({
  server: {
    handlers: {
      // Create new measurement
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

        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        try {
          const body = await request.json()
          const { centerlineId, position, type, value, unit, metadata } = body

          // Validate required fields
          if (!centerlineId || typeof centerlineId !== 'number') {
            return new Response(
              JSON.stringify({
                error: 'centerlineId is required and must be a number',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          if (typeof position !== 'number') {
            return new Response(
              JSON.stringify({
                error: 'position is required and must be a number',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          if (!type || typeof type !== 'string') {
            return new Response(
              JSON.stringify({
                error: 'type is required and must be a string',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          if (typeof value !== 'number') {
            return new Response(
              JSON.stringify({
                error: 'value is required and must be a number',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Insert measurement
          const [insertedMeasurement] = await db
            .insert(measurements)
            .values({
              centerlineId,
              position,
              type,
              value,
              unit: unit || '',
              metadata: metadata || null,
              createdAt: new Date(),
            })
            .returning()

          // Log measurement creation to audit log
          await logAudit(
            'create_measurement',
            'measurement',
            insertedMeasurement.id,
            {
              centerlineId,
              type,
              value,
              position,
            },
          )

          return new Response(JSON.stringify(insertedMeasurement), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return new Response(null, { status: 499 })
          }

          console.error('Failed to create measurement:', error)

          return new Response(
            JSON.stringify({
              error: 'Failed to create measurement',
              message: error.message || 'Unknown error',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      // Get measurements for a centerline
      GET: async ({ request }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        // Create audit logger for this request
        const logAudit = createAuditLogger(request)

        try {
          const url = new URL(request.url)
          const centerlineId = url.searchParams.get('centerlineId')

          if (!centerlineId) {
            return new Response(
              JSON.stringify({
                error: 'centerlineId query parameter is required',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const centerlineIdNum = parseInt(centerlineId, 10)
          if (isNaN(centerlineIdNum)) {
            return new Response(
              JSON.stringify({
                error: 'centerlineId must be a valid number',
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Query measurements
          const measurementsList = await db
            .select()
            .from(measurements)
            .where(eq(measurements.centerlineId, centerlineIdNum))
            .orderBy(measurements.position)

          // Log measurement view to audit log (using centerline as resource)
          await logAudit('view', 'centerline', centerlineIdNum, {
            measurementCount: measurementsList.length,
          })

          return new Response(JSON.stringify(measurementsList), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('Failed to fetch measurements:', error)

          return new Response(
            JSON.stringify({
              error: 'Failed to fetch measurements',
              message: error.message || 'Unknown error',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      // Update existing measurement
      PUT: async ({ request }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        const requestSignal = request.signal

        // Create audit logger for this request
        const logAudit = createAuditLogger(request)

        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        try {
          const body = await request.json()
          const { id, centerlineId, position, type, value, unit, metadata } =
            body

          if (!id || typeof id !== 'number') {
            return new Response(
              JSON.stringify({ error: 'id is required and must be a number' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Update measurement
          const [updatedMeasurement] = await db
            .update(measurements)
            .set({
              centerlineId,
              position,
              type,
              value,
              unit,
              metadata: metadata || null,
            })
            .where(eq(measurements.id, id))
            .returning()

          // Log measurement edit to audit log
          await logAudit(
            'edit_measurement',
            'measurement',
            updatedMeasurement.id,
            {
              centerlineId: updatedMeasurement.centerlineId,
              type: updatedMeasurement.type,
              value: updatedMeasurement.value,
            },
          )

          return new Response(JSON.stringify(updatedMeasurement), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return new Response(null, { status: 499 })
          }

          console.error('Failed to update measurement:', error)

          return new Response(
            JSON.stringify({
              error: 'Failed to update measurement',
              message: error.message || 'Unknown error',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      // Delete measurement
      DELETE: async ({ request }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        const requestSignal = request.signal

        // Create audit logger for this request
        const logAudit = createAuditLogger(request)

        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id')

          if (!id) {
            return new Response(
              JSON.stringify({ error: 'id query parameter is required' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const idNum = parseInt(id, 10)
          if (isNaN(idNum)) {
            return new Response(
              JSON.stringify({ error: 'id must be a valid number' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Delete measurement
          const [deletedMeasurement] = await db
            .delete(measurements)
            .where(eq(measurements.id, idNum))
            .returning()

          // Log measurement deletion to audit log
          await logAudit('delete_measurement', 'measurement', idNum, {
            centerlineId: deletedMeasurement.centerlineId,
            type: deletedMeasurement.type,
          })

          return new Response(JSON.stringify({ success: true, id: idNum }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return new Response(null, { status: 499 })
          }

          console.error('Failed to delete measurement:', error)

          return new Response(
            JSON.stringify({
              error: 'Failed to delete measurement',
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
