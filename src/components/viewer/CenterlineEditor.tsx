/**
 * CenterlineEditor Component
 *
 * Visual overlay for editing centerline control points on the 3D viewport.
 * Displays draggable control points, add/remove buttons, and visual feedback
 * when the centerline deviates outside the vessel lumen.
 *
 * Features:
 * - Visual control point markers (start, end, intermediate)
 * - Draggable control points
 * - Add/remove point buttons
 * - Color feedback for lumen deviations (red when outside vessel)
 * - Integration with useCenterline hook
 */

import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ControlPoint, Point3D } from '@/lib/imaging/centerline'
import type { UseCenterlineResult } from '@/hooks/useCenterline'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Props for CenterlineEditor component
 */
export interface CenterlineEditorProps {
  /**
   * Centerline state from useCenterline hook
   */
  centerline: UseCenterlineResult
  /**
   * Container element for viewport (for coordinate conversion)
   */
  viewportElement: HTMLElement | null
  /**
   * Function to convert 3D world coordinates to 2D screen coordinates
   * @param point - 3D point in world space
   * @returns 2D screen coordinates [x, y] or null if not visible
   */
  worldToScreen?: (point: Point3D) => [number, number] | null
  /**
   * Function to convert 2D screen coordinates to 3D world coordinates
   * @param x - Screen x coordinate
   * @param y - Screen y coordinate
   * @returns 3D point or null if conversion fails
   */
  screenToWorld?: (x: number, y: number) => Point3D | null
  /**
   * Whether editing is enabled
   * @default true
   */
  enableEditing?: boolean
  /**
   * Additional className for the container
   */
  className?: string
}

/**
 * Type for control point in UI (with screen coordinates)
 */
interface ControlPointUI {
  worldPosition: Point3D
  screenPosition: [number, number]
  index: number
  type: 'start' | 'end' | 'control'
  insideLumen?: boolean
}

/**
 * CenterlineEditor - Visual overlay for centerline editing
 *
 * Renders control points as draggable markers over the 3D viewport.
 * Provides UI for adding/removing points and shows visual feedback
 * when the centerline deviates outside the vessel lumen.
 */
export function CenterlineEditor({
  centerline,
  viewportElement,
  worldToScreen,
  screenToWorld,
  enableEditing = true,
  className,
}: CenterlineEditorProps) {
  const {
    mode,
    startPoint,
    endPoint,
    controlPoints,
    centerlineResult,
    addControlPoint,
    removeControlPoint,
    moveControlPoint,
    computeCenterline,
  } = centerline

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)

  // Drag state
  const [draggedPoint, setDraggedPoint] = useState<{
    index: number
    type: 'start' | 'end' | 'control'
    initialScreenPos: [number, number]
    initialWorldPos: Point3D
  } | null>(null)

  // Control points to render (with screen coordinates)
  const [pointsToRender, setPointsToRender] = useState<Array<ControlPointUI>>([])

  /**
   * Update screen coordinates for all control points
   */
  useEffect(() => {
    if (!worldToScreen) {
      setPointsToRender([])
      return
    }

    const points: Array<ControlPointUI> = []

    // Add start point
    if (startPoint) {
      const screenPos = worldToScreen(startPoint)
      if (screenPos) {
        points.push({
          worldPosition: startPoint,
          screenPosition: screenPos,
          index: -1, // Special index for start point
          type: 'start',
        })
      }
    }

    // Add end point
    if (endPoint) {
      const screenPos = worldToScreen(endPoint)
      if (screenPos) {
        points.push({
          worldPosition: endPoint,
          screenPosition: screenPos,
          index: -2, // Special index for end point
          type: 'end',
        })
      }
    }

    // Add intermediate control points
    controlPoints.forEach((cp, idx) => {
      const screenPos = worldToScreen(cp)
      if (screenPos) {
        points.push({
          worldPosition: cp,
          screenPosition: screenPos,
          index: idx,
          type: 'control',
        })
      }
    })

    // Add lumen deviation info if centerline result is available
    if (centerlineResult) {
      points.forEach((point) => {
        // Find corresponding centerline point to check lumen status
        const centerlinePoint = centerlineResult.points.find((pt) => {
          const dx = pt.x - point.worldPosition.x
          const dy = pt.y - point.worldPosition.y
          const dz = pt.z - point.worldPosition.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          return dist < 1.0 // Within 1mm
        })
        if (centerlinePoint) {
          point.insideLumen = centerlinePoint.insideLumen
        }
      })
    }

    setPointsToRender(points)
  }, [startPoint, endPoint, controlPoints, centerlineResult, worldToScreen])

  /**
   * Handle mouse down on control point (start drag)
   */
  const handlePointMouseDown = useCallback(
    (e: React.MouseEvent, point: ControlPointUI) => {
      if (!enableEditing || mode === 'computing') {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      setDraggedPoint({
        index: point.index,
        type: point.type,
        initialScreenPos: [e.clientX, e.clientY],
        initialWorldPos: point.worldPosition,
      })
    },
    [enableEditing, mode],
  )

  /**
   * Handle mouse move (drag control point)
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggedPoint || !screenToWorld || !viewportElement) {
        return
      }

      // Get viewport bounds for coordinate conversion
      const rect = viewportElement.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Convert screen to world coordinates
      const worldPos = screenToWorld(x, y)
      if (!worldPos) {
        return
      }

      // Update control point position
      if (draggedPoint.type === 'control' && draggedPoint.index >= 0) {
        moveControlPoint(draggedPoint.index, worldPos)
      }
      // Note: We don't allow dragging start/end points to keep them fixed
      // If you want to allow dragging start/end, add handlers here
    },
    [draggedPoint, screenToWorld, viewportElement, moveControlPoint],
  )

  /**
   * Handle mouse up (end drag)
   */
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!draggedPoint) {
        return
      }

      setDraggedPoint(null)

      // Re-compute centerline after dragging
      computeCenterline()
    },
    [draggedPoint, computeCenterline],
  )

  /**
   * Add drag listeners
   */
  useEffect(() => {
    if (!draggedPoint) {
      return
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggedPoint, handleMouseMove, handleMouseUp])

  /**
   * Handle add control point button click
   */
  const handleAddControlPoint = useCallback(() => {
    if (!startPoint || !endPoint) {
      return
    }

    // Add a control point midway between start and end
    // (or between last control point and end)
    const lastPoint =
      controlPoints.length > 0
        ? controlPoints[controlPoints.length - 1]
        : startPoint
    const nextPoint = endPoint

    const midPoint: ControlPoint = {
      x: (lastPoint.x + nextPoint.x) / 2,
      y: (lastPoint.y + nextPoint.y) / 2,
      z: (lastPoint.z + nextPoint.z) / 2,
      weight: 1.0,
    }

    addControlPoint(midPoint)
  }, [startPoint, endPoint, controlPoints, addControlPoint])

  /**
   * Handle remove control point
   */
  const handleRemoveControlPoint = useCallback(
    (index: number) => {
      removeControlPoint(index)
    },
    [removeControlPoint],
  )

  /**
   * Determine if centerline has deviations
   */
  const hasDeviations = centerlineResult?.hasDeviations ?? false

  /**
   * Don't render if not in appropriate mode
   */
  if (mode === 'idle' || mode === 'awaiting-start') {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn('pointer-events-none absolute inset-0', className)}
    >
      {/* Control points overlay */}
      {pointsToRender.map((point) => {
        const isStart = point.type === 'start'
        const isEnd = point.type === 'end'
        const isControl = point.type === 'control'
        const isDragging =
          draggedPoint?.index === point.index &&
          draggedPoint.type === point.type
        const isOutsideLumen = point.insideLumen === false

        // Point colors based on type and lumen status
        const pointColor = isOutsideLumen
          ? 'bg-red-500 border-red-300'
          : isStart
            ? 'bg-green-500 border-green-300'
            : isEnd
              ? 'bg-blue-500 border-blue-300'
              : 'bg-yellow-500 border-yellow-300'

        return (
          <div
            key={`${point.type}-${point.index}`}
            className="pointer-events-auto absolute"
            style={{
              left: `${point.screenPosition[0]}px`,
              top: `${point.screenPosition[1]}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Control point marker */}
            <div
              className={cn(
                'h-3 w-3 cursor-move rounded-full border-2 transition-all',
                pointColor,
                isDragging && 'scale-125 shadow-lg',
                !enableEditing && 'cursor-default opacity-50',
              )}
              onMouseDown={(e) => handlePointMouseDown(e, point)}
            >
              {/* Label */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900/90 px-2 py-0.5 text-xs text-white">
                {isStart ? 'Start' : isEnd ? 'End' : `P${point.index + 1}`}
                {isOutsideLumen && <span className="ml-1 text-red-300">⚠</span>}
              </div>

              {/* Remove button for control points */}
              {isControl && enableEditing && (
                <button
                  className="absolute -right-4 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white opacity-0 transition-opacity hover:bg-red-700 hover:opacity-100"
                  onClick={() => handleRemoveControlPoint(point.index)}
                  title="Remove control point"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Centerline spline visualization */}
      {centerlineResult && centerlineResult.points.length > 0 && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ zIndex: -1 }}
        >
          <polyline
            points={centerlineResult.points
              .map((pt) => {
                if (worldToScreen) {
                  const screenPos = worldToScreen(pt)
                  if (screenPos) {
                    return `${screenPos[0]},${screenPos[1]}`
                  }
                }
                return null
              })
              .filter(Boolean)
              .join(' ')}
            fill="none"
            stroke={hasDeviations ? '#ef4444' : '#3b82f6'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
        </svg>
      )}

      {/* Control panel */}
      {mode === 'editing' && enableEditing && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/90 p-2 shadow-lg backdrop-blur-sm">
            {/* Add control point button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddControlPoint}
              disabled={!startPoint || !endPoint}
              title="Add control point"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              <span>Add Point</span>
            </Button>

            {/* Re-compute button */}
            <Button
              variant="outline"
              size="sm"
              onClick={computeCenterline}
              disabled={!startPoint || !endPoint}
              title="Re-compute centerline"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Recompute</span>
            </Button>

            {/* Deviation warning */}
            {hasDeviations && (
              <div className="flex items-center gap-1 text-xs text-red-400">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>Outside vessel</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Computing indicator */}
      {mode === 'computing' && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex items-center gap-3 rounded-lg border border-blue-700 bg-blue-950/90 px-4 py-3 text-blue-200 shadow-lg backdrop-blur-sm">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <span className="text-sm font-medium">Computing centerline...</span>
          </div>
        </div>
      )}

      {/* Instructions */}
      {mode === 'awaiting-end' && (
        <div className="pointer-events-none absolute left-4 top-4">
          <div className="rounded-lg border border-green-700 bg-green-950/90 px-3 py-2 text-sm text-green-200 backdrop-blur-sm">
            Click on vessel surface to set end point
          </div>
        </div>
      )}
    </div>
  )
}

export default CenterlineEditor
