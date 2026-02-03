import * as React from 'react'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  destroyGlobalSyncManager,
  getGlobalSyncManager,
} from '@/lib/cornerstone/viewport-sync'

export interface ViewerLayoutProps {
  /**
   * The 3D viewport component (top-left)
   */
  viewport3D?: React.ReactNode
  /**
   * The Curved MPR viewport component (top-right)
   */
  viewportMPR?: React.ReactNode
  /**
   * The Cross-Section viewport component (bottom-left)
   */
  viewportCrossSection?: React.ReactNode
  /**
   * The Straightened viewport component (bottom-right)
   */
  viewportStraightened?: React.ReactNode
  /**
   * The toolbar component for viewport controls
   */
  toolbar?: React.ReactNode
  /**
   * The vessel selector component (LAD/LCX/RCA)
   */
  vesselSelector?: React.ReactNode
  /**
   * Additional className for the container
   */
  className?: string
}

/**
 * ViewerLayout - Multi-viewport 2x2 grid layout for medical imaging viewer
 *
 * Provides a resizable grid layout for four synchronized viewports:
 * - 3D View (vessel surface rendering)
 * - Curved MPR View (unfolded vessel)
 * - Cross-Section View (perpendicular slice)
 * - Straightened View (linear projection)
 *
 * Also includes areas for toolbar and vessel selector controls.
 */
export function ViewerLayout({
  viewport3D,
  viewportMPR,
  viewportCrossSection,
  viewportStraightened,
  toolbar,
  vesselSelector,
  className,
}: ViewerLayoutProps) {
  /**
   * Initialize viewport synchronization manager
   * The global sync manager coordinates cursor position and window/level
   * synchronization across all viewports
   */
  useEffect(() => {
    // Initialize the global sync manager
    // This enables cross-viewport synchronization for cursor position and window/level
    getGlobalSyncManager()

    // Cleanup: destroy sync manager when layout unmounts
    return () => {
      destroyGlobalSyncManager()
    }
  }, [])

  return (
    <div className={cn('flex h-screen w-full flex-col bg-gray-950', className)}>
      {/* Top Control Bar */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-900 px-4 py-3">
        {/* Vessel Selector Area */}
        <div className="flex-shrink-0">
          {vesselSelector || (
            <div className="text-sm text-gray-500">No vessel selected</div>
          )}
        </div>

        {/* Toolbar Area */}
        <div className="flex-1">
          {toolbar || (
            <div className="text-sm text-gray-500 text-center">
              Toolbar controls
            </div>
          )}
        </div>
      </div>

      {/* Main Viewport Grid - 2x2 Layout */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1 bg-gray-900 p-1">
        {/* Top-Left: 3D Viewport */}
        <div
          className={cn(
            'relative overflow-hidden rounded-sm border border-gray-800 bg-black',
            'hover:border-gray-700 transition-colors',
          )}
          data-viewport="3d"
        >
          <div className="absolute left-2 top-2 z-10 rounded bg-gray-900/80 px-2 py-1 text-xs font-semibold text-gray-300 backdrop-blur-sm">
            3D View
          </div>
          <div className="h-full w-full">
            {viewport3D || (
              <div className="flex h-full items-center justify-center text-gray-600">
                3D Viewport
              </div>
            )}
          </div>
        </div>

        {/* Top-Right: Curved MPR Viewport */}
        <div
          className={cn(
            'relative overflow-hidden rounded-sm border border-gray-800 bg-black',
            'hover:border-gray-700 transition-colors',
          )}
          data-viewport="mpr"
        >
          <div className="absolute left-2 top-2 z-10 rounded bg-gray-900/80 px-2 py-1 text-xs font-semibold text-gray-300 backdrop-blur-sm">
            Curved MPR
          </div>
          <div className="h-full w-full">
            {viewportMPR || (
              <div className="flex h-full items-center justify-center text-gray-600">
                Curved MPR Viewport
              </div>
            )}
          </div>
        </div>

        {/* Bottom-Left: Cross-Section Viewport */}
        <div
          className={cn(
            'relative overflow-hidden rounded-sm border border-gray-800 bg-black',
            'hover:border-gray-700 transition-colors',
          )}
          data-viewport="cross-section"
        >
          <div className="absolute left-2 top-2 z-10 rounded bg-gray-900/80 px-2 py-1 text-xs font-semibold text-gray-300 backdrop-blur-sm">
            Cross-Section
          </div>
          <div className="h-full w-full">
            {viewportCrossSection || (
              <div className="flex h-full items-center justify-center text-gray-600">
                Cross-Section Viewport
              </div>
            )}
          </div>
        </div>

        {/* Bottom-Right: Straightened Viewport */}
        <div
          className={cn(
            'relative overflow-hidden rounded-sm border border-gray-800 bg-black',
            'hover:border-gray-700 transition-colors',
          )}
          data-viewport="straightened"
        >
          <div className="absolute left-2 top-2 z-10 rounded bg-gray-900/80 px-2 py-1 text-xs font-semibold text-gray-300 backdrop-blur-sm">
            Straightened
          </div>
          <div className="h-full w-full">
            {viewportStraightened || (
              <div className="flex h-full items-center justify-center text-gray-600">
                Straightened Viewport
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ViewerLayout
