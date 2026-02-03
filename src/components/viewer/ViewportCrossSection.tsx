/**
 * ViewportCrossSection Component
 *
 * Displays perpendicular cross-section at the current centerline position.
 * Clicking on curved MPR updates the cross-section position.
 * Includes segmentation overlay rendering (lumen and vessel wall contours).
 *
 * Features:
 * - Cornerstone3D viewport for 2D cross-section display
 * - Updates based on cursor position from MPR viewport
 * - Segmentation overlay support for lumen and vessel wall contours
 * - Window/level adjustments from viewer store
 * - Measurement annotations support
 * - Automatic resize handling
 * - Loading states and error handling
 */

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import type { CurvedMPRVolume } from '@/lib/imaging/curved-mpr'
import { cn } from '@/lib/utils'
import { useCornerstoneAutoInit } from '@/hooks/useCornerstone'
import { viewerStore } from '@/lib/stores/viewer-store'
import { getGlobalSyncManager } from '@/lib/cornerstone/viewport-sync'

/**
 * Segmentation data for overlay rendering
 */
export interface SegmentationData {
  /** Lumen contour points [[x, y], [x, y], ...] */
  lumenContour?: Array<[number, number]>
  /** Vessel wall outer contour points [[x, y], [x, y], ...] */
  vesselWallContour?: Array<[number, number]>
  /** Lumen area in mm² */
  lumenArea?: number
  /** Vessel wall area in mm² */
  vesselWallArea?: number
}

/**
 * Props for ViewportCrossSection component
 */
export interface ViewportCrossSectionProps {
  /**
   * Curved MPR volume data (source for cross-section extraction)
   */
  mprVolume?: CurvedMPRVolume | null
  /**
   * Current slice index along centerline (which cross-section to display)
   */
  sliceIndex?: number | null
  /**
   * Segmentation data for overlay rendering at current position
   */
  segmentation?: SegmentationData | null
  /**
   * Whether to show segmentation overlay
   * @default true
   */
  showSegmentation?: boolean
  /**
   * Whether to enable interaction
   * @default true
   */
  enableInteraction?: boolean
  /**
   * Additional className for the container
   */
  className?: string
  /**
   * Loading message to display
   */
  loadingMessage?: string
  /**
   * Viewport ID for Cornerstone (must be unique)
   * @default 'cross-section-viewport'
   */
  viewportId?: string
}

/**
 * ViewportCrossSection - Cross-sectional analysis viewport
 *
 * Renders perpendicular cross-sections at specific positions along the centerline.
 * Extracted from curved MPR volume data. Supports segmentation overlay for
 * lumen and vessel wall visualization.
 */
export function ViewportCrossSection({
  mprVolume,
  sliceIndex,
  segmentation,
  showSegmentation = true,
  enableInteraction = true,
  className,
  loadingMessage = 'Loading cross-section...',
  viewportId = 'cross-section-viewport',
}: ViewportCrossSectionProps) {
  // Container ref for Cornerstone rendering
  const containerRef = useRef<HTMLDivElement>(null)

  // Cornerstone viewport and rendering engine refs
  const renderingEngineRef = useRef<cornerstone.Types.IRenderingEngine | null>(
    null,
  )
  const viewportRef = useRef<cornerstone.Types.IStackViewport | null>(null)

  // SVG overlay ref for segmentation rendering
  const svgOverlayRef = useRef<SVGSVGElement>(null)

  // Component state
  const [isViewportInitialized, setIsViewportInitialized] = useState(false)
  const [isLoadingImage, setIsLoadingImage] = useState(false)

  // Cornerstone initialization
  const { isInitialized: isCornerstoneInitialized, error: cornerstoneError } =
    useCornerstoneAutoInit()

  // Get window/level from viewer store
  const windowLevel = useStore(viewerStore, (state) => state.windowLevel)

  /**
   * Initialize Cornerstone viewport
   */
  useEffect(() => {
    if (
      !isCornerstoneInitialized ||
      !containerRef.current ||
      isViewportInitialized
    ) {
      return
    }

    let mounted = true

    const initViewport = () => {
      try {
        // Create or get rendering engine
        const renderingEngineId = `cross-section-rendering-engine-${viewportId}`
        let renderingEngine = cornerstone.getRenderingEngine(renderingEngineId)

        if (!renderingEngine) {
          renderingEngine = new cornerstone.RenderingEngine(renderingEngineId)
        }

        renderingEngineRef.current = renderingEngine

        // Enable the viewport element
        const viewportInput = {
          viewportId,
          type: cornerstone.Enums.ViewportType.STACK,
          element: containerRef.current!,
          defaultOptions: {
            background: [0.1, 0.1, 0.1] as cornerstone.Types.Point3,
          },
        }

        renderingEngine.enableElement(viewportInput)

        // Get the viewport
        const viewport = renderingEngine.getViewport(
          viewportId,
        ) as cornerstone.Types.IStackViewport

        viewportRef.current = viewport

        // Set up tool group if interaction is enabled
        if (enableInteraction) {
          setupToolGroup(viewportId)
        }

        if (!mounted) return

        setIsViewportInitialized(true)
      } catch (error) {
        console.error('Failed to initialize cross-section viewport:', error)
      }
    }

    initViewport()

    return () => {
      mounted = false
    }
  }, [
    isCornerstoneInitialized,
    viewportId,
    enableInteraction,
    isViewportInitialized,
  ])

  /**
   * Load cross-section image into viewport
   * Extracts the perpendicular slice at sliceIndex from MPR volume
   */
  useEffect(() => {
    if (
      !isViewportInitialized ||
      !viewportRef.current ||
      !mprVolume ||
      sliceIndex === null ||
      sliceIndex === undefined
    ) {
      return
    }

    const loadCrossSection = async () => {
      setIsLoadingImage(true)

      try {
        const viewport = viewportRef.current!

        // Register custom image loader for cross-section
        registerCrossSectionImageLoader(viewportId, mprVolume)

        // Create image ID for this cross-section
        const imageId = `cross-section://${viewportId}/${sliceIndex}`

        // Set the image
        await viewport.setStack([imageId], 0)

        // Apply window/level
        viewport.setProperties({
          voiRange: {
            lower: windowLevel.level - windowLevel.window / 2,
            upper: windowLevel.level + windowLevel.window / 2,
          },
        })

        // Render the viewport
        viewport.render()

        setIsLoadingImage(false)
      } catch (error) {
        console.error('Failed to load cross-section:', error)
        setIsLoadingImage(false)
      }
    }

    loadCrossSection()
  }, [isViewportInitialized, mprVolume, sliceIndex, viewportId, windowLevel])

  /**
   * Register viewport with synchronization manager
   */
  useEffect(() => {
    if (!isViewportInitialized) return

    try {
      const syncManager = getGlobalSyncManager()
      const renderingEngineId = `cross-section-rendering-engine-${viewportId}`

      // Register this viewport for synchronization
      syncManager.addViewport(viewportId, renderingEngineId, 'stack')

      return () => {
        // Unregister on cleanup
        syncManager.removeViewport(viewportId, renderingEngineId)
      }
    } catch (error) {
      console.error('Failed to register viewport with sync manager:', error)
    }
  }, [isViewportInitialized, viewportId])

  /**
   * Update window/level when store changes
   */
  useEffect(() => {
    if (!viewportRef.current) return

    try {
      viewportRef.current.setProperties({
        voiRange: {
          lower: windowLevel.level - windowLevel.window / 2,
          upper: windowLevel.level + windowLevel.window / 2,
        },
      })
      viewportRef.current.render()
    } catch (error) {
      console.error('Failed to update window/level:', error)
    }
  }, [windowLevel])

  /**
   * Render segmentation overlay
   */
  useEffect(() => {
    if (
      !svgOverlayRef.current ||
      !segmentation ||
      !showSegmentation ||
      !mprVolume
    ) {
      return
    }

    renderSegmentationOverlay(
      svgOverlayRef.current,
      segmentation,
      mprVolume.dimensions,
      mprVolume.spacing,
    )
  }, [segmentation, showSegmentation, mprVolume])

  /**
   * Handle window resize
   */
  useEffect(() => {
    if (!renderingEngineRef.current || !isViewportInitialized) return

    const handleResize = () => {
      try {
        renderingEngineRef.current.resize(true)
      } catch (error) {
        console.error('Failed to resize viewport:', error)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [isViewportInitialized])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (renderingEngineRef.current) {
        try {
          // Disable the viewport element
          renderingEngineRef.current.disableElement(viewportId)
        } catch (error) {
          console.error('Error during viewport cleanup:', error)
        }
      }

      // Unregister image loader
      unregisterCrossSectionImageLoader(viewportId)
    }
  }, [viewportId])

  /**
   * Render loading state
   */
  if (!isCornerstoneInitialized || !isViewportInitialized || isLoadingImage) {
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
  if (cornerstoneError) {
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
          <div className="whitespace-pre-wrap text-sm">
            {cornerstoneError.message}
          </div>
          <div className="text-xs text-red-400">
            Error code: {cornerstoneError.code}
          </div>
        </div>
      </div>
    )
  }

  /**
   * Render empty state (no MPR volume or slice index)
   */
  if (!mprVolume || sliceIndex === null || sliceIndex === undefined) {
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <div className="text-sm">No cross-section available</div>
          <div className="text-xs text-gray-600">
            Click on curved MPR to view perpendicular cross-section
          </div>
        </div>
      </div>
    )
  }

  /**
   * Render cross-section viewport
   */
  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* Cornerstone rendering container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* SVG overlay for segmentation */}
      {showSegmentation && segmentation && (
        <svg
          ref={svgOverlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ zIndex: 10 }}
        />
      )}

      {/* Position indicator */}
      {(
        <div className="absolute bottom-2 left-2 rounded bg-gray-900/80 px-3 py-1 text-xs text-gray-400 backdrop-blur-sm">
          <div className="flex flex-col gap-0.5">
            <div className="font-medium text-gray-300">Cross-Section</div>
            <div>
              Position:{' '}
              {(
                (sliceIndex / (mprVolume.dimensions[2] - 1)) *
                mprVolume.totalLength
              ).toFixed(1)}{' '}
              mm
            </div>
            <div>
              Slice: {sliceIndex + 1} / {mprVolume.dimensions[2]}
            </div>
          </div>
        </div>
      )}

      {/* Window/Level indicator */}
      <div className="absolute bottom-2 right-2 rounded bg-gray-900/80 px-3 py-1 text-xs text-gray-400 backdrop-blur-sm">
        W/L: {windowLevel.window} / {windowLevel.level}
      </div>

      {/* Segmentation info */}
      {showSegmentation && segmentation && (
        <div className="absolute left-2 top-2 rounded bg-gray-900/80 px-3 py-1 text-xs backdrop-blur-sm">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-yellow-300">Lumen</span>
              {segmentation.lumenArea && (
                <span className="text-gray-400">
                  {segmentation.lumenArea.toFixed(1)} mm²
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-red-300">Vessel Wall</span>
              {segmentation.vesselWallArea && (
                <span className="text-gray-400">
                  {segmentation.vesselWallArea.toFixed(1)} mm²
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dimensions */}
      <div className="absolute right-2 top-2 rounded bg-gray-900/80 px-2 py-1 text-xs text-gray-400 backdrop-blur-sm">
        {mprVolume.dimensions[0]} × {mprVolume.dimensions[1]}
      </div>
    </div>
  )
}

/**
 * Sets up tool group for the viewport
 */
function setupToolGroup(viewportId: string): void {
  try {
    const toolGroupId = `${viewportId}-tool-group`

    // Check if tool group already exists
    let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId)

    if (!toolGroup) {
      // Create tool group
      toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId)

      if (!toolGroup) {
        console.error('Failed to create tool group')
        return
      }

      // Add tools to the group
      toolGroup.addTool(cornerstoneTools.PanTool.toolName)
      toolGroup.addTool(cornerstoneTools.ZoomTool.toolName)
      toolGroup.addTool(cornerstoneTools.WindowLevelTool.toolName)

      // Set tool modes
      toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary },
        ], // Middle mouse
      })
      toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ], // Right mouse
      })
      toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
        ], // Left mouse
      })
    }

    // Add viewport to tool group
    toolGroup.addViewport(
      viewportId,
      'cross-section-rendering-engine-' + viewportId,
    )
  } catch (error) {
    console.error('Failed to setup tool group:', error)
  }
}

/**
 * Custom image loader registry for cross-section images
 * Maps viewport IDs to their MPR volume data
 */
const crossSectionVolumeRegistry = new Map<string, CurvedMPRVolume>()

/**
 * Registers a custom image loader for cross-section images
 */
function registerCrossSectionImageLoader(
  viewportId: string,
  mprVolume: CurvedMPRVolume,
): void {
  // Store volume in registry
  crossSectionVolumeRegistry.set(viewportId, mprVolume)

  // Register custom image loader for this viewport's scheme
  const scheme = `cross-section`

  // Check if loader already registered
  if (!cornerstone.imageLoader.hasImageLoader(scheme)) {
    cornerstone.imageLoader.registerImageLoader(scheme, loadCrossSectionImage)
  }
}

/**
 * Unregisters the cross-section image loader for a viewport
 */
function unregisterCrossSectionImageLoader(viewportId: string): void {
  crossSectionVolumeRegistry.delete(viewportId)
}

/**
 * Custom image loader for cross-section images
 * Loads a perpendicular cross-section at a specific slice index from the MPR volume
 */
function loadCrossSectionImage(
  imageId: string,
): cornerstone.Types.IImage {
  // Parse image ID: cross-section://viewportId/sliceIndex
  const parts = imageId.replace('cross-section://', '').split('/')
  const viewportId = parts[0]
  const sliceIndex = parseInt(parts[1], 10)

  // Get MPR volume from registry
  const mprVolume = crossSectionVolumeRegistry.get(viewportId)

  if (!mprVolume) {
    throw new Error(`MPR volume not found for viewport: ${viewportId}`)
  }

  const { dimensions, spacing, data } = mprVolume
  const [width, height, numSlices] = dimensions

  if (sliceIndex < 0 || sliceIndex >= numSlices) {
    throw new Error(`Invalid slice index: ${sliceIndex}`)
  }

  // Extract cross-section slice data
  // In the MPR volume, each "slice" (z-index) is already a perpendicular cross-section
  const sliceData = new Int16Array(width * height)
  const sliceOffset = sliceIndex * width * height

  for (let i = 0; i < width * height; i++) {
    sliceData[i] = data[sliceOffset + i]
  }

  // Create Cornerstone image object
  const image: cornerstone.Types.IImage = {
    imageId,
    minPixelValue: -1024, // Air HU
    maxPixelValue: 3071, // Bone HU
    slope: 1,
    intercept: 0,
    windowCenter: 40, // Default for soft tissue
    windowWidth: 400,
    render: cornerstone.renderingEngineCache.getRenderingEngine.bind(
      cornerstone.renderingEngineCache,
    ),
    rows: height,
    columns: width,
    height,
    width,
    color: false,
    rgba: false,
    numComps: 1,
    columnPixelSpacing: spacing[0],
    rowPixelSpacing: spacing[1],
    sliceThickness: spacing[2],
    invert: false,
    sizeInBytes: sliceData.byteLength,
    getPixelData: () => sliceData,
    getCanvas: undefined,
  }

  return image
}

/**
 * Renders segmentation overlay (lumen and vessel wall contours) on SVG
 *
 * @param svg - SVG element to render on
 * @param segmentation - Segmentation data with contours
 * @param dimensions - MPR volume dimensions [width, height, slices]
 * @param spacing - Pixel spacing [x, y, z] in mm
 */
function renderSegmentationOverlay(
  svg: SVGSVGElement,
  segmentation: SegmentationData,
  dimensions: [number, number, number],
  spacing: [number, number, number],
): void {
  // Clear existing overlay
  svg.innerHTML = ''

  const [width, height] = dimensions
  const rect = svg.getBoundingClientRect()

  // Set viewBox to match image dimensions
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

  // Render lumen contour
  if (segmentation.lumenContour && segmentation.lumenContour.length > 0) {
    const lumenPath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
    const pathData = contourToPathData(segmentation.lumenContour)
    lumenPath.setAttribute('d', pathData)
    lumenPath.setAttribute('fill', 'none')
    lumenPath.setAttribute('stroke', 'rgba(255, 255, 0, 0.8)') // Yellow
    lumenPath.setAttribute('stroke-width', '2')
    lumenPath.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.appendChild(lumenPath)
  }

  // Render vessel wall contour
  if (
    segmentation.vesselWallContour &&
    segmentation.vesselWallContour.length > 0
  ) {
    const wallPath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
    const pathData = contourToPathData(segmentation.vesselWallContour)
    wallPath.setAttribute('d', pathData)
    wallPath.setAttribute('fill', 'none')
    wallPath.setAttribute('stroke', 'rgba(255, 0, 0, 0.6)') // Red
    wallPath.setAttribute('stroke-width', '2')
    wallPath.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.appendChild(wallPath)
  }
}

/**
 * Converts contour points to SVG path data
 *
 * @param contour - Array of [x, y] points
 * @returns SVG path data string
 */
function contourToPathData(contour: Array<[number, number]>): string {
  if (contour.length === 0) {
    return ''
  }

  const pathParts: Array<string> = []

  // Move to first point
  pathParts.push(`M ${contour[0][0]} ${contour[0][1]}`)

  // Line to subsequent points
  for (let i = 1; i < contour.length; i++) {
    pathParts.push(`L ${contour[i][0]} ${contour[i][1]}`)
  }

  // Close path
  pathParts.push('Z')

  return pathParts.join(' ')
}

export default ViewportCrossSection
