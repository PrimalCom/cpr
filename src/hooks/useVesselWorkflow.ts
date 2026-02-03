/**
 * useVesselWorkflow Hook
 *
 * React hook for managing multi-vessel workflow state and transitions.
 * Handles per-vessel data management including centerlines, MPR volumes,
 * and measurements. Provides seamless switching between vessels while
 * maintaining independent state for each.
 *
 * Features:
 * - Per-vessel state management (LAD, LCX, RCA)
 * - Independent centerline, MPR, and measurement data for each vessel
 * - Automatic state persistence via stores
 * - Workflow state transitions (idle → creating centerline → viewing MPR → analyzing)
 * - Data validation and error handling
 *
 * Usage:
 * ```tsx
 * const {
 *   activeVessel,
 *   setActiveVessel,
 *   vesselStates,
 *   currentVesselState,
 *   hasVesselData,
 *   clearVesselData,
 *   resetAllVessels
 * } = useVesselWorkflow({ studyId: '123' })
 * ```
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import type { VesselId } from '@/components/viewer/VesselSelector'
import { viewerStore } from '@/lib/stores/viewer-store'
import { centerlineStore } from '@/lib/stores/centerline-store'
import { measurementStore } from '@/lib/stores/measurement-store'

/**
 * Workflow state for a vessel
 */
export type VesselWorkflowState =
  | 'idle' // No data or activity for this vessel
  | 'creating-centerline' // User is creating centerline (two-click workflow)
  | 'computing-centerline' // Centerline is being computed via API
  | 'centerline-ready' // Centerline exists, ready for MPR generation
  | 'generating-mpr' // MPR volume is being generated
  | 'mpr-ready' // MPR volume is ready, ready for analysis
  | 'analyzing' // User is performing measurements and analysis

/**
 * Per-vessel data snapshot
 */
export interface VesselData {
  /** Unique vessel identifier */
  vesselId: VesselId
  /** Current workflow state */
  state: VesselWorkflowState
  /** Whether centerline data exists */
  hasCenterline: boolean
  /** Whether MPR volume is available */
  hasMPR: boolean
  /** Number of measurements for this vessel */
  measurementCount: number
  /** Centerline length in mm (if available) */
  centerlineLength?: number
}

/**
 * Configuration for useVesselWorkflow hook
 */
export interface UseVesselWorkflowConfig {
  /** Study ID for API calls and data persistence */
  studyId: string
  /** Series ID for segmentation data lookup */
  seriesId?: string
  /** List of available vessels (default: all) */
  availableVessels?: Array<VesselId>
  /** Auto-switch to vessel after data is loaded */
  autoSwitchOnLoad?: boolean
}

/**
 * Hook return type
 */
export interface UseVesselWorkflowResult {
  /** Currently active vessel ID */
  activeVessel: VesselId | null
  /** Change active vessel */
  setActiveVessel: (vesselId: VesselId) => void
  /** Map of vessel states for all vessels */
  vesselStates: Map<VesselId, VesselData>
  /** Current vessel's data (for active vessel) */
  currentVesselState: VesselData | null
  /** Update workflow state for a vessel */
  setVesselState: (vesselId: VesselId, state: VesselWorkflowState) => void
  /** Check if a vessel has any data */
  hasVesselData: (vesselId: VesselId) => boolean
  /** Clear all data for a vessel */
  clearVesselData: (vesselId: VesselId) => void
  /** Reset all vessels to idle state */
  resetAllVessels: () => void
  /** Get vessels with centerline data */
  getVesselsWithCenterlines: () => Array<VesselId>
  /** Get vessels ready for analysis */
  getVesselsReadyForAnalysis: () => Array<VesselId>
}

/**
 * Hook for managing multi-vessel workflow
 *
 * This hook provides comprehensive state management for multi-vessel analysis.
 * Each vessel (LAD, LCX, RCA) maintains independent state including:
 * - Workflow state (idle → centerline → MPR → analysis)
 * - Centerline data
 * - MPR volume
 * - Measurements
 *
 * @param config - Configuration for the hook
 * @returns Vessel workflow state and control functions
 */
export function useVesselWorkflow({
  studyId,
  seriesId,
  availableVessels = ['LAD', 'LCX', 'RCA'],
  autoSwitchOnLoad = false,
}: UseVesselWorkflowConfig): UseVesselWorkflowResult {
  // Get state from stores
  const viewerState = useStore(viewerStore)
  const centerlineState = useStore(centerlineStore)
  const measurementState = useStore(measurementStore)

  // Local state for workflow states
  const [vesselWorkflowStates, setVesselWorkflowStates] = useState<
    Map<VesselId, VesselWorkflowState>
  >(new Map())

  // Local state for MPR availability (would normally come from an MPR store)
  const [vesselMPRStatus, setVesselMPRStatus] = useState<
    Map<VesselId, boolean>
  >(new Map())

  /**
   * Initialize workflow states for all vessels
   */
  useEffect(() => {
    const initialStates = new Map<VesselId, VesselWorkflowState>()
    availableVessels.forEach((vesselId) => {
      initialStates.set(vesselId, 'idle')
    })
    setVesselWorkflowStates(initialStates)
  }, [availableVessels])

  /**
   * Update workflow states based on store data
   */
  useEffect(() => {
    setVesselWorkflowStates((prev) => {
      const updated = new Map(prev)

      availableVessels.forEach((vesselId) => {
        const currentState = updated.get(vesselId) || 'idle'
        const hasCenterline = centerlineState.centerlines.has(vesselId)
        const hasMPR = vesselMPRStatus.get(vesselId) || false

        // Auto-transition states based on data availability
        if (
          hasCenterline &&
          hasMPR &&
          (currentState === 'idle' ||
            currentState === 'centerline-ready' ||
            currentState === 'generating-mpr')
        ) {
          updated.set(vesselId, 'mpr-ready')
        } else if (
          hasCenterline &&
          !hasMPR &&
          (currentState === 'idle' || currentState === 'computing-centerline')
        ) {
          updated.set(vesselId, 'centerline-ready')
        }
      })

      return updated
    })
  }, [centerlineState.centerlines, vesselMPRStatus, availableVessels])

  /**
   * Get current active vessel
   */
  const activeVessel = viewerState.activeVesselId as VesselId | null

  /**
   * Set active vessel
   */
  const setActiveVessel = useCallback((vesselId: VesselId) => {
    viewerStore.setState((prev) => ({
      ...prev,
      activeVesselId: vesselId,
    }))
  }, [])

  /**
   * Set workflow state for a vessel
   */
  const setVesselState = useCallback(
    (vesselId: VesselId, state: VesselWorkflowState) => {
      setVesselWorkflowStates((prev) => {
        const updated = new Map(prev)
        updated.set(vesselId, state)
        return updated
      })
    },
    [],
  )

  /**
   * Build vessel data snapshots
   */
  const vesselStates = useMemo(() => {
    const states = new Map<VesselId, VesselData>()

    availableVessels.forEach((vesselId) => {
      const hasCenterline = centerlineState.centerlines.has(vesselId)
      const centerlineData = centerlineState.centerlines.get(vesselId)
      const hasMPR = vesselMPRStatus.get(vesselId) || false
      const measurements = measurementState.measurements.filter(
        (m) => m.vesselId === vesselId,
      )

      states.set(vesselId, {
        vesselId,
        state: vesselWorkflowStates.get(vesselId) || 'idle',
        hasCenterline,
        hasMPR,
        measurementCount: measurements.length,
        centerlineLength: centerlineData?.length,
      })
    })

    return states
  }, [
    availableVessels,
    centerlineState.centerlines,
    vesselMPRStatus,
    vesselWorkflowStates,
    measurementState.measurements,
  ])

  /**
   * Get current vessel's data
   */
  const currentVesselState = useMemo(() => {
    if (!activeVessel) return null
    return vesselStates.get(activeVessel) || null
  }, [activeVessel, vesselStates])

  /**
   * Check if a vessel has any data
   */
  const hasVesselData = useCallback(
    (vesselId: VesselId): boolean => {
      const data = vesselStates.get(vesselId)
      return !!(
        data &&
        (data.hasCenterline || data.hasMPR || data.measurementCount > 0)
      )
    },
    [vesselStates],
  )

  /**
   * Clear all data for a vessel
   */
  const clearVesselData = useCallback(
    (vesselId: VesselId) => {
      // Remove centerline
      centerlineStore.setState((prev) => {
        const newCenterlines = new Map(prev.centerlines)
        newCenterlines.delete(vesselId)
        return {
          ...prev,
          centerlines: newCenterlines,
        }
      })

      // Remove measurements
      measurementStore.setState((prev) => ({
        ...prev,
        measurements: prev.measurements.filter((m) => m.vesselId !== vesselId),
      }))

      // Clear MPR status
      setVesselMPRStatus((prev) => {
        const updated = new Map(prev)
        updated.delete(vesselId)
        return updated
      })

      // Reset workflow state
      setVesselState(vesselId, 'idle')
    },
    [setVesselState],
  )

  /**
   * Reset all vessels to idle state
   */
  const resetAllVessels = useCallback(() => {
    availableVessels.forEach((vesselId) => {
      clearVesselData(vesselId)
    })
  }, [availableVessels, clearVesselData])

  /**
   * Get vessels with centerline data
   */
  const getVesselsWithCenterlines = useCallback((): Array<VesselId> => {
    return Array.from(vesselStates.entries())
      .filter(([_, data]) => data.hasCenterline)
      .map(([vesselId]) => vesselId)
  }, [vesselStates])

  /**
   * Get vessels ready for analysis (have MPR data)
   */
  const getVesselsReadyForAnalysis = useCallback((): Array<VesselId> => {
    return Array.from(vesselStates.entries())
      .filter(([_, data]) => data.hasMPR)
      .map(([vesselId]) => vesselId)
  }, [vesselStates])

  /**
   * Auto-switch to vessel when data is loaded
   */
  useEffect(() => {
    if (!autoSwitchOnLoad || activeVessel) return

    // If no active vessel, switch to first vessel with data
    const vesselsWithData = getVesselsWithCenterlines()
    if (vesselsWithData.length > 0) {
      setActiveVessel(vesselsWithData[0])
    }
  }, [
    autoSwitchOnLoad,
    activeVessel,
    getVesselsWithCenterlines,
    setActiveVessel,
  ])

  return {
    activeVessel,
    setActiveVessel,
    vesselStates,
    currentVesselState,
    setVesselState,
    hasVesselData,
    clearVesselData,
    resetAllVessels,
    getVesselsWithCenterlines,
    getVesselsReadyForAnalysis,
  }
}

/**
 * Helper hook for managing MPR volume status
 * (In a real implementation, this would integrate with an MPR store)
 */
export function useVesselMPRStatus() {
  const [mprStatus, setMPRStatus] = useState<Map<VesselId, boolean>>(new Map())

  const setVesselMPRReady = useCallback(
    (vesselId: VesselId, ready: boolean) => {
      setMPRStatus((prev) => {
        const updated = new Map(prev)
        updated.set(vesselId, ready)
        return updated
      })
    },
    [],
  )

  const isVesselMPRReady = useCallback(
    (vesselId: VesselId): boolean => {
      return mprStatus.get(vesselId) || false
    },
    [mprStatus],
  )

  return {
    mprStatus,
    setVesselMPRReady,
    isVesselMPRReady,
  }
}
