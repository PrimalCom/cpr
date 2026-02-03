/**
 * SegmentationToggle Component
 *
 * Control component for toggling segmentation overlay visibility on MPR and cross-section views.
 * Uses a Switch UI component to provide a simple on/off toggle for lumen and vessel wall contours.
 *
 * Features:
 * - Toggle segmentation overlay visibility
 * - Visual feedback for enabled/disabled state
 * - Optional label and description
 * - Integration with viewer state
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

/**
 * Props for SegmentationToggle component
 */
export interface SegmentationToggleProps {
  /**
   * Whether segmentation overlay is currently visible
   */
  checked: boolean
  /**
   * Callback when toggle state changes
   * @param checked - New checked state
   */
  onCheckedChange: (checked: boolean) => void
  /**
   * Whether the toggle is disabled
   * @default false
   */
  disabled?: boolean
  /**
   * Label text to display next to the toggle
   * @default "Segmentation Overlay"
   */
  label?: string
  /**
   * Additional description text
   */
  description?: string
  /**
   * Size of the toggle switch
   * @default "default"
   */
  size?: 'sm' | 'default'
  /**
   * Additional className for the container
   */
  className?: string
}

/**
 * SegmentationToggle - Control for toggling segmentation overlay visibility
 *
 * Provides a switch control for showing/hiding lumen and vessel wall contours
 * on MPR and cross-section viewports. Integrates with the Switch UI component.
 */
export function SegmentationToggle({
  checked,
  onCheckedChange,
  disabled = false,
  label = 'Segmentation Overlay',
  description,
  size = 'default',
  className,
}: SegmentationToggleProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        size={size}
        id="segmentation-toggle"
        aria-label={label}
      />
      <div className="flex flex-col gap-0.5">
        <Label
          htmlFor="segmentation-toggle"
          className={cn(
            'cursor-pointer text-sm font-medium',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {label}
        </Label>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Compact variant of SegmentationToggle for toolbar use
 * Shows only the switch with a tooltip-style label
 */
export function SegmentationToggleCompact({
  checked,
  onCheckedChange,
  disabled = false,
  label = 'Segmentation',
  className,
}: Omit<SegmentationToggleProps, 'description' | 'size'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5',
        'hover:bg-accent/50 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        size="sm"
        id="segmentation-toggle-compact"
        aria-label={label}
      />
      <Label
        htmlFor="segmentation-toggle-compact"
        className={cn(
          'cursor-pointer text-xs font-medium',
          disabled && 'cursor-not-allowed',
        )}
      >
        {label}
      </Label>
    </div>
  )
}

/**
 * Multi-layer segmentation toggle for controlling multiple overlay types
 * Useful when multiple segmentation layers are available (e.g., lumen, vessel wall, plaque)
 */
export interface SegmentationLayer {
  id: string
  label: string
  color: string
  enabled: boolean
}

export interface SegmentationToggleMultiProps {
  /**
   * Array of segmentation layers to control
   */
  layers: Array<SegmentationLayer>
  /**
   * Callback when a layer's enabled state changes
   * @param layerId - ID of the layer that changed
   * @param enabled - New enabled state
   */
  onLayerChange: (layerId: string, enabled: boolean) => void
  /**
   * Whether all layers are disabled
   * @default false
   */
  disabled?: boolean
  /**
   * Additional className for the container
   */
  className?: string
}

/**
 * SegmentationToggleMulti - Control for toggling multiple segmentation layers
 *
 * Provides individual toggles for multiple segmentation layers (lumen, vessel wall, plaque, etc.)
 * Each layer can be toggled independently with color indicators.
 */
export function SegmentationToggleMulti({
  layers,
  onLayerChange,
  disabled = false,
  className,
}: SegmentationToggleMultiProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="text-xs font-medium text-muted-foreground">
        Segmentation Layers
      </div>
      {layers.map((layer) => (
        <div key={layer.id} className="flex items-center gap-2">
          <Switch
            checked={layer.enabled}
            onCheckedChange={(checked) => onLayerChange(layer.id, checked)}
            disabled={disabled}
            size="sm"
            id={`layer-toggle-${layer.id}`}
            aria-label={layer.label}
          />
          <div className="flex items-center gap-2 flex-1">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: layer.color }}
            />
            <Label
              htmlFor={`layer-toggle-${layer.id}`}
              className={cn(
                'cursor-pointer text-xs',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {layer.label}
            </Label>
          </div>
        </div>
      ))}
    </div>
  )
}

export default SegmentationToggle
