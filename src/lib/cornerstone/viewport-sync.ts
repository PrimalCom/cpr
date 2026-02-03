/**
 * Viewport Synchronization Manager
 *
 * This module manages cross-viewport synchronization using Cornerstone3D's built-in
 * Synchronizer class. It provides:
 * - Cursor position synchronization (camera position sync across all viewports)
 * - Window/level synchronization (VOI sync for uniform brightness/contrast)
 *
 * Synchronized behaviors:
 * - Clicking in MPR updates crosshairs in 3D, cross-section, and straightened views
 * - Window/level adjustments apply uniformly across all 2D viewports
 * - Cursor position updates trigger cross-section viewport updates
 *
 * Usage:
 * ```ts
 * const syncManager = new ViewportSyncManager()
 * syncManager.addViewport(viewportId, renderingEngineId, 'stack') // for 2D viewports
 * syncManager.addViewport(viewportId, renderingEngineId, 'volume') // for 3D viewports
 * // ... later
 * syncManager.destroy()
 * ```
 */

import * as cornerstoneTools from '@cornerstonejs/tools'

/**
 * Viewport type for synchronization configuration
 */
export type ViewportType = 'stack' | 'volume' | '3d'

/**
 * Synchronizer configuration
 */
export interface SyncConfig {
  /** Enable cursor position synchronization */
  enableCursorSync: boolean
  /** Enable window/level synchronization */
  enableWindowLevelSync: boolean
}

/**
 * Default synchronization configuration
 */
const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enableCursorSync: true,
  enableWindowLevelSync: true,
}

/**
 * Manages viewport synchronization using Cornerstone3D synchronizers
 *
 * This class creates and manages two types of synchronizers:
 * 1. Camera Position Synchronizer - Syncs cursor position across viewports
 * 2. VOI (Value of Interest) Synchronizer - Syncs window/level uniformly
 *
 * The synchronizers use Cornerstone3D's built-in event system to propagate
 * changes across all registered viewports automatically.
 */
export class ViewportSyncManager {
  private cameraPositionSynchronizer: cornerstoneTools.Synchronizer | null =
    null
  private voiSynchronizer: cornerstoneTools.Synchronizer | null = null
  private syncedViewports: Set<string> = new Set()
  private config: SyncConfig

  /**
   * Creates a new ViewportSyncManager
   *
   * @param config - Synchronization configuration
   */
  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config }
    this.initialize()
  }

  /**
   * Initializes the synchronizers
   */
  private initialize(): void {
    try {
      // Create camera position synchronizer for cursor position sync
      if (this.config.enableCursorSync) {
        this.cameraPositionSynchronizer = new cornerstoneTools.Synchronizer(
          'cameraPositionSynchronizer',
          'CAMERA_MODIFIED', // Event to listen for
          (
            synchronizerInstance: cornerstoneTools.Synchronizer,
            sourceViewport: any,
            targetViewport: any,
          ) => {
            // This callback is called when camera position changes in source viewport
            // The synchronizer automatically applies the same camera settings to target viewports
            // We don't need to manually update anything - Cornerstone handles it
          },
        )
      }

      // Create VOI synchronizer for window/level sync
      if (this.config.enableWindowLevelSync) {
        this.voiSynchronizer = new cornerstoneTools.Synchronizer(
          'voiSynchronizer',
          'VOI_MODIFIED', // Event for window/level changes
          (
            synchronizerInstance: cornerstoneTools.Synchronizer,
            sourceViewport: any,
            targetViewport: any,
            voiModifiedEvent: any,
          ) => {
            // Extract VOI (window/level) settings from the event
            const { volumeId, range } = voiModifiedEvent.detail

            // Apply the same VOI settings to the target viewport
            if (range && targetViewport.setProperties) {
              targetViewport.setProperties({
                voiRange: range,
              })
              targetViewport.render()
            }
          },
        )
      }
    } catch (error) {
      console.error('Failed to initialize viewport synchronizers:', error)
    }
  }

  /**
   * Adds a viewport to the synchronization system
   *
   * @param viewportId - Unique ID of the viewport
   * @param renderingEngineId - ID of the rendering engine
   * @param viewportType - Type of viewport (stack, volume, or 3d)
   */
  public addViewport(
    viewportId: string,
    renderingEngineId: string,
    viewportType: ViewportType = 'stack',
  ): void {
    try {
      const viewportKey = `${renderingEngineId}:${viewportId}`

      // Skip if already synced
      if (this.syncedViewports.has(viewportKey)) {
        return
      }

      // Add to camera position synchronizer (all viewport types)
      if (this.cameraPositionSynchronizer && this.config.enableCursorSync) {
        this.cameraPositionSynchronizer.add({
          renderingEngineId,
          viewportId,
        })
      }

      // Add to VOI synchronizer (only 2D stack viewports benefit from W/L sync)
      if (
        this.voiSynchronizer &&
        this.config.enableWindowLevelSync &&
        (viewportType === 'stack' || viewportType === 'volume')
      ) {
        this.voiSynchronizer.add({
          renderingEngineId,
          viewportId,
        })
      }

      this.syncedViewports.add(viewportKey)
    } catch (error) {
      console.error(
        `Failed to add viewport ${viewportId} to synchronizers:`,
        error,
      )
    }
  }

  /**
   * Removes a viewport from the synchronization system
   *
   * @param viewportId - Unique ID of the viewport
   * @param renderingEngineId - ID of the rendering engine
   */
  public removeViewport(viewportId: string, renderingEngineId: string): void {
    try {
      const viewportKey = `${renderingEngineId}:${viewportId}`

      // Skip if not synced
      if (!this.syncedViewports.has(viewportKey)) {
        return
      }

      // Remove from camera position synchronizer
      if (this.cameraPositionSynchronizer) {
        this.cameraPositionSynchronizer.remove({
          renderingEngineId,
          viewportId,
        })
      }

      // Remove from VOI synchronizer
      if (this.voiSynchronizer) {
        this.voiSynchronizer.remove({
          renderingEngineId,
          viewportId,
        })
      }

      this.syncedViewports.delete(viewportKey)
    } catch (error) {
      console.error(
        `Failed to remove viewport ${viewportId} from synchronizers:`,
        error,
      )
    }
  }

  /**
   * Enables or disables cursor position synchronization
   *
   * @param enabled - Whether to enable cursor sync
   */
  public setCursorSyncEnabled(enabled: boolean): void {
    this.config.enableCursorSync = enabled

    if (!enabled && this.cameraPositionSynchronizer) {
      // Disable synchronizer by removing all viewports
      this.cameraPositionSynchronizer.destroy()
      this.cameraPositionSynchronizer = null
    } else if (enabled && !this.cameraPositionSynchronizer) {
      // Re-create synchronizer if it was destroyed
      this.cameraPositionSynchronizer = new cornerstoneTools.Synchronizer(
        'cameraPositionSynchronizer',
        'CAMERA_MODIFIED',
        () => {},
      )

      // Re-add all viewports
      this.syncedViewports.forEach((viewportKey) => {
        const [renderingEngineId, viewportId] = viewportKey.split(':')
        if (this.cameraPositionSynchronizer) {
          this.cameraPositionSynchronizer.add({ renderingEngineId, viewportId })
        }
      })
    }
  }

  /**
   * Enables or disables window/level synchronization
   *
   * @param enabled - Whether to enable window/level sync
   */
  public setWindowLevelSyncEnabled(enabled: boolean): void {
    this.config.enableWindowLevelSync = enabled

    if (!enabled && this.voiSynchronizer) {
      // Disable synchronizer by removing all viewports
      this.voiSynchronizer.destroy()
      this.voiSynchronizer = null
    } else if (enabled && !this.voiSynchronizer) {
      // Re-create synchronizer if it was destroyed
      this.voiSynchronizer = new cornerstoneTools.Synchronizer(
        'voiSynchronizer',
        'VOI_MODIFIED',
        (
          synchronizerInstance: cornerstoneTools.Synchronizer,
          sourceViewport: any,
          targetViewport: any,
          voiModifiedEvent: any,
        ) => {
          const { range } = voiModifiedEvent.detail
          if (range && targetViewport.setProperties) {
            targetViewport.setProperties({ voiRange: range })
            targetViewport.render()
          }
        },
      )

      // Re-add all viewports
      this.syncedViewports.forEach((viewportKey) => {
        const [renderingEngineId, viewportId] = viewportKey.split(':')
        if (this.voiSynchronizer) {
          this.voiSynchronizer.add({ renderingEngineId, viewportId })
        }
      })
    }
  }

  /**
   * Gets the current synchronization configuration
   *
   * @returns Current sync config
   */
  public getConfig(): SyncConfig {
    return { ...this.config }
  }

  /**
   * Gets the list of synced viewports
   *
   * @returns Array of viewport keys (renderingEngineId:viewportId)
   */
  public getSyncedViewports(): Array<string> {
    return Array.from(this.syncedViewports)
  }

  /**
   * Checks if a viewport is currently synced
   *
   * @param viewportId - Viewport ID to check
   * @param renderingEngineId - Rendering engine ID
   * @returns true if viewport is synced
   */
  public isViewportSynced(
    viewportId: string,
    renderingEngineId: string,
  ): boolean {
    const viewportKey = `${renderingEngineId}:${viewportId}`
    return this.syncedViewports.has(viewportKey)
  }

  /**
   * Removes all viewports and destroys synchronizers
   * Call this when the viewer is unmounted to clean up resources
   */
  public destroy(): void {
    try {
      // Destroy camera position synchronizer
      if (this.cameraPositionSynchronizer) {
        this.cameraPositionSynchronizer.destroy()
        this.cameraPositionSynchronizer = null
      }

      // Destroy VOI synchronizer
      if (this.voiSynchronizer) {
        this.voiSynchronizer.destroy()
        this.voiSynchronizer = null
      }

      // Clear viewport tracking
      this.syncedViewports.clear()
    } catch (error) {
      console.error('Failed to destroy viewport synchronizers:', error)
    }
  }
}

/**
 * Global singleton instance for simple use cases
 * For most applications, you can use this shared instance
 */
let globalSyncManager: ViewportSyncManager | null = null

/**
 * Gets or creates the global viewport sync manager
 *
 * @param config - Optional configuration for first initialization
 * @returns The global ViewportSyncManager instance
 */
export function getGlobalSyncManager(
  config?: Partial<SyncConfig>,
): ViewportSyncManager {
  if (!globalSyncManager) {
    globalSyncManager = new ViewportSyncManager(config)
  }
  return globalSyncManager
}

/**
 * Destroys the global sync manager
 * Useful for cleanup or testing
 */
export function destroyGlobalSyncManager(): void {
  if (globalSyncManager) {
    globalSyncManager.destroy()
    globalSyncManager = null
  }
}
