/**
 * useViewportSync Hook
 *
 * React hook for managing viewport synchronization in viewer components.
 * Handles creation and cleanup of viewport synchronizers, and provides
 * utilities for adding/removing viewports from the sync system.
 *
 * This hook integrates with the viewer store to keep cursor position and
 * window/level state in sync across all viewports.
 *
 * Usage:
 * ```tsx
 * function ViewerLayout() {
 *   const { syncManager, addViewport, removeViewport } = useViewportSync()
 *
 *   useEffect(() => {
 *     // Add viewports when they're created
 *     addViewport('mpr-viewport', 'myRenderingEngine', 'stack')
 *     addViewport('cross-section-viewport', 'myRenderingEngine', 'stack')
 *
 *     return () => {
 *       // Cleanup is automatic, but you can manually remove if needed
 *       removeViewport('mpr-viewport', 'myRenderingEngine')
 *     }
 *   }, [])
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import type {
  SyncConfig,
  ViewportType} from '@/lib/cornerstone/viewport-sync';
import {
  ViewportSyncManager,
  getGlobalSyncManager,
} from '@/lib/cornerstone/viewport-sync'
import { viewerStore } from '@/lib/stores/viewer-store'

/**
 * Hook return type
 */
export interface UseViewportSyncResult {
  /** The viewport sync manager instance */
  syncManager: ViewportSyncManager | null
  /** Add a viewport to the synchronization system */
  addViewport: (
    viewportId: string,
    renderingEngineId: string,
    viewportType?: ViewportType,
  ) => void
  /** Remove a viewport from the synchronization system */
  removeViewport: (viewportId: string, renderingEngineId: string) => void
  /** Enable or disable cursor position synchronization */
  setCursorSyncEnabled: (enabled: boolean) => void
  /** Enable or disable window/level synchronization */
  setWindowLevelSyncEnabled: (enabled: boolean) => void
  /** Check if a viewport is currently synced */
  isViewportSynced: (viewportId: string, renderingEngineId: string) => boolean
  /** Whether synchronization is active */
  isSyncActive: boolean
}

/**
 * Hook options
 */
export interface UseViewportSyncOptions {
  /** Use a custom sync manager instead of the global singleton */
  customSyncManager?: ViewportSyncManager
  /** Initial synchronization configuration */
  config?: Partial<SyncConfig>
  /** Whether to use the global sync manager (default: true) */
  useGlobal?: boolean
  /** Whether to sync window/level with viewer store (default: true) */
  syncWithStore?: boolean
}

/**
 * Hook for managing viewport synchronization
 *
 * This hook provides:
 * - Creation and management of ViewportSyncManager
 * - Integration with viewer store for cursor position and window/level
 * - Automatic cleanup on unmount
 * - Utilities for adding/removing viewports
 *
 * @param options - Hook configuration options
 * @returns Viewport sync manager and control functions
 */
export function useViewportSync(
  options: UseViewportSyncOptions = {},
): UseViewportSyncResult {
  const {
    customSyncManager,
    config,
    useGlobal = true,
    syncWithStore = true,
  } = options

  const [syncManager, setSyncManager] = useState<ViewportSyncManager | null>(
    null,
  )
  const [isSyncActive, setIsSyncActive] = useState(false)
  const syncManagerRef = useRef<ViewportSyncManager | null>(null)

  // Subscribe to viewer store for window/level updates
  const windowLevel = useStore(viewerStore, (state) => state.windowLevel)

  /**
   * Initialize the sync manager
   */
  useEffect(() => {
    let manager: ViewportSyncManager

    if (customSyncManager) {
      // Use provided custom manager
      manager = customSyncManager
    } else if (useGlobal) {
      // Use or create global singleton
      manager = getGlobalSyncManager(config)
    } else {
      // Create a new local manager
      manager = new ViewportSyncManager(config)
    }

    setSyncManager(manager)
    syncManagerRef.current = manager
    setIsSyncActive(true)

    // Cleanup function
    return () => {
      // Only destroy if we created a local manager (not global or custom)
      if (!useGlobal && !customSyncManager) {
        manager.destroy()
      }
      syncManagerRef.current = null
      setIsSyncActive(false)
    }
  }, [customSyncManager, useGlobal, config])

  /**
   * Sync window/level with viewer store
   * When the store updates, we need to manually update all viewports
   * because the store is the source of truth for the UI controls
   */
  useEffect(() => {
    if (!syncWithStore || !syncManager) {
      return
    }

    // Note: The VOI synchronizer will handle propagating changes between viewports
    // when they interact directly. This effect handles updates from the store
    // (e.g., when user adjusts window/level via toolbar sliders)

    // The actual viewport updates should be handled by the individual viewport
    // components listening to the store. The synchronizer will then propagate
    // those changes to other viewports automatically.
  }, [windowLevel, syncManager, syncWithStore])

  /**
   * Add a viewport to synchronization
   */
  const addViewport = useCallback(
    (
      viewportId: string,
      renderingEngineId: string,
      viewportType: ViewportType = 'stack',
    ) => {
      const manager = syncManagerRef.current
      if (!manager) {
        console.warn('Sync manager not initialized')
        return
      }

      try {
        manager.addViewport(viewportId, renderingEngineId, viewportType)
      } catch (error) {
        console.error('Failed to add viewport to sync manager:', error)
      }
    },
    [],
  )

  /**
   * Remove a viewport from synchronization
   */
  const removeViewport = useCallback(
    (viewportId: string, renderingEngineId: string) => {
      const manager = syncManagerRef.current
      if (!manager) {
        return
      }

      try {
        manager.removeViewport(viewportId, renderingEngineId)
      } catch (error) {
        console.error('Failed to remove viewport from sync manager:', error)
      }
    },
    [],
  )

  /**
   * Enable or disable cursor position synchronization
   */
  const setCursorSyncEnabled = useCallback((enabled: boolean) => {
    const manager = syncManagerRef.current
    if (!manager) {
      return
    }

    try {
      manager.setCursorSyncEnabled(enabled)
    } catch (error) {
      console.error('Failed to set cursor sync enabled:', error)
    }
  }, [])

  /**
   * Enable or disable window/level synchronization
   */
  const setWindowLevelSyncEnabled = useCallback((enabled: boolean) => {
    const manager = syncManagerRef.current
    if (!manager) {
      return
    }

    try {
      manager.setWindowLevelSyncEnabled(enabled)
    } catch (error) {
      console.error('Failed to set window/level sync enabled:', error)
    }
  }, [])

  /**
   * Check if a viewport is currently synced
   */
  const isViewportSynced = useCallback(
    (viewportId: string, renderingEngineId: string): boolean => {
      const manager = syncManagerRef.current
      if (!manager) {
        return false
      }

      return manager.isViewportSynced(viewportId, renderingEngineId)
    },
    [],
  )

  return {
    syncManager,
    addViewport,
    removeViewport,
    setCursorSyncEnabled,
    setWindowLevelSyncEnabled,
    isViewportSynced,
    isSyncActive,
  }
}

/**
 * Hook variant that automatically manages viewports based on a list
 *
 * This is a convenience hook that automatically adds/removes viewports
 * when the viewport list changes.
 *
 * @param viewports - Array of viewport configurations
 * @param renderingEngineId - ID of the rendering engine
 * @param options - Hook configuration options
 * @returns Viewport sync manager and control functions
 */
export function useViewportSyncAutoManage(
  viewports: Array<{ id: string; type: ViewportType }>,
  renderingEngineId: string,
  options: UseViewportSyncOptions = {},
): UseViewportSyncResult {
  const syncResult = useViewportSync(options)
  const { addViewport, removeViewport } = syncResult

  // Auto-manage viewports
  useEffect(() => {
    // Add all viewports
    viewports.forEach((viewport) => {
      addViewport(viewport.id, renderingEngineId, viewport.type)
    })

    // Cleanup: remove all viewports
    return () => {
      viewports.forEach((viewport) => {
        removeViewport(viewport.id, renderingEngineId)
      })
    }
  }, [viewports, renderingEngineId, addViewport, removeViewport])

  return syncResult
}
