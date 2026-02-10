import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { db } from '@/db'
import { dicomSeries, dicomStudies, segmentations } from '@/db/schema'
import { requireAuth } from '@/lib/imaging/auth-check'
import { createAuditLogger } from '@/lib/imaging/audit'

/** Path to the demo data directory */
const DEMOS_DIR = path.resolve(process.cwd(), 'data/demos')

interface DemoManifestEntry {
  name: string
  description: string
  volume: string
  ground_truth_mask: string
  ground_truth_centerlines: string
  shape: [number, number, number]
  num_vessels: number
  vessel_volume_fraction: number
}

export const Route = createFileRoute('/api/imaging/demos')({
  server: {
    handlers: {
      /**
       * GET /api/imaging/demos
       * List available demo models from the manifest
       */
      GET: async ({ request }) => {
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        try {
          const manifestPath = path.join(DEMOS_DIR, 'manifest.json')
          const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
          const manifest: Array<DemoManifestEntry> = JSON.parse(manifestRaw)

          const demos = manifest.map((entry) => ({
            name: entry.name,
            description: entry.description,
            shape: entry.shape,
            numVessels: entry.num_vessels,
          }))

          return new Response(JSON.stringify({ demos }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: unknown) {
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to load demo manifest',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      /**
       * POST /api/imaging/demos
       * Load a demo model by creating study/series/segmentation records
       * in the database, then return the study ID for the viewer.
       *
       * Body: { name: string }
       */
      POST: async ({ request }) => {
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const logAudit = createAuditLogger(request)

        try {
          const body = await request.json()
          const { name } = body as { name: string }

          if (!name) {
            return new Response(
              JSON.stringify({ error: 'Demo model name is required' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Load manifest and find the requested demo
          const manifestPath = path.join(DEMOS_DIR, 'manifest.json')
          const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
          const manifest: Array<DemoManifestEntry> = JSON.parse(manifestRaw)

          const demo = manifest.find((entry) => entry.name === name)
          if (!demo) {
            return new Response(
              JSON.stringify({ error: `Demo model "${name}" not found` }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Store paths relative to the project root for portability
          const relativeVolumePath = path.join(
            'data/demos',
            demo.volume.replace(/^data\//, ''),
          )
          const relativeMaskPath = path.join(
            'data/demos',
            demo.ground_truth_mask.replace(/^data\//, ''),
          )

          // Verify files exist using absolute paths
          const volumePath = path.resolve(process.cwd(), relativeVolumePath)
          const maskPath = path.resolve(process.cwd(), relativeMaskPath)
          await fs.access(volumePath)
          await fs.access(maskPath)

          // Create a study record for this demo
          const [studyRecord] = await db
            .insert(dicomStudies)
            .values({
              patientId: `demo-${name}`,
              studyDate: new Date(),
              description: `Demo: ${demo.description}`,
            })
            .returning({ id: dicomStudies.id })

          const studyId = studyRecord.id

          // Create a series record pointing to the volume data
          const [seriesRecord] = await db
            .insert(dicomSeries)
            .values({
              studyId,
              seriesNumber: 1,
              modality: 'DEMO',
              rows: demo.shape[1],
              columns: demo.shape[2],
              sliceCount: demo.shape[0],
              pixelSpacing: '1.0\\1.0',
              sliceThickness: 1.0,
              windowWidth: 255,
              windowCenter: 128,
              storagePath: relativeVolumePath,
            })
            .returning({ id: dicomSeries.id })

          // Create a segmentation record from the ground truth mask
          await db.insert(segmentations).values({
            seriesId: seriesRecord.id,
            vesselType: 'vessel',
            storagePath: relativeMaskPath,
          })

          await logAudit('upload', 'dicom_study', studyId, {
            demoModel: name,
            description: demo.description,
            shape: demo.shape,
          })

          return new Response(
            JSON.stringify({
              success: true,
              studyId,
              seriesId: seriesRecord.id,
              name: demo.name,
              description: demo.description,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: unknown) {
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Failed to load demo model',
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
