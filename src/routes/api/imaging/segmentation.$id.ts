import { promises as fs } from 'node:fs'
import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { segmentations } from '@/db/schema'
import { requireAuth } from '@/lib/imaging/auth-check'
import { createAuditLogger } from '@/lib/imaging/audit'

/**
 * Segmentation API Endpoint
 *
 * GET /api/imaging/segmentation/:id
 * Retrieves segmentation mask data for a specific segmentation ID.
 *
 * Response:
 * {
 *   id: number
 *   seriesId: number
 *   vesselType: string | null
 *   storagePath: string | null
 *   maskData: ArrayBuffer | null
 *   createdAt: Date
 * }
 */
export const Route = createFileRoute('/api/imaging/segmentation/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        // Create audit logger for this request
        const logAudit = createAuditLogger(request)

        const segmentationId = parseInt(params.id, 10)

        if (isNaN(segmentationId)) {
          return new Response(
            JSON.stringify({
              error: 'Invalid segmentation ID',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        try {
          // Query segmentation metadata from database
          const segmentation = await db
            .select()
            .from(segmentations)
            .where(eq(segmentations.id, segmentationId))
            .limit(1)

          if (segmentation.length === 0) {
            return new Response(
              JSON.stringify({
                error: 'Segmentation not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const segmentationData = segmentation[0]

          // Log segmentation view to audit log
          await logAudit('view', 'dicom_series', segmentationData.seriesId, {
            segmentationId,
            vesselType: segmentationData.vesselType,
            userId,
          })

          // Read segmentation mask data from storage if available
          let maskData: ArrayBuffer | null = null
          if (segmentationData.storagePath) {
            try {
              const buffer = await fs.readFile(segmentationData.storagePath)
              maskData = buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength,
              )
            } catch (error: any) {
              // If file doesn't exist or can't be read, return null maskData
              console.error(
                `Failed to read segmentation mask file: ${error.message}`,
              )
            }
          }

          // Return segmentation metadata and mask data
          return new Response(
            JSON.stringify({
              id: segmentationData.id,
              seriesId: segmentationData.seriesId,
              vesselType: segmentationData.vesselType,
              storagePath: segmentationData.storagePath,
              maskData: maskData ? Array.from(new Uint8Array(maskData)) : null,
              createdAt: segmentationData.createdAt,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: any) {
          console.error('Failed to retrieve segmentation:', error)

          return new Response(
            JSON.stringify({
              error: error.message || 'Failed to retrieve segmentation data',
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
