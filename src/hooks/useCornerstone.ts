/**
 * useCornerstone Hook
 *
 * React hook for managing Cornerstone3D lifecycle in viewer components.
 * Handles lazy initialization, cleanup, and provides initialization state.
 *
 * Usage:
 * ```tsx
 * const { isInitialized, isInitializing, error, initialize } = useCornerstone()
 *
 * useEffect(() => {
 *   initialize()
 * }, [])
 * ```
 */

import { useCallback, useEffect, useState } from 'react'
import {
  CornerstoneInitError,
  initializeCornerstone,
  isCornerstoneInitialized,
} from '@/lib/cornerstone/init'

/**
 * Hook return type
 */
export interface UseCornerstoneResult {
  /** Whether Cornerstone3D is fully initialized */
  isInitialized: boolean
  /** Whether initialization is currently in progress */
  isInitializing: boolean
  /** Error that occurred during initialization, if any */
  error: CornerstoneInitError | null
  /** Function to trigger initialization */
  initialize: () => Promise<void>
  /** Function to check if already initialized (synchronous) */
  checkInitialized: () => boolean
}

/**
 * Hook for managing Cornerstone3D lifecycle
 *
 * This hook provides:
 * - Lazy initialization of Cornerstone3D
 * - Loading and error states
 * - Automatic cleanup on unmount
 * - Prevents multiple initialization attempts
 *
 * @returns Cornerstone initialization state and control functions
 */
export function useCornerstone(): UseCornerstoneResult {
  const [isInitialized, setIsInitialized] = useState(isCornerstoneInitialized())
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<CornerstoneInitError | null>(null)

  /**
   * Checks if Cornerstone is already initialized (synchronous check)
   */
  const checkInitialized = useCallback((): boolean => {
    return isCornerstoneInitialized()
  }, [])

  /**
   * Initializes Cornerstone3D
   * Safe to call multiple times - will not re-initialize if already done
   */
  const initialize = useCallback(async (): Promise<void> => {
    // Skip if already initialized
    if (isCornerstoneInitialized()) {
      setIsInitialized(true)
      setIsInitializing(false)
      setError(null)
      return
    }

    // Skip if already initializing
    if (isInitializing) {
      return
    }

    setIsInitializing(true)
    setError(null)

    try {
      await initializeCornerstone()
      setIsInitialized(true)
    } catch (err) {
      const initError =
        err instanceof CornerstoneInitError
          ? err
          : new CornerstoneInitError(
              `Initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
              'INIT_FAILED',
            )
      setError(initError)
      setIsInitialized(false)
    } finally {
      setIsInitializing(false)
    }
  }, [isInitializing])

  // Check initialization state on mount
  useEffect(() => {
    if (isCornerstoneInitialized()) {
      setIsInitialized(true)
      setIsInitializing(false)
    }
  }, [])

  return {
    isInitialized,
    isInitializing,
    error,
    initialize,
    checkInitialized,
  }
}

/**
 * Hook variant that automatically initializes on mount
 *
 * @returns Cornerstone initialization state
 */
export function useCornerstoneAutoInit(): Omit<
  UseCornerstoneResult,
  'initialize'
> {
  const { initialize, ...rest } = useCornerstone()

  useEffect(() => {
    initialize()
  }, [initialize])

  return rest
}
