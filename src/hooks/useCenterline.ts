/**
 * useCenterline Hook
 *
 * React hook for managing centerline creation and editing state.
 * Handles the two-click workflow for centerline creation, control point
 * editing, and API integration for centerline computation.
 *
 * Features:
 * - Two-click centerline creation workflow
 * - Control point manipulation (add, move, remove)
 * - API integration for B-spline computation
 * - Validation and lumen deviation detection
 * - Integration with centerline-store
 *
 * Usage:
 * ```tsx
 * const {
 *   mode,
 *   startPoint,
 *   endPoint,
 *   controlPoints,
 *   addStartPoint,
 *   addEndPoint,
 *   addControlPoint,
 *   removeControlPoint,
 *   moveControlPoint,
 *   computeCenterline,
 *   reset,
 *   isComputing,
 *   error,
 *   centerlineResult
 * } = useCenterline({ vesselId: 'LAD', studyId: '1' })
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import type {
  CenterlineResult,
  ControlPoint,
  Point3D,
} from '@/lib/imaging/centerline'
import { centerlineStore } from '@/lib/stores/centerline-store'

/**
 * Centerline creation mode
 */
export type CenterlineMode =
  | 'idle' // No centerline creation in progress
  | 'awaiting-start' // Waiting for start point click
  | 'awaiting-end' // Waiting for end point click
  | 'editing' // Centerline exists, can edit control points
  | 'computing' // Computing centerline via API

/**
 * Configuration for useCenterline hook
 */
export interface UseCenterlineConfig {
  /** Unique identifier for the vessel (e.g., 'LAD', 'LCX', 'RCA') */
  vesselId: string
  /** Study ID for API calls */
  studyId: string
  /** Series ID for segmentation data lookup */
  seriesId?: string
  /** Auto-compute centerline after end point is added */
  autoCompute?: boolean
}

/**
 * Hook return type
 */
export interface UseCenterlineResult {
  /** Current centerline creation mode */
  mode: CenterlineMode
  /** Start point (first click) */
  startPoint: Point3D | null
  /** End point (second click) */
  endPoint: Point3D | null
  /** Intermediate control points */
  controlPoints: Array<ControlPoint>
  /** Computed centerline result from API */
  centerlineResult: CenterlineResult | null
  /** Whether centerline computation is in progress */
  isComputing: boolean
  /** Error message if computation failed */
  error: string | null
  /** Add start point (first click) */
  addStartPoint: (point: Point3D) => void
  /** Add end point (second click) */
  addEndPoint: (point: Point3D) => void
  /** Add intermediate control point at specific index */
  addControlPoint: (point: ControlPoint, index?: number) => void
  /** Remove control point by index */
  removeControlPoint: (index: number) => void
  /** Move control point to new position */
  moveControlPoint: (index: number, newPosition: Point3D) => void
  /** Compute centerline via API */
  computeCenterline: () => Promise<void>
  /** Reset to initial state */
  reset: () => void
  /** Start new centerline creation */
  startCreation: () => void
  /** Cancel current creation */
  cancelCreation: () => void
  /** Save current centerline to store */
  saveCenterline: () => void
}

/**
 * Hook for managing centerline creation and editing
 *
 * This hook provides state management for the two-click centerline workflow,
 * control point editing, and integration with the centerline computation API.
 *
 * @param config - Configuration for the hook
 * @returns Centerline creation state and control functions
 */
export function useCenterline({
  vesselId,
  studyId,
  seriesId,
  autoCompute = true,
}: UseCenterlineConfig): UseCenterlineResult {
  // Current mode
  const [mode, setMode] = useState<CenterlineMode>('idle')

  // Centerline points
  const [startPoint, setStartPoint] = useState<Point3D | null>(null)
  const [endPoint, setEndPoint] = useState<Point3D | null>(null)
  const [controlPoints, setControlPoints] = useState<Array<ControlPoint>>([])

  // Computed result
  const [centerlineResult, setCenterlineResult] =
    useState<CenterlineResult | null>(null)

  // API state
  const [isComputing, setIsComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Store state
  const centerlineState = useStore(centerlineStore)

  // Abort controller for API requests
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * Load existing centerline from store on mount
   */
  useEffect(() => {
    const existing = centerlineState.centerlines.get(vesselId)
    if (existing) {
      // Convert stored data back to hook state
      // This assumes the stored format matches our internal format
      setMode('editing')
      // You might need to reconstruct start/end/control points from the stored data
    }
  }, [vesselId, centerlineState.centerlines])

  /**
   * Start new centerline creation
   */
  const startCreation = useCallback(() => {
    setMode('awaiting-start')
    setStartPoint(null)
    setEndPoint(null)
    setControlPoints([])
    setCenterlineResult(null)
    setError(null)
  }, [])

  /**
   * Add start point (first click)
   */
  const addStartPoint = useCallback(
    (point: Point3D) => {
      if (mode === 'awaiting-start' || mode === 'idle') {
        setStartPoint(point)
        setMode('awaiting-end')
        setError(null)
      }
    },
    [mode],
  )

  /**
   * Add end point (second click)
   */
  const addEndPoint = useCallback(
    (point: Point3D) => {
      if (mode === 'awaiting-end' && startPoint) {
        setEndPoint(point)
        setMode('editing')
        setError(null)

        // Auto-compute if enabled
        if (autoCompute) {
          // Delay computation to next tick to ensure state is updated
          setTimeout(() => {
            computeCenterlineInternal(point)
          }, 0)
        }
      }
    },
    [mode, startPoint, autoCompute],
  )

  /**
   * Add intermediate control point
   */
  const addControlPoint = useCallback((point: ControlPoint, index?: number) => {
    setControlPoints((prev) => {
      const newPoints = [...prev]
      if (index !== undefined && index >= 0 && index <= prev.length) {
        newPoints.splice(index, 0, point)
      } else {
        newPoints.push(point)
      }
      return newPoints
    })
    // Clear existing result to indicate re-computation needed
    setCenterlineResult(null)
  }, [])

  /**
   * Remove control point by index
   */
  const removeControlPoint = useCallback((index: number) => {
    setControlPoints((prev) => {
      const newPoints = [...prev]
      newPoints.splice(index, 1)
      return newPoints
    })
    // Clear existing result to indicate re-computation needed
    setCenterlineResult(null)
  }, [])

  /**
   * Move control point to new position
   */
  const moveControlPoint = useCallback(
    (index: number, newPosition: Point3D) => {
      setControlPoints((prev) => {
        const newPoints = [...prev]
        if (index >= 0 && index < prev.length) {
          newPoints[index] = { ...newPoints[index], ...newPosition }
        }
        return newPoints
      })
      // Clear existing result to indicate re-computation needed
      setCenterlineResult(null)
    },
    [],
  )

  /**
   * Internal function to compute centerline via API
   */
  const computeCenterlineInternal = useCallback(
    async (endPt?: Point3D) => {
      const start = startPoint
      const end = endPt ?? endPoint

      if (!start || !end) {
        setError('Start and end points are required')
        return
      }

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      abortControllerRef.current = new AbortController()
      setIsComputing(true)
      setError(null)
      setMode('computing')

      try {
        const response = await fetch('/api/imaging/centerline', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            studyId,
            seriesId,
            vesselId,
            startPoint: start,
            endPoint: end,
            controlPoints,
          }),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            errorData.error || `API request failed: ${response.statusText}`,
          )
        }

        const result: CenterlineResult = await response.json()
        setCenterlineResult(result)
        setMode('editing')

        // Update store with the computed centerline
        centerlineStore.setState((prev) => {
          const newCenterlines = new Map(prev.centerlines)
          newCenterlines.set(vesselId, {
            vesselId,
            points: result.points,
            length: result.totalLength,
          })
          return {
            ...prev,
            centerlines: newCenterlines,
          }
        })
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }

        const errorMessage =
          err instanceof Error ? err.message : 'Failed to compute centerline'
        setError(errorMessage)
        setMode('editing')
      } finally {
        setIsComputing(false)
      }
    },
    [startPoint, endPoint, controlPoints, studyId, seriesId, vesselId],
  )

  /**
   * Compute centerline via API (public method)
   */
  const computeCenterline = useCallback(async () => {
    await computeCenterlineInternal()
  }, [computeCenterlineInternal])

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setMode('idle')
    setStartPoint(null)
    setEndPoint(null)
    setControlPoints([])
    setCenterlineResult(null)
    setError(null)
    setIsComputing(false)
  }, [])

  /**
   * Cancel current creation
   */
  const cancelCreation = useCallback(() => {
    reset()
  }, [reset])

  /**
   * Save current centerline to store
   */
  const saveCenterline = useCallback(() => {
    if (!centerlineResult) {
      return
    }

    centerlineStore.setState((prev) => {
      const newCenterlines = new Map(prev.centerlines)
      newCenterlines.set(vesselId, {
        vesselId,
        points: centerlineResult.points,
        length: centerlineResult.totalLength,
      })
      return {
        ...prev,
        centerlines: newCenterlines,
      }
    })
  }, [vesselId, centerlineResult])

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    mode,
    startPoint,
    endPoint,
    controlPoints,
    centerlineResult,
    isComputing,
    error,
    addStartPoint,
    addEndPoint,
    addControlPoint,
    removeControlPoint,
    moveControlPoint,
    computeCenterline,
    reset,
    startCreation,
    cancelCreation,
    saveCenterline,
  }
}
