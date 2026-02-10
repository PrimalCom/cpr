/**
 * ViewportMPR Component
 *
 * Displays curved MPR (Multi-Planar Reconstruction) volumes using Cornerstone3D.
 * Supports progressive loading (low-res preview first, then full resolution),
 * window/level adjustments, and cursor position indicators.
 *
 * Features:
 * - Cornerstone3D stack viewport for 2D image display
 * - Progressive loading: shows downsampled preview quickly, then full resolution
 * - Window/level adjustments from viewer store
 * - Cursor position indicator for cross-sectional analysis
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
 * Props for ViewportMPR component
 */
export interface ViewportMPRProps {
  /**
   * Curved MPR volume data to display
   */
  mprVolume?: CurvedMPRVolume | null
  /**
   * Whether this is a preview (low-resolution) render
   * @default false
   */
  isPreview?: boolean
  /**
   * Callback when cursor position changes (for cross-section sync)
   * @param sliceIndex - Index of the slice clicked (along centerline)
   * @param normalizedPosition - Position normalized to [0, 1] along centerline
   */
  onCursorPositionChange?: (
    sliceIndex: number,
    normalizedPosition: number,
  ) => void
  /**
   * Current cursor position (slice index) to display indicator
   */
  cursorSliceIndex?: number | null
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
   * @default 'mpr-viewport'
   */
  viewportId?: string
}

/**
 * ViewportMPR - Curved MPR visualization viewport
 *
 * Renders curved MPR volumes using Cornerstone3D stack viewport.
 * Implements progressive loading for better user experience.
 */
export function ViewportMPR({
  mprVolume,
  isPreview = false,
  onCursorPositionChange,
  cursorSliceIndex,
  enableInteraction = true,
  className,
  loadingMessage = 'Loading curved MPR...',
  viewportId = 'mpr-viewport',
}: ViewportMPRProps) {
  // Container ref for Cornerstone rendering
  const containerRef = useRef<HTMLDivElement>(null)

  // Cornerstone viewport and rendering engine refs
  const renderingEngineRef = useRef<cornerstone.Types.IRenderingEngine | null>(
    null,
  )
  const viewportRef = useRef<cornerstone.Types.IStackViewport | null>(null)

  // Component state
  const [isViewportInitialized, setIsViewportInitialized] = useState(false)
  const [currentSliceIndex, setCurrentSliceIndex] = useState(0)
  const [isLoadingVolume, setIsLoadingVolume] = useState(false)

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
        const renderingEngineId = `mpr-rendering-engine-${viewportId}`
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
        console.error('Failed to initialize MPR viewport:', error)
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
   * Load MPR volume into viewport
   */
  useEffect(() => {
    if (!isViewportInitialized || !viewportRef.current || !mprVolume) {
      return
    }

    const loadVolume = async () => {
      setIsLoadingVolume(true)

      try {
        const viewport = viewportRef.current!

        // Convert MPR volume data to Cornerstone image format
        // For a stack viewport, we need to create individual images for each slice
        const imageIds: Array<string> = []
        const { dimensions, spacing, data } = mprVolume

        const [width, height, numSlices] = dimensions

        // Create image IDs for each slice
        // We'll use a custom scheme that Cornerstone can recognize
        for (let i = 0; i < numSlices; i++) {
          imageIds.push(`mpr-slice://${viewportId}/${i}`)
        }

        // Register a custom image loader for MPR slices
        registerMPRImageLoader(viewportId, mprVolume)

        // Set the stack
        await viewport.setStack(imageIds, 0)

        // Apply window/level
        viewport.setProperties({
          voiRange: {
            lower: windowLevel.level - windowLevel.window / 2,
            upper: windowLevel.level + windowLevel.window / 2,
          },
        })

        // Render the viewport
        viewport.render()

        setIsLoadingVolume(false)
      } catch (error) {
        console.error('Failed to load MPR volume:', error)
        setIsLoadingVolume(false)
      }
    }

    loadVolume()
  }, [isViewportInitialized, mprVolume, viewportId, windowLevel])

  /**
   * Register viewport with synchronization manager
   */
  useEffect(() => {
    if (!isViewportInitialized) return

    try {
      const syncManager = getGlobalSyncManager()
      const renderingEngineId = `mpr-rendering-engine-${viewportId}`

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
   * Handle window resize
   */
  useEffect(() => {
    if (!renderingEngineRef.current || !isViewportInitialized) return

    const handleResize = () => {
      try {
        renderingEngineRef.current?.resize(true)
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
   * Handle click on viewport for cursor position change
   */
  const handleViewportClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!enableInteraction || !viewportRef.current || !mprVolume) {
        return
      }

      try {
        const viewport = viewportRef.current
        const rect = containerRef.current?.getBoundingClientRect()

        if (!rect) return

        // Get click position relative to viewport
        const canvasPos: cornerstone.Types.Point2 = [
          event.clientX - rect.left,
          event.clientY - rect.top,
        ]

        // Get current slice index from viewport
        const imageIdIndex = viewport.getCurrentImageIdIndex()

        // Calculate normalized position along centerline
        const normalizedPosition = imageIdIndex / (mprVolume.dimensions[2] - 1)

        // Calculate distance along centerline in mm
        const distanceAlongCenterline =
          normalizedPosition * mprVolume.totalLength

        // Update cursor position in viewer store for cross-viewport synchronization
        viewerStore.setState((prev) => ({
          ...prev,
          cursorPosition: {
            x: canvasPos[0],
            y: canvasPos[1],
            z: distanceAlongCenterline,
          },
        }))

        // Update local cursor position
        setCurrentSliceIndex(imageIdIndex)

        // Notify parent component if callback provided
        if (onCursorPositionChange) {
          onCursorPositionChange(imageIdIndex, normalizedPosition)
        }
      } catch (error) {
        console.error('Failed to handle viewport click:', error)
      }
    },
    [enableInteraction, mprVolume, onCursorPositionChange],
  )

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
      unregisterMPRImageLoader(viewportId)
    }
  }, [viewportId])

  const isLoading = !isCornerstoneInitialized || !isViewportInitialized || isLoadingVolume
  const isReady = !isLoading && !cornerstoneError

  /**
   * Always render the container div so containerRef is available for Cornerstone init.
   * Loading, error, and empty states are overlaid on top.
   */
  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* Cornerstone rendering container - always mounted for ref availability */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={isReady && enableInteraction ? handleViewportClick : undefined}
        style={isReady && enableInteraction ? { cursor: 'crosshair' } : undefined}
      />

      {/* Loading overlay */}
      {isLoading && !cornerstoneError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
            <div className="text-sm">{loadingMessage}</div>
            {isPreview && (
              <div className="text-xs text-gray-500">
                (Preview - low resolution)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error overlay */}
      {cornerstoneError && (
        <div className="absolute inset-0 flex items-center justify-center">
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
      )}

      {/* Empty state overlay */}
      {isReady && !mprVolume && (
        <div className="absolute inset-0 flex items-center justify-center">
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
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <div className="text-sm">No curved MPR generated</div>
            <div className="text-xs text-gray-600">
              Create a centerline to generate curved MPR visualization
            </div>
          </div>
        </div>
      )}

      {/* Preview indicator */}
      {isReady && mprVolume && isPreview && (
        <div className="absolute left-2 top-2 rounded bg-yellow-900/80 px-2 py-1 text-xs font-medium text-yellow-200 backdrop-blur-sm">
          Preview (Low Resolution)
        </div>
      )}

      {/* Cursor position indicator */}
      {isReady && mprVolume && cursorSliceIndex !== null &&
        cursorSliceIndex !== undefined && (
          <div className="absolute bottom-2 right-2 rounded bg-gray-900/80 px-3 py-1 text-xs font-medium text-gray-300 backdrop-blur-sm">
            <div className="flex flex-col gap-0.5">
              <div>
                Slice: {cursorSliceIndex + 1} / {mprVolume.dimensions[2]}
              </div>
              <div>
                Distance:{' '}
                {(
                  (cursorSliceIndex / (mprVolume.dimensions[2] - 1)) *
                  mprVolume.totalLength
                ).toFixed(1)}{' '}
                mm
              </div>
            </div>
          </div>
        )}

      {/* Window/Level indicator */}
      {isReady && mprVolume && (
        <div className="absolute bottom-2 left-2 rounded bg-gray-900/80 px-3 py-1 text-xs text-gray-400 backdrop-blur-sm">
          <div className="flex flex-col gap-0.5">
            <div>
              W/L: {windowLevel.window} / {windowLevel.level}
            </div>
            <div className="text-gray-500">Click to position cross-section</div>
          </div>
        </div>
      )}

      {/* Volume info */}
      {isReady && mprVolume && (
        <div className="absolute right-2 top-2 rounded bg-gray-900/80 px-2 py-1 text-xs text-gray-400 backdrop-blur-sm">
          {mprVolume.dimensions[0]} × {mprVolume.dimensions[1]} ×{' '}
          {mprVolume.dimensions[2]}
        </div>
      )}
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
      toolGroup.addTool(cornerstoneTools.StackScrollMouseWheelTool.toolName)
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
      toolGroup.setToolActive(
        cornerstoneTools.StackScrollMouseWheelTool.toolName,
      )
      toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
        ], // Left mouse
      })
    }

    // Add viewport to tool group
    toolGroup.addViewport(viewportId, 'mpr-rendering-engine-' + viewportId)
  } catch (error) {
    console.error('Failed to setup tool group:', error)
  }
}

/**
 * Custom image loader registry for MPR slices
 * Maps viewport IDs to their MPR volume data
 */
const mprVolumeRegistry = new Map<string, CurvedMPRVolume>()

/**
 * Registers a custom image loader for MPR slices
 */
function registerMPRImageLoader(
  viewportId: string,
  mprVolume: CurvedMPRVolume,
): void {
  // Store volume in registry
  mprVolumeRegistry.set(viewportId, mprVolume)

  // Register custom image loader for this viewport's scheme
  const scheme = `mpr-slice`

  // Check if loader already registered
  if (!cornerstone.imageLoader.hasImageLoader(scheme)) {
    cornerstone.imageLoader.registerImageLoader(scheme, loadMPRImage)
  }
}

/**
 * Unregisters the MPR image loader for a viewport
 */
function unregisterMPRImageLoader(viewportId: string): void {
  mprVolumeRegistry.delete(viewportId)
}

/**
 * Custom image loader for MPR slices
 * Loads a single slice from the MPR volume
 */
function loadMPRImage(imageId: string): cornerstone.Types.IImage {
  // Parse image ID: mpr-slice://viewportId/sliceIndex
  const parts = imageId.replace('mpr-slice://', '').split('/')
  const viewportId = parts[0]
  const sliceIndex = parseInt(parts[1], 10)

  // Get MPR volume from registry
  const mprVolume = mprVolumeRegistry.get(viewportId)

  if (!mprVolume) {
    throw new Error(`MPR volume not found for viewport: ${viewportId}`)
  }

  const { dimensions, spacing, data } = mprVolume
  const [width, height, numSlices] = dimensions

  if (sliceIndex < 0 || sliceIndex >= numSlices) {
    throw new Error(`Invalid slice index: ${sliceIndex}`)
  }

  // Extract slice data
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
    ), // Dummy render function
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

export default ViewportMPR
