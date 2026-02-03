/**
 * ViewportStraightened Component
 *
 * Displays straightened CPR (Curved Planar Reformation) view of the vessel.
 * The straightened view presents the curved vessel as a linear projection,
 * making it easier to measure distances and assess stenosis along the entire length.
 *
 * Features:
 * - Cornerstone3D stack viewport for 2D image display
 * - Straightened CPR projection from curved centerline
 * - Window/level adjustments from viewer store
 * - Cursor position synchronization with other viewports
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
 * Straightened CPR volume data
 * Contains the linear projection of the curved vessel
 */
export interface StraightenedVolume {
  /** Volume dimensions [width, height, slices] */
  dimensions: [number, number, number]
  /** Pixel spacing [x, y, z] in mm */
  spacing: [number, number, number]
  /** Raw pixel data (Int16Array) */
  data: Int16Array
  /** Total length along centerline in mm */
  totalLength: number
  /** Metadata about the straightening process */
  metadata?: {
    /** Centerline ID used for straightening */
    centerlineId?: string
    /** Number of control points in centerline */
    numControlPoints?: number
    /** Sampling interval along centerline in mm */
    samplingInterval?: number
  }
}

/**
 * Props for ViewportStraightened component
 */
export interface ViewportStraightenedProps {
  /**
   * Straightened CPR volume data to display
   */
  straightenedVolume?: StraightenedVolume | null
  /**
   * Callback when cursor position changes (for cross-section sync)
   * @param position - Position along centerline (0 to totalLength)
   * @param normalizedPosition - Position normalized to [0, 1]
   */
  onCursorPositionChange?: (
    position: number,
    normalizedPosition: number,
  ) => void
  /**
   * Current cursor position (mm along centerline) to display indicator
   */
  cursorPosition?: number | null
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
   * @default 'straightened-viewport'
   */
  viewportId?: string
}

/**
 * ViewportStraightened - Straightened CPR visualization viewport
 *
 * Renders straightened CPR volumes using Cornerstone3D stack viewport.
 * The straightened view presents the curved vessel as a linear projection.
 */
export function ViewportStraightened({
  straightenedVolume,
  onCursorPositionChange,
  cursorPosition,
  enableInteraction = true,
  className,
  loadingMessage = 'Loading straightened view...',
  viewportId = 'straightened-viewport',
}: ViewportStraightenedProps) {
  // Container ref for Cornerstone rendering
  const containerRef = useRef<HTMLDivElement>(null)

  // Cornerstone viewport and rendering engine refs
  const renderingEngineRef = useRef<cornerstone.Types.IRenderingEngine | null>(
    null,
  )
  const viewportRef = useRef<cornerstone.Types.IStackViewport | null>(null)

  // Component state
  const [isViewportInitialized, setIsViewportInitialized] = useState(false)
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
        const renderingEngineId = `straightened-rendering-engine-${viewportId}`
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
        console.error('Failed to initialize straightened viewport:', error)
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
   * Load straightened volume into viewport
   */
  useEffect(() => {
    if (!isViewportInitialized || !viewportRef.current || !straightenedVolume) {
      return
    }

    const loadVolume = async () => {
      setIsLoadingVolume(true)

      try {
        const viewport = viewportRef.current!

        // Convert straightened volume data to Cornerstone image format
        const imageIds: Array<string> = []
        const { dimensions } = straightenedVolume

        const [width, height, numSlices] = dimensions

        // Create image IDs for each slice
        for (let i = 0; i < numSlices; i++) {
          imageIds.push(`straightened-slice://${viewportId}/${i}`)
        }

        // Register a custom image loader for straightened slices
        registerStraightenedImageLoader(viewportId, straightenedVolume)

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
        console.error('Failed to load straightened volume:', error)
        setIsLoadingVolume(false)
      }
    }

    loadVolume()
  }, [isViewportInitialized, straightenedVolume, viewportId, windowLevel])

  /**
   * Register viewport with synchronization manager
   */
  useEffect(() => {
    if (!isViewportInitialized) return

    try {
      const syncManager = getGlobalSyncManager()
      const renderingEngineId = `straightened-rendering-engine-${viewportId}`

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
      if (!enableInteraction || !viewportRef.current || !straightenedVolume) {
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

        // Calculate position along centerline in mm
        const normalizedPosition =
          imageIdIndex / (straightenedVolume.dimensions[2] - 1)
        const position = normalizedPosition * straightenedVolume.totalLength

        // Update cursor position in viewer store for cross-viewport synchronization
        viewerStore.setState((prev) => ({
          ...prev,
          cursorPosition: {
            x: canvasPos[0],
            y: canvasPos[1],
            z: position,
          },
        }))

        // Notify parent component if callback provided
        if (onCursorPositionChange) {
          onCursorPositionChange(position, normalizedPosition)
        }
      } catch (error) {
        console.error('Failed to handle viewport click:', error)
      }
    },
    [enableInteraction, straightenedVolume, onCursorPositionChange],
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
      unregisterStraightenedImageLoader(viewportId)
    }
  }, [viewportId])

  /**
   * Render loading state
   */
  if (!isCornerstoneInitialized || !isViewportInitialized || isLoadingVolume) {
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
   * Render empty state (no straightened volume)
   */
  if (!straightenedVolume) {
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
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <div className="text-sm">No straightened view available</div>
          <div className="text-xs text-gray-600">
            Create a centerline to generate straightened CPR visualization
          </div>
        </div>
      </div>
    )
  }

  /**
   * Render straightened viewport
   */
  return (
    <div className={cn('relative h-full w-full', className)}>
      {/* Cornerstone rendering container */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={enableInteraction ? handleViewportClick : undefined}
        style={enableInteraction ? { cursor: 'crosshair' } : undefined}
      />

      {/* Cursor position indicator */}
      {cursorPosition !== null &&
        cursorPosition !== undefined && (
          <div className="absolute bottom-2 right-2 rounded bg-gray-900/80 px-3 py-1 text-xs font-medium text-gray-300 backdrop-blur-sm">
            <div className="flex flex-col gap-0.5">
              <div>Position: {cursorPosition.toFixed(1)} mm</div>
              <div>Total: {straightenedVolume.totalLength.toFixed(1)} mm</div>
            </div>
          </div>
        )}

      {/* Window/Level indicator */}
      <div className="absolute bottom-2 left-2 rounded bg-gray-900/80 px-3 py-1 text-xs text-gray-400 backdrop-blur-sm">
        <div className="flex flex-col gap-0.5">
          <div>
            W/L: {windowLevel.window} / {windowLevel.level}
          </div>
          <div className="text-gray-500">Straightened view</div>
        </div>
      </div>

      {/* Volume info */}
      <div className="absolute right-2 top-2 rounded bg-gray-900/80 px-2 py-1 text-xs text-gray-400 backdrop-blur-sm">
        <div className="flex flex-col gap-0.5">
          <div>
            {straightenedVolume.dimensions[0]} ×{' '}
            {straightenedVolume.dimensions[1]} ×{' '}
            {straightenedVolume.dimensions[2]}
          </div>
          {straightenedVolume.metadata?.samplingInterval && (
            <div className="text-gray-500">
              Spacing:{' '}
              {straightenedVolume.metadata.samplingInterval.toFixed(2)} mm
            </div>
          )}
        </div>
      </div>

      {/* View type label */}
      <div className="absolute left-2 top-2 rounded bg-blue-900/80 px-2 py-1 text-xs font-medium text-blue-200 backdrop-blur-sm">
        Straightened CPR
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
    toolGroup.addViewport(
      viewportId,
      'straightened-rendering-engine-' + viewportId,
    )
  } catch (error) {
    console.error('Failed to setup tool group:', error)
  }
}

/**
 * Custom image loader registry for straightened slices
 * Maps viewport IDs to their straightened volume data
 */
const straightenedVolumeRegistry = new Map<string, StraightenedVolume>()

/**
 * Registers a custom image loader for straightened slices
 */
function registerStraightenedImageLoader(
  viewportId: string,
  straightenedVolume: StraightenedVolume,
): void {
  // Store volume in registry
  straightenedVolumeRegistry.set(viewportId, straightenedVolume)

  // Register custom image loader for this viewport's scheme
  const scheme = `straightened-slice`

  // Check if loader already registered
  if (!cornerstone.imageLoader.hasImageLoader(scheme)) {
    cornerstone.imageLoader.registerImageLoader(scheme, loadStraightenedImage)
  }
}

/**
 * Unregisters the straightened image loader for a viewport
 */
function unregisterStraightenedImageLoader(viewportId: string): void {
  straightenedVolumeRegistry.delete(viewportId)
}

/**
 * Custom image loader for straightened slices
 * Loads a single slice from the straightened volume
 */
function loadStraightenedImage(
  imageId: string,
): cornerstone.Types.IImage {
  // Parse image ID: straightened-slice://viewportId/sliceIndex
  const parts = imageId.replace('straightened-slice://', '').split('/')
  const viewportId = parts[0]
  const sliceIndex = parseInt(parts[1], 10)

  // Get straightened volume from registry
  const straightenedVolume = straightenedVolumeRegistry.get(viewportId)

  if (!straightenedVolume) {
    throw new Error(`Straightened volume not found for viewport: ${viewportId}`)
  }

  const { dimensions, spacing, data } = straightenedVolume
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

export default ViewportStraightened
