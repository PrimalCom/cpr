/**
 * VesselSelector Component
 *
 * Toggle buttons for selecting between LAD, LCX, and RCA coronary vessels.
 * Each vessel maintains independent centerline, MPR volume, and measurements.
 * Switching vessels loads the corresponding data from stores.
 *
 * Features:
 * - Visual indication of active vessel
 * - Color-coded vessel identifiers
 * - Integration with viewer store and vessel workflow hook
 * - Disabled state when no vessel data is available
 *
 * Usage:
 * ```tsx
 * <VesselSelector
 *   activeVessel="LAD"
 *   onVesselChange={(vesselId) => console.log('Selected:', vesselId)}
 *   availableVessels={['LAD', 'LCX', 'RCA']}
 * />
 * ```
 */

import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { viewerStore } from '@/lib/stores/viewer-store'
import { centerlineStore } from '@/lib/stores/centerline-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Vessel identifier types
 */
export type VesselId = 'LAD' | 'LCX' | 'RCA'

/**
 * Vessel display configuration
 */
export interface VesselConfig {
  id: VesselId
  label: string
  fullName: string
  color: string
}

/**
 * Predefined vessel configurations with colors
 */
export const VESSEL_CONFIGS: Record<VesselId, VesselConfig> = {
  LAD: {
    id: 'LAD',
    label: 'LAD',
    fullName: 'Left Anterior Descending',
    color: 'rgb(239, 68, 68)', // red-500
  },
  LCX: {
    id: 'LCX',
    label: 'LCX',
    fullName: 'Left Circumflex',
    color: 'rgb(34, 197, 94)', // green-500
  },
  RCA: {
    id: 'RCA',
    label: 'RCA',
    fullName: 'Right Coronary Artery',
    color: 'rgb(59, 130, 246)', // blue-500
  },
}

/**
 * Props for VesselSelector component
 */
export interface VesselSelectorProps {
  /**
   * Currently active vessel ID
   * If not provided, reads from viewer store
   */
  activeVessel?: VesselId | null
  /**
   * Callback when vessel selection changes
   */
  onVesselChange?: (vesselId: VesselId) => void
  /**
   * List of available vessels to display
   * Defaults to all vessels (LAD, LCX, RCA)
   */
  availableVessels?: Array<VesselId>
  /**
   * Whether to show vessel status indicators (centerline exists, etc.)
   * Defaults to true
   */
  showStatus?: boolean
  /**
   * Additional className for the container
   */
  className?: string
}

/**
 * VesselSelector - Toggle buttons for LAD/LCX/RCA vessel selection
 *
 * Provides a compact button group for switching between coronary vessels.
 * Each vessel maintains independent state (centerline, MPR, measurements).
 * Visual feedback shows which vessels have centerline data.
 */
export function VesselSelector({
  activeVessel: controlledActiveVessel,
  onVesselChange,
  availableVessels = ['LAD', 'LCX', 'RCA'],
  showStatus = true,
  className,
}: VesselSelectorProps) {
  // Get state from viewer store
  const viewerState = useStore(viewerStore)
  const centerlineState = useStore(centerlineStore)

  // Use controlled value if provided, otherwise use store value
  const activeVessel = controlledActiveVessel ?? viewerState.activeVesselId

  /**
   * Handle vessel selection
   */
  const handleVesselSelect = React.useCallback(
    (vesselId: VesselId) => {
      // Update viewer store
      viewerStore.setState((prev) => ({
        ...prev,
        activeVesselId: vesselId,
      }))

      // Call callback if provided
      onVesselChange?.(vesselId)
    },
    [onVesselChange],
  )

  /**
   * Check if a vessel has centerline data
   */
  const hasCenterline = React.useCallback(
    (vesselId: VesselId): boolean => {
      return centerlineState.centerlines.has(vesselId)
    },
    [centerlineState.centerlines],
  )

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="group"
      aria-label="Vessel selector"
    >
      <span className="text-sm font-medium text-gray-400">Vessel:</span>
      <div className="inline-flex gap-1 rounded-md border border-gray-700 bg-gray-800 p-1">
        {availableVessels.map((vesselId) => {
          const config = VESSEL_CONFIGS[vesselId]
          const isActive = activeVessel === vesselId
          const hasData = hasCenterline(vesselId)

          return (
            <Button
              key={vesselId}
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleVesselSelect(vesselId)}
              className={cn(
                'relative min-w-[60px] font-semibold transition-all',
                isActive && 'shadow-sm',
                !isActive && 'text-gray-400 hover:text-gray-200',
              )}
              style={
                isActive
                  ? {
                      backgroundColor: config.color,
                      borderColor: config.color,
                    }
                  : undefined
              }
              aria-label={`Select ${config.fullName}`}
              aria-pressed={isActive}
              title={config.fullName}
            >
              {config.label}
              {showStatus && hasData && (
                <span
                  className={cn(
                    'absolute -right-1 -top-1 size-2 rounded-full border border-gray-900',
                    isActive ? 'bg-white' : 'bg-green-500',
                  )}
                  aria-label="Centerline data available"
                  title="Centerline data available"
                />
              )}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact version of VesselSelector for toolbars
 */
export function VesselSelectorCompact({
  activeVessel: controlledActiveVessel,
  onVesselChange,
  availableVessels = ['LAD', 'LCX', 'RCA'],
  className,
}: VesselSelectorProps) {
  const viewerState = useStore(viewerStore)
  const centerlineState = useStore(centerlineStore)

  const activeVessel = controlledActiveVessel ?? viewerState.activeVesselId

  const handleVesselSelect = React.useCallback(
    (vesselId: VesselId) => {
      viewerStore.setState((prev) => ({
        ...prev,
        activeVesselId: vesselId,
      }))

      onVesselChange?.(vesselId)
    },
    [onVesselChange],
  )

  const hasCenterline = React.useCallback(
    (vesselId: VesselId): boolean => {
      return centerlineState.centerlines.has(vesselId)
    },
    [centerlineState.centerlines],
  )

  return (
    <div
      className={cn('inline-flex gap-1', className)}
      role="group"
      aria-label="Vessel selector"
    >
      {availableVessels.map((vesselId) => {
        const config = VESSEL_CONFIGS[vesselId]
        const isActive = activeVessel === vesselId
        const hasData = hasCenterline(vesselId)

        return (
          <Button
            key={vesselId}
            variant={isActive ? 'default' : 'ghost'}
            size="icon-sm"
            onClick={() => handleVesselSelect(vesselId)}
            className={cn(
              'relative size-7 text-xs font-bold transition-all',
              !isActive && 'text-gray-500 hover:text-gray-200',
            )}
            style={
              isActive
                ? {
                    backgroundColor: config.color,
                    borderColor: config.color,
                  }
                : undefined
            }
            aria-label={`Select ${config.fullName}`}
            aria-pressed={isActive}
            title={config.fullName}
          >
            {config.label.charAt(0)}
            {hasData && (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 size-1.5 rounded-full',
                  isActive ? 'bg-white' : 'bg-green-500',
                )}
                aria-label="Centerline data available"
              />
            )}
          </Button>
        )
      })}
    </div>
  )
}

export default VesselSelector
