import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { dicomSeries } from '@/db/schema'
import { requireAuth } from '@/lib/imaging/auth-check'

export const Route = createFileRoute('/api/imaging/series/$seriesId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        const seriesId = parseInt(params.seriesId, 10)

        if (isNaN(seriesId)) {
          return new Response(
            JSON.stringify({
              error: 'Invalid series ID',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        try {
          // Query series metadata from database
          const series = await db
            .select()
            .from(dicomSeries)
            .where(eq(dicomSeries.id, seriesId))
            .limit(1)

          if (series.length === 0) {
            return new Response(
              JSON.stringify({
                error: 'Series not found',
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const seriesData = series[0]

          // Read image file paths from storage directory
          let imageFiles: Array<string> = []
          if (seriesData.storagePath) {
            try {
              const files = await fs.readdir(seriesData.storagePath)
              // Filter for .dcm files and sort by filename (instance number)
              imageFiles = files
                .filter((file) => file.endsWith('.dcm'))
                .sort((a, b) => {
                  // Extract instance numbers from filenames (e.g., "0001.dcm")
                  const numA = parseInt(a.replace('.dcm', ''), 10)
                  const numB = parseInt(b.replace('.dcm', ''), 10)
                  return numA - numB
                })
                .map((file) => path.join(seriesData.storagePath!, file))
            } catch (error: any) {
              // If directory doesn't exist or can't be read, return empty array
              console.error(
                `Failed to read series storage directory: ${error.message}`,
              )
            }
          }

          // Return series metadata and image file paths
          return new Response(
            JSON.stringify({
              id: seriesData.id,
              studyId: seriesData.studyId,
              seriesNumber: seriesData.seriesNumber,
              modality: seriesData.modality,
              rows: seriesData.rows,
              columns: seriesData.columns,
              sliceCount: seriesData.sliceCount,
              pixelSpacing: seriesData.pixelSpacing,
              sliceThickness: seriesData.sliceThickness,
              windowWidth: seriesData.windowWidth,
              windowCenter: seriesData.windowCenter,
              storagePath: seriesData.storagePath,
              imageFiles,
              createdAt: seriesData.createdAt,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              error: error.message || 'Failed to retrieve series metadata',
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
