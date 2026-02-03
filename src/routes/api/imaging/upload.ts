import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import * as dicomParser from 'dicom-parser'
import { db } from '@/db'
import { dicomSeries, dicomStudies } from '@/db/schema'
import { env } from '@/env'
import { createAuditLogger } from '@/lib/imaging/audit'
import { requireAuth } from '@/lib/imaging/auth-check'

export const Route = createFileRoute('/api/imaging/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Check authentication - all imaging endpoints require auth
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) {
          return authResult
        }

        const { userId } = authResult

        // Create audit logger for this request
        const logAudit = createAuditLogger(request)

        const formData = await request.formData()
        const files = formData.getAll('files') as Array<File>

        if (files.length === 0) {
          return new Response(
            JSON.stringify({
              error: 'DICOM files are required',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        // Validate file size
        const maxSizeBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        for (const file of files) {
          if (file.size > maxSizeBytes) {
            return new Response(
              JSON.stringify({
                error: `File ${file.name} exceeds maximum size of ${env.MAX_UPLOAD_SIZE_MB}MB`,
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
        }

        try {
          // Parse DICOM files and group by study/series
          const studyMap = new Map<
            string,
            {
              patientId: string
              studyDate: Date | null
              description: string | null
              series: Map<
                string,
                {
                  seriesNumber: number | null
                  modality: string | null
                  rows: number | null
                  columns: number | null
                  sliceCount: number
                  pixelSpacing: string | null
                  sliceThickness: number | null
                  windowWidth: number | null
                  windowCenter: number | null
                  files: Array<{ file: File; instanceNumber: number }>
                }
              >
            }
          >()

          // Parse all DICOM files
          for (const file of files) {
            const arrayBuffer = await file.arrayBuffer()
            const byteArray = new Uint8Array(arrayBuffer)

            let dataSet: dicomParser.DataSet
            try {
              dataSet = dicomParser.parseDicom(byteArray)
            } catch (error: any) {
              return new Response(
                JSON.stringify({
                  error: `Failed to parse DICOM file ${file.name}: ${error.message}`,
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }

            // Extract metadata
            const studyInstanceUID =
              dataSet.string('x0020000d') || 'unknown-study'
            const seriesInstanceUID =
              dataSet.string('x0020000e') || 'unknown-series'
            const patientId = dataSet.string('x00100020') || 'unknown-patient'
            const studyDate = dataSet.string('x00080020')
            const studyDescription = dataSet.string('x00081030')
            const seriesNumber = dataSet.intString('x00200011')
            const instanceNumber = dataSet.intString('x00200013') || 0
            const modality = dataSet.string('x00080060')
            const rows = dataSet.uint16('x00280010')
            const columns = dataSet.uint16('x00280011')
            const pixelSpacing = dataSet.string('x00280030')
            const sliceThickness = dataSet.floatString('x00180050')
            const windowCenter = dataSet.intString('x00281050')
            const windowWidth = dataSet.intString('x00281051')

            // Parse study date
            let parsedStudyDate: Date | null = null
            if (studyDate && studyDate.length === 8) {
              const year = parseInt(studyDate.substring(0, 4))
              const month = parseInt(studyDate.substring(4, 6)) - 1
              const day = parseInt(studyDate.substring(6, 8))
              parsedStudyDate = new Date(year, month, day)
            }

            // Group by study
            if (!studyMap.has(studyInstanceUID)) {
              studyMap.set(studyInstanceUID, {
                patientId,
                studyDate: parsedStudyDate,
                description: studyDescription || null,
                series: new Map(),
              })
            }

            const study = studyMap.get(studyInstanceUID)!

            // Group by series within study
            if (!study.series.has(seriesInstanceUID)) {
              study.series.set(seriesInstanceUID, {
                seriesNumber: seriesNumber || null,
                modality: modality || null,
                rows: rows || null,
                columns: columns || null,
                sliceCount: 0,
                pixelSpacing: pixelSpacing || null,
                sliceThickness: sliceThickness || null,
                windowWidth: windowWidth || null,
                windowCenter: windowCenter || null,
                files: [],
              })
            }

            const series = study.series.get(seriesInstanceUID)!
            series.files.push({ file, instanceNumber })
            series.sliceCount++
          }

          // Ensure storage directory exists
          await fs.mkdir(env.DICOM_STORAGE_PATH, { recursive: true })

          // Create database records and store files
          const result: Array<{
            studyId: number
            seriesId: number
            seriesNumber: number | null
            sliceCount: number
          }> = []

          for (const [studyInstanceUID, study] of studyMap) {
            // Create study record
            const [studyRecord] = await db
              .insert(dicomStudies)
              .values({
                patientId: study.patientId,
                studyDate: study.studyDate,
                description: study.description,
              })
              .returning({ id: dicomStudies.id })

            const studyId = studyRecord.id

            // Log study upload to audit log
            await logAudit('upload', 'dicom_study', studyId, {
              patientId: study.patientId,
              studyDate: study.studyDate,
              seriesCount: study.series.size,
            })

            // Create series records and store files
            for (const [seriesInstanceUID, series] of study.series) {
              // Sort files by instance number
              series.files.sort((a, b) => a.instanceNumber - b.instanceNumber)

              // Create storage path for this series
              const seriesPath = path.join(
                env.DICOM_STORAGE_PATH,
                `study_${studyId}`,
                `series_${series.seriesNumber || 0}`,
              )
              await fs.mkdir(seriesPath, { recursive: true })

              // Store DICOM files
              for (const { file, instanceNumber } of series.files) {
                const fileName = `${instanceNumber.toString().padStart(4, '0')}.dcm`
                const filePath = path.join(seriesPath, fileName)
                const arrayBuffer = await file.arrayBuffer()
                await fs.writeFile(filePath, new Uint8Array(arrayBuffer))
              }

              // Create series record
              const [seriesRecord] = await db
                .insert(dicomSeries)
                .values({
                  studyId,
                  seriesNumber: series.seriesNumber,
                  modality: series.modality,
                  rows: series.rows,
                  columns: series.columns,
                  sliceCount: series.sliceCount,
                  pixelSpacing: series.pixelSpacing,
                  sliceThickness: series.sliceThickness,
                  windowWidth: series.windowWidth,
                  windowCenter: series.windowCenter,
                  storagePath: seriesPath,
                })
                .returning({ id: dicomSeries.id })

              // Log series upload to audit log
              await logAudit('upload', 'dicom_series', seriesRecord.id, {
                studyId,
                seriesNumber: series.seriesNumber,
                modality: series.modality,
                sliceCount: series.sliceCount,
              })

              result.push({
                studyId,
                seriesId: seriesRecord.id,
                seriesNumber: series.seriesNumber,
                sliceCount: series.sliceCount,
              })
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              studies: Array.from(studyMap.keys()).length,
              series: result,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred during upload',
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
