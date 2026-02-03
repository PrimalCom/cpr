/**
 * Viewport3D Component
 *
 * Renders vessel segmentation as interactive 3D surfaces using VTK.js.
 * Supports rotate, zoom, and pan interactions for vessel visualization.
 *
 * Features:
 * - VTK.js surface rendering with marching cubes
 * - Interactive camera controls (rotate, zoom, pan)
 * - Color-coded vessels (LAD=red, LCX=blue, RCA=green)
 * - Two-click centerline creation workflow with ray-casting
 * - Centerline editing with draggable control points
 * - Automatic resize handling
 * - Loading states and error handling
 */

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { CenterlineEditor } from './CenterlineEditor'
import type { Point3D } from '@/lib/imaging/centerline'
import type {
  type SegmentationMetadata,
  SurfaceRenderer,
  type VesselType,
  createSurfaceRenderer} from '@/lib/vtk/surface-renderer';
import { cn } from '@/lib/utils'
import { VTKInitError, initializeVTK } from '@/lib/vtk/init'
import { createRayCaster } from '@/lib/vtk/ray-caster'
import { useCornerstoneAutoInit } from '@/hooks/useCornerstone'
import { useCenterline } from '@/hooks/useCenterline'
import { viewerStore } from '@/lib/stores/viewer-store'

/**
 * Props for Viewport3D component
 */
export interface Viewport3DProps {
  /**
   * Segmentation data for vessels to render
   * Map of vessel type to segmentation metadata
   */
  segmentations?: Map<VesselType, SegmentationMetadata>
  /**
   * Active vessel type to highlight or focus
   */
  activeVessel?: VesselType | null
  /**
   * Whether to enable interaction (rotate, zoom, pan)
   * @default true
   */
  enableInteraction?: boolean
  /**
   * Background color [r, g, b] normalized to 0-1
   * @default [0.1, 0.1, 0.1] (dark gray)
   */
  backgroundColor?: [number, number, number]
  /**
   * Callback when vessel is clicked (for centerline creation)
   */
  onVesselClick?: (
    vesselType: VesselType,
    point3D: [number, number, number],
  ) => void
  /**
   * Additional className for the container
   */
  className?: string
  /**
   * Loading message to display
   */
  loadingMessage?: string
  /**
   * Study ID for centerline API calls
   */
  studyId?: string
  /**
   * Series ID for centerline API calls
   */
  seriesId?: string
  /**
   * Whether to enable centerline creation mode
   * @default false
   */
  enableCenterlineCreation?: boolean
}

/**
 * Viewport3D - 3D vessel visualization viewport
 *
 * Renders vessel segmentation masks as interactive 3D surfaces using VTK.js
 * marching cubes algorithm. Provides intuitive camera controls for viewing
 * vessels from any angle.
 */
export function Viewport3D({
  segmentations,
  activeVessel,
  enableInteraction = true,
  backgroundColor = [0.1, 0.1, 0.1],
  onVesselClick,
  className,
  loadingMessage = 'Initializing 3D viewer...',
  studyId,
  seriesId,
  enableCenterlineCreation = false,
}: Viewport3DProps) {
  // Container ref for VTK.js rendering
  const containerRef = useRef<HTMLDivElement>(null)

  // Surface renderer instance
  const rendererRef = useRef<SurfaceRenderer | null>(null)

  // VTK.js initialization state
  const [isVTKInitialized, setIsVTKInitialized] = useState(false)
  const [vtkError, setVTKError] = useState<VTKInitError | null>(null)

  // Cornerstone initialization (for consistency with other viewports)
  const { isInitialized: isCornerstoneInitialized, error: cornerstoneError } =
    useCornerstoneAutoInit()

  // Centerline creation state
  const centerline = useCenterline({
    vesselId: activeVessel || 'LAD',
    studyId: studyId || '',
    seriesId,
    autoCompute: true,
  })

  /**
   * Initialize VTK.js and create surface renderer
   */
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        // Initialize VTK.js
        await initializeVTK()

        if (!mounted) return

        // Create surface renderer if container is available
        if (containerRef.current && !rendererRef.current) {
          rendererRef.current = createSurfaceRenderer({
            container: containerRef.current,
            enableInteraction,
            backgroundColor,
          })

          setIsVTKInitialized(true)
        }
      } catch (err) {
        if (!mounted) return

        const error =
          err instanceof VTKInitError
            ? err
            : new VTKInitError(
                `VTK initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
                'INIT_FAILED',
              )
        setVTKError(error)
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [enableInteraction, backgroundColor])

  /**
   * Render vessel segmentations
   */
  useEffect(() => {
    if (!isVTKInitialized || !rendererRef.current || !segmentations) {
      return
    }

    const renderer = rendererRef.current

    // Clear existing vessels
    renderer.clear()

    // Render each vessel segmentation
    for (const [vesselType, metadata] of segmentations) {
      renderer.renderVessel(vesselType, metadata)
    }

    // Highlight active vessel by adjusting opacity
    if (activeVessel) {
      for (const vesselType of segmentations.keys()) {
        const opacity = vesselType === activeVessel ? 1.0 : 0.5
        renderer.setVesselOpacity(vesselType, opacity)
      }
    }

    // Reset camera to fit all vessels
    renderer.resetCamera()
  }, [isVTKInitialized, segmentations, activeVessel])

  /**
   * Handle window resize
   */
  useEffect(() => {
    if (!rendererRef.current) return

    const handleResize = () => {
      rendererRef.current?.resize()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [isVTKInitialized])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy()
        rendererRef.current = null
      }
    }
  }, [])

  /**
   * Handle click on 3D viewport for centerline creation
   */
  const handleViewportClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        !enableCenterlineCreation ||
        !rendererRef.current ||
        !containerRef.current
      ) {
        return
      }

      const renderer = rendererRef.current.getRenderer()
      if (!renderer) {
        return
      }

      // Prevent click during drag operations
      if (event.button !== 0) {
        return
      }

      // Create ray caster for picking
      const rayCaster = createRayCaster({ tolerance: 0.01 })

      try {
        // Perform ray cast pick
        const point3D = rayCaster.pickPointFromMouseEvent(
          event.nativeEvent,
          containerRef.current,
          renderer,
        )

        if (!point3D) {
          return
        }

        // Update cursor position in viewer store for cross-viewport synchronization
        viewerStore.setState((prev) => ({
          ...prev,
          cursorPosition: {
            x: point3D[0],
            y: point3D[1],
            z: point3D[2],
          },
        }))

        // Handle centerline workflow based on mode
        const { mode, addStartPoint, addEndPoint } = centerline

        if (mode === 'idle' || mode === 'awaiting-start') {
          // First click - set start point
          centerline.startCreation()
          addStartPoint({ x: point3D[0], y: point3D[1], z: point3D[2] })
        } else if (mode === 'awaiting-end') {
          // Second click - set end point and trigger computation
          addEndPoint({ x: point3D[0], y: point3D[1], z: point3D[2] })
        }

        // Call optional callback
        if (onVesselClick && activeVessel) {
          onVesselClick(activeVessel, point3D)
        }
      } finally {
        rayCaster.destroy()
      }
    },
    [enableCenterlineCreation, activeVessel, onVesselClick, centerline],
  )

  /**
   * Convert 3D world coordinates to 2D screen coordinates
   * Used by CenterlineEditor for positioning control points
   */
  const worldToScreen = useCallback(
    (point: Point3D): [number, number] | null => {
      if (!rendererRef.current || !containerRef.current) {
        return null
      }

      const renderer = rendererRef.current.getRenderer()
      if (!renderer) {
        return null
      }

      try {
        // Use VTK.js coordinate converter
        const worldPoint = [point.x, point.y, point.z]
        const displayPoint = renderer.worldToDisplay(...worldPoint)

        // VTK.js uses bottom-left origin, convert to top-left (DOM coordinates)
        const rect = containerRef.current.getBoundingClientRect()
        const x = displayPoint[0]
        const y = rect.height - displayPoint[1]

        return [x, y]
      } catch {
        return null
      }
    },
    [],
  )

  /**
   * Convert 2D screen coordinates to 3D world coordinates
   * Used by CenterlineEditor for dragging control points
   */
  const screenToWorld = useCallback((x: number, y: number): Point3D | null => {
    if (!rendererRef.current || !containerRef.current) {
      return null
    }

    const renderer = rendererRef.current.getRenderer()
    if (!renderer) {
      return null
    }

    // Create ray caster for picking
    const rayCaster = createRayCaster({ tolerance: 0.01 })

    try {
      // Convert DOM coordinates to VTK.js coordinates
      const rect = containerRef.current.getBoundingClientRect()
      const vtkY = rect.height - y

      // Perform pick
      const point3D = rayCaster.pickPoint(x, vtkY, renderer)

      if (!point3D) {
        return null
      }

      return { x: point3D[0], y: point3D[1], z: point3D[2] }
    } finally {
      rayCaster.destroy()
    }
  }, [])

  /**
   * Render loading state
   */
  if (!isCornerstoneInitialized || !isVTKInitialized) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center',
          className,
        )}
      >
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
          <div className="text-sm">{loadingMessage}</div>
        </div>
      </div>
    )
  }

  /**
   * Render error state
   */
  const error = vtkError || cornerstoneError
  if (error) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center',
          className,
        )}
      >
        <div className="flex max-w-md flex-col gap-3 rounded-lg border border-red-900 bg-red-950/50 p-6 text-red-300">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Initialization Error
          </div>
          <div className="whitespace-pre-wrap text-sm">{error.message}</div>
          <div className="text-xs text-red-400">Error code: {error.code}</div>
        </div>
      </div>
    )
  }

  /**
   * Render empty state (no segmentations)
   */
  if (!segmentations || segmentations.size === 0) {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center',
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 text-gray-500">
          <svg
            className="h-12 w-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <div className="text-sm">No vessel segmentation loaded</div>
          <div className="text-xs text-gray-600">
            Upload DICOM series with segmentation masks to view 3D vessels
          </div>
        </div>
      </div>
    )
  }

  /**
   * Render 3D viewport
   */
  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* VTK.js rendering container with click handler for centerline creation */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={enableCenterlineCreation ? handleViewportClick : undefined}
        style={
          enableCenterlineCreation && centerline.mode !== 'idle'
            ? { cursor: 'crosshair' }
            : undefined
        }
      />

      {/* Centerline editor overlay */}
      {enableCenterlineCreation && centerline.mode !== 'idle' && (
        <CenterlineEditor
          centerline={centerline}
          viewportElement={containerRef.current}
          worldToScreen={worldToScreen}
          screenToWorld={screenToWorld}
          enableEditing={centerline.mode === 'editing'}
        />
      )}

      {/* Active vessel indicator */}
      {activeVessel && (
        <div className="absolute bottom-2 right-2 rounded bg-gray-900/80 px-3 py-1 text-xs font-medium text-gray-300 backdrop-blur-sm">
          Active: {activeVessel}
        </div>
      )}

      {/* Interaction hint */}
      {enableInteraction && !enableCenterlineCreation && (
        <div className="absolute bottom-2 left-2 rounded bg-gray-900/80 px-3 py-1 text-xs text-gray-400 backdrop-blur-sm">
          <div className="flex flex-col gap-0.5">
            <div>Left-click + drag: Rotate</div>
            <div>Right-click + drag: Pan</div>
            <div>Scroll: Zoom</div>
          </div>
        </div>
      )}

      {/* Centerline creation hint */}
      {enableCenterlineCreation && centerline.mode === 'awaiting-start' && (
        <div className="absolute left-4 top-4 rounded-lg border border-blue-700 bg-blue-950/90 px-3 py-2 text-sm text-blue-200 backdrop-blur-sm">
          Click on vessel surface to set start point
        </div>
      )}
    </div>
  )
}

export default Viewport3D
