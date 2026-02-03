import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Suspense, lazy, useEffect, useState } from 'react'
import { and, eq } from 'drizzle-orm'
import { useStore } from '@tanstack/react-store'
import type {CenterlinePoint, VesselCenterline} from '@/lib/stores/centerline-store';
import type {MeasurementResult} from '@/lib/stores/measurement-store';
import type { CurvedMPRVolume } from '@/lib/imaging/curved-mpr'
import { db } from '@/db/index'
import {
  centerlinePoints,
  centerlines,
  dicomSeries,
  dicomStudies,
  measurements,
  segmentations,
} from '@/db/schema'
import { authClient } from '@/lib/auth-client'
import {
  
  
  centerlineStore
} from '@/lib/stores/centerline-store'
import {
  
  measurementStore
} from '@/lib/stores/measurement-store'

// Dynamically import heavy imaging libraries for code splitting
const ViewerLayout = lazy(() => import('@/components/viewer/ViewerLayout'))
const Viewport3D = lazy(() => import('@/components/viewer/Viewport3D'))
const ViewportMPR = lazy(() => import('@/components/viewer/ViewportMPR'))

/**
 * Server function to load study data and related series/segmentations
 */
const getStudyData = createServerFn({
  method: 'GET',
})
  .inputValidator((studyId: string) => studyId)
  .handler(async ({ data: studyId }) => {
    const studyIdNum = parseInt(studyId, 10)

    if (isNaN(studyIdNum)) {
      throw new Error('Invalid study ID')
    }

    // Fetch study
    const study = await db.query.dicomStudies.findFirst({
      where: eq(dicomStudies.id, studyIdNum),
    })

    if (!study) {
      throw new Error('Study not found')
    }

    // Fetch all series for this study
    const series = await db
      .select()
      .from(dicomSeries)
      .where(eq(dicomSeries.studyId, studyIdNum))

    // Fetch segmentations for all series
    const seriesIds = series.map((s) => s.id)
    const studySegmentations =
      seriesIds.length > 0
        ? await db
            .select()
            .from(segmentations)
            .where(eq(segmentations.seriesId, seriesIds[0])) // Simplified for now
        : []

    return {
      study,
      series,
      segmentations: studySegmentations,
    }
  })

/**
 * Server function to load saved centerlines for a study
 */
const getCenterlines = createServerFn({
  method: 'GET',
})
  .inputValidator((studyId: string) => studyId)
  .handler(async ({ data: studyId }) => {
    const studyIdNum = parseInt(studyId, 10)

    if (isNaN(studyIdNum)) {
      throw new Error('Invalid study ID')
    }

    // Fetch centerlines for this study
    const studyCenterlines = await db.query.centerlines.findMany({
      where: eq(centerlines.studyId, studyIdNum),
    })

    // Fetch points for each centerline
    const centerlinesWithPoints = await Promise.all(
      studyCenterlines.map(async (cl) => {
        const points = await db
          .select()
          .from(centerlinePoints)
          .where(eq(centerlinePoints.centerlineId, cl.id))
          .orderBy(centerlinePoints.position)

        return {
          id: cl.id,
          vesselType: cl.vesselType,
          points: points.map((p) => ({
            x: p.x!,
            y: p.y!,
            z: p.z!,
            radius: 0, // Default radius if not stored
          })),
        }
      }),
    )

    return centerlinesWithPoints
  })

/**
 * Server function to load saved measurements for a study
 */
const getMeasurements = createServerFn({
  method: 'GET',
})
  .inputValidator((studyId: string) => studyId)
  .handler(async ({ data: studyId }) => {
    const studyIdNum = parseInt(studyId, 10)

    if (isNaN(studyIdNum)) {
      throw new Error('Invalid study ID')
    }

    // First get all centerlines for this study to get their IDs
    const studyCenterlines = await db
      .select()
      .from(centerlines)
      .where(eq(centerlines.studyId, studyIdNum))

    if (studyCenterlines.length === 0) {
      return []
    }

    const centerlineIds = studyCenterlines.map((cl) => cl.id)

    // Fetch measurements for these centerlines
    const studyMeasurements = await db.query.measurements.findMany({
      where: eq(measurements.centerlineId, centerlineIds[0]), // Simplified for now
    })

    return studyMeasurements.map((m) => ({
      id: m.id.toString(),
      vesselId:
        studyCenterlines.find((cl) => cl.id === m.centerlineId)?.vesselType ||
        'unknown',
      type: m.type as 'length' | 'diameter' | 'area' | 'angle',
      value: m.value!,
      unit: m.unit!,
      timestamp: new Date(m.createdAt!).getTime(),
      metadata: m.metadata as Record<string, unknown> | undefined,
    }))
  })

/**
 * Server function to save a centerline
 */
const saveCenterline = createServerFn({
  method: 'POST',
})
  .inputValidator(
    (data: {
      studyId: number
      vesselType: string
      points: Array<CenterlinePoint>
    }) => data,
  )
  .handler(async ({ data }) => {
    try {
      // Check if centerline already exists
      const existing = await db.query.centerlines.findFirst({
        where: and(
          eq(centerlines.studyId, data.studyId),
          eq(centerlines.vesselType, data.vesselType),
        ),
      })

      let centerlineId: number

      if (existing) {
        // Update existing centerline
        await db
          .update(centerlines)
          .set({
            controlPoints: data.points,
            updatedAt: new Date(),
          })
          .where(eq(centerlines.id, existing.id))

        centerlineId = existing.id

        // Delete old points
        await db
          .delete(centerlinePoints)
          .where(eq(centerlinePoints.centerlineId, centerlineId))
      } else {
        // Create new centerline
        const [newCenterline] = await db
          .insert(centerlines)
          .values({
            studyId: data.studyId,
            vesselType: data.vesselType,
            controlPoints: data.points,
          })
          .returning()

        centerlineId = newCenterline.id
      }

      // Insert points
      if (data.points.length > 0) {
        await db.insert(centerlinePoints).values(
          data.points.map((point, index) => ({
            centerlineId,
            position: index,
            x: point.x,
            y: point.y,
            z: point.z,
          })),
        )
      }

      return { success: true, centerlineId }
    } catch (error) {
      throw new Error(
        `Failed to save centerline: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  })

/**
 * Server function to save a measurement
 */
const saveMeasurement = createServerFn({
  method: 'POST',
})
  .inputValidator(
    (data: {
      studyId: number
      vesselId: string
      type: string
      value: number
      unit: string
      metadata?: Record<string, unknown>
    }) => data,
  )
  .handler(async ({ data }) => {
    try {
      // Find the centerline for this vessel
      const centerline = await db.query.centerlines.findFirst({
        where: and(
          eq(centerlines.studyId, data.studyId),
          eq(centerlines.vesselType, data.vesselId),
        ),
      })

      if (!centerline) {
        throw new Error('Centerline not found for this vessel')
      }

      // Insert measurement
      const [newMeasurement] = await db
        .insert(measurements)
        .values({
          centerlineId: centerline.id,
          position: 0, // Position along centerline, if applicable
          type: data.type,
          value: data.value,
          unit: data.unit,
          metadata: data.metadata,
        })
        .returning()

      return { success: true, measurementId: newMeasurement.id }
    } catch (error) {
      throw new Error(
        `Failed to save measurement: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  })

/**
 * Server function to delete a centerline
 */
const deleteCenterline = createServerFn({
  method: 'POST',
})
  .inputValidator((data: { studyId: number; vesselType: string }) => data)
  .handler(async ({ data }) => {
    try {
      const centerline = await db.query.centerlines.findFirst({
        where: and(
          eq(centerlines.studyId, data.studyId),
          eq(centerlines.vesselType, data.vesselType),
        ),
      })

      if (!centerline) {
        return { success: true }
      }

      // Delete associated points and measurements
      await db
        .delete(centerlinePoints)
        .where(eq(centerlinePoints.centerlineId, centerline.id))
      await db
        .delete(measurements)
        .where(eq(measurements.centerlineId, centerline.id))
      await db.delete(centerlines).where(eq(centerlines.id, centerline.id))

      return { success: true }
    } catch (error) {
      throw new Error(
        `Failed to delete centerline: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  })

export const Route = createFileRoute('/viewer/$studyId')({
  component: ViewerPage,
  loader: async ({ params }) => {
    try {
      const [studyData, savedCenterlines, savedMeasurements] =
        await Promise.all([
          getStudyData({ data: params.studyId }),
          getCenterlines({ data: params.studyId }),
          getMeasurements({ data: params.studyId }),
        ])

      return {
        ...studyData,
        savedCenterlines,
        savedMeasurements,
      }
    } catch (error) {
      throw new Error(
        `Failed to load study: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },
  // Authentication will be checked in the component
  // Server-side auth check could be added to beforeLoad if needed
})

function ViewerPage() {
  const { study, series, segmentations: studySegmentations, savedCenterlines, savedMeasurements } =
    Route.useLoaderData()
  const { data: session, isPending } = authClient.useSession()

  // Show loading state while checking authentication
  if (isPending) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
          <div className="text-sm">Loading viewer...</div>
        </div>
      </div>
    )
  }

  // Redirect to auth page if not logged in
  if (!session?.user) {
    // In a real app, we'd use redirect() from TanStack Router
    // For now, show an authentication required message
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-950">
        <div className="flex max-w-md flex-col gap-4 rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
          <div className="flex items-center justify-center gap-2 text-xl font-semibold text-gray-200">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Authentication Required
          </div>
          <p className="text-sm text-gray-400">
            You must be logged in to access the medical imaging viewer.
          </p>
          <a
            href="/demo/better-auth"
            className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Go to Login
          </a>
        </div>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-gray-950">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
            <div className="text-sm">Loading medical imaging libraries...</div>
          </div>
        </div>
      }
    >
      <ViewerContent
        study={study}
        series={series}
        studySegmentations={studySegmentations}
        savedCenterlines={savedCenterlines}
        savedMeasurements={savedMeasurements}
      />
    </Suspense>
  )
}

interface ViewerContentProps {
  study: {
    id: number
    patientId: string | null
    studyDate: Date | null
    description: string | null
    createdAt: Date | null
  }
  series: Array<{
    id: number
    studyId: number
    seriesNumber: number | null
    modality: string | null
    rows: number | null
    columns: number | null
    sliceCount: number | null
    pixelSpacing: string | null
    sliceThickness: number | null
    windowWidth: number | null
    windowCenter: number | null
    storagePath: string | null
    createdAt: Date | null
  }>
  studySegmentations: Array<{
    id: number
    seriesId: number
    vesselType: string | null
    storagePath: string | null
    createdAt: Date | null
  }>
  savedCenterlines: Array<{
    id: number
    vesselType: string
    points: Array<CenterlinePoint>
  }>
  savedMeasurements: Array<MeasurementResult>
}

function ViewerContent({
  study,
  series,
  studySegmentations,
  savedCenterlines,
  savedMeasurements,
}: ViewerContentProps) {
  const router = useRouter()

  // MPR state management
  const [mprPreview, setMprPreview] = useState<CurvedMPRVolume | null>(null)
  const [mprFullRes, setMprFullRes] = useState<CurvedMPRVolume | null>(null)
  const [isLoadingMPR, setIsLoadingMPR] = useState(false)
  const [mprError, setMprError] = useState<string | null>(null)

  // Watch centerline store for changes
  const centerlineState = useStore(centerlineStore)
  const measurementState = useStore(measurementStore)

  // Active vessel tracking (for now, default to LAD)
  const [activeVessel, setActiveVessel] = useState<string>('LAD')

  // Track if stores have been initialized
  const [storesInitialized, setStoresInitialized] = useState(false)

  // Get the first series (primary CT volume)
  const primarySeries = series[0]

  /**
   * Initialize stores with saved data on mount
   */
  useEffect(() => {
    if (storesInitialized) return

    // Initialize centerline store
    const centerlinesMap = new Map<string, VesselCenterline>()
    savedCenterlines.forEach((cl) => {
      centerlinesMap.set(cl.vesselType, {
        vesselId: cl.vesselType,
        points: cl.points,
        length: 0, // Calculate if needed
      })
    })

    centerlineStore.setState({
      centerlines: centerlinesMap,
    })

    // Initialize measurement store
    measurementStore.setState({
      measurements: savedMeasurements,
    })

    setStoresInitialized(true)
  }, [savedCenterlines, savedMeasurements, storesInitialized])

  /**
   * Auto-save centerlines when they change
   */
  useEffect(() => {
    if (!storesInitialized) return

    // Save each centerline
    centerlineState.centerlines.forEach(async (centerline, vesselId) => {
      if (centerline.points.length > 0) {
        try {
          await saveCenterline({
            data: {
              studyId: study.id,
              vesselType: vesselId,
              points: centerline.points,
            },
          })
        } catch (error) {
          // Silent fail or show toast notification
        }
      }
    })
  }, [centerlineState.centerlines, storesInitialized, study.id])

  /**
   * Auto-save measurements when they change
   */
  useEffect(() => {
    if (!storesInitialized) return

    // Save new measurements (simple check: compare with saved)
    const newMeasurements = measurementState.measurements.filter(
      (m) =>
        !savedMeasurements.some((saved) => saved.id === m.id) &&
        !isNaN(Number(m.id)),
    )

    newMeasurements.forEach(async (measurement) => {
      try {
        await saveMeasurement({
          data: {
            studyId: study.id,
            vesselId: measurement.vesselId,
            type: measurement.type,
            value: measurement.value,
            unit: measurement.unit,
            metadata: measurement.metadata,
          },
        })
      } catch (error) {
        // Silent fail or show toast notification
      }
    })
  }, [
    measurementState.measurements,
    storesInitialized,
    study.id,
    savedMeasurements,
  ])

  /**
   * Generate MPR when centerline is available
   */
  useEffect(() => {
    const centerline = centerlineState.centerlines.get(activeVessel)

    if (!centerline) {
      // No centerline or series data, clear MPR
      setMprPreview(null)
      setMprFullRes(null)
      return
    }

    // Check if we already have MPR for this centerline
    // (Simple check: if we have full res data, skip)
    if (mprFullRes) {
      return
    }

    // Generate MPR
    generateMPR(centerline.points, primarySeries.id.toString())
  }, [centerlineState.centerlines, activeVessel, primarySeries])

  /**
   * Generates MPR via API with progressive loading
   */
  const generateMPR = async (
    clPoints: Array<{
      x: number
      y: number
      z: number
      radius: number
    }>,
    seriesId: string,
  ) => {
    setIsLoadingMPR(true)
    setMprError(null)

    try {
      // Step 1: Generate preview (low resolution) for quick feedback
      const previewResponse = await fetch('/api/imaging/mpr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyId: study.id.toString(),
          seriesId,
          vesselType: activeVessel,
          centerlinePoints: clPoints.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
            distance: 0,
            insideLumen: true,
            vesselRadius: p.radius,
          })),
          previewOnly: true,
        }),
      })

      if (previewResponse.ok) {
        const previewData = await previewResponse.json()
        setMprPreview(previewData.mprVolume)
      }

      // Step 2: Generate full resolution in background
      const fullResResponse = await fetch('/api/imaging/mpr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyId: study.id.toString(),
          seriesId,
          vesselType: activeVessel,
          centerlinePoints: clPoints.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
            distance: 0,
            insideLumen: true,
            vesselRadius: p.radius,
          })),
          previewOnly: false,
        }),
      })

      if (!fullResResponse.ok) {
        throw new Error('Failed to generate full resolution MPR')
      }

      const fullResData = await fullResResponse.json()
      setMprFullRes(fullResData.mprVolume)
      // Clear preview once full resolution is ready
      setMprPreview(null)
    } catch (error) {
      console.error('MPR generation failed:', error)
      setMprError(
        error instanceof Error ? error.message : 'Failed to generate MPR',
      )
    } finally {
      setIsLoadingMPR(false)
    }
  }

  // TODO: Convert segmentations to the format expected by Viewport3D
  // For now, we'll pass empty data to show the UI structure
  const segmentationMap = new Map()

  return (
    <ViewerLayout
      viewport3D={
        <Viewport3D
          segmentations={segmentationMap}
          activeVessel={null}
          enableInteraction={true}
        />
      }
      viewportMPR={
        <ViewportMPR
          mprVolume={mprFullRes || mprPreview}
          isPreview={!mprFullRes && !!mprPreview}
          loadingMessage={
            isLoadingMPR
              ? 'Generating curved MPR...'
              : mprError
                ? `Error: ${mprError}`
                : 'Loading curved MPR...'
          }
          enableInteraction={true}
          onCursorPositionChange={(sliceIndex, normalizedPosition) => {
            // TODO: Wire up cross-section viewport in Phase 6
            console.log('MPR cursor position:', sliceIndex, normalizedPosition)
          }}
        />
      }
      viewportCrossSection={
        <div className="flex h-full items-center justify-center text-gray-600">
          Cross-Section will be implemented in Phase 6
        </div>
      }
      viewportStraightened={
        <div className="flex h-full items-center justify-center text-gray-600">
          Straightened view will be implemented in Phase 6
        </div>
      }
      toolbar={
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <span>Study: {study.patientId || 'Unknown'}</span>
          <span>•</span>
          <span>{series.length} series</span>
          <span>•</span>
          <span>{studySegmentations.length} segmentations</span>
        </div>
      }
      vesselSelector={
        <div className="flex gap-2">
          <button className="rounded border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-300 transition-colors hover:bg-gray-700">
            LAD
          </button>
          <button className="rounded border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-300 transition-colors hover:bg-gray-700">
            LCX
          </button>
          <button className="rounded border border-gray-700 bg-gray-800 px-3 py-1 text-sm text-gray-300 transition-colors hover:bg-gray-700">
            RCA
          </button>
        </div>
      }
    />
  )
}
