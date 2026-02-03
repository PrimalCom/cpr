/**
 * ViewportToolbar Component
 *
 * Provides tool selection UI for measurement and interaction tools in the viewport.
 * Integrates with the viewer store to manage active tool state and applies tools
 * to Cornerstone3D tool groups.
 *
 * Available Tools:
 * - Pointer: Default selection mode, no active measurement tool
 * - Length: Measure linear distances between two points
 * - Angle: Measure angles formed by three points
 * - Window/Level: Adjust brightness and contrast
 * - Zoom: Zoom in/out on the viewport
 *
 * The toolbar automatically updates the viewer store and activates the selected
 * tool in the specified tool group.
 */

import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { MousePointer2, Ruler, SunMedium, Triangle, ZoomIn } from 'lucide-react'
import type {ToolType} from '@/lib/cornerstone/tools';
import { viewerStore } from '@/lib/stores/viewer-store'
import {  activateTool } from '@/lib/cornerstone/tools'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Props for ViewportToolbar component
 */
export interface ViewportToolbarProps {
  /**
   * Tool group ID to activate tools on
   * If not provided, only updates the viewer store
   */
  toolGroupId?: string
  /**
   * Additional className for the toolbar container
   */
  className?: string
  /**
   * Orientation of the toolbar
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical'
  /**
   * Size variant for toolbar buttons
   * @default 'sm'
   */
  size?: 'xs' | 'sm' | 'default'
  /**
   * Whether to show labels on buttons
   * @default false
   */
  showLabels?: boolean
}

/**
 * Tool definition for rendering buttons
 */
interface ToolDefinition {
  type: ToolType
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
}

/**
 * Available tools configuration
 */
const TOOLS: Array<ToolDefinition> = [
  {
    type: 'pointer',
    icon: MousePointer2,
    label: 'Pointer',
    description: 'Default selection mode',
  },
  {
    type: 'length',
    icon: Ruler,
    label: 'Length',
    description: 'Measure linear distances',
  },
  {
    type: 'angle',
    icon: Triangle,
    label: 'Angle',
    description: 'Measure angles',
  },
  {
    type: 'windowLevel',
    icon: SunMedium,
    label: 'W/L',
    description: 'Adjust window/level',
  },
  {
    type: 'zoom',
    icon: ZoomIn,
    label: 'Zoom',
    description: 'Zoom in/out',
  },
]

/**
 * Maps ToolType to viewer store ToolMode
 */
function mapToolTypeToToolMode(
  toolType: ToolType,
): 'pan' | 'zoom' | 'window-level' | 'measurement' | 'rotate' {
  switch (toolType) {
    case 'pointer':
      return 'pan'
    case 'length':
    case 'angle':
    case 'ellipticalROI':
      return 'measurement'
    case 'windowLevel':
      return 'window-level'
    case 'zoom':
      return 'zoom'
    case 'pan':
      return 'pan'
    default:
      return 'pan'
  }
}

/**
 * ViewportToolbar - Tool selection toolbar for viewports
 *
 * Displays buttons for selecting measurement and interaction tools.
 * Updates both the viewer store and activates tools in Cornerstone3D tool groups.
 */
export function ViewportToolbar({
  toolGroupId,
  className,
  orientation = 'horizontal',
  size = 'sm',
  showLabels = false,
}: ViewportToolbarProps) {
  // Get current tool mode from viewer store
  const toolMode = useStore(viewerStore, (state) => state.toolMode)

  // Track current active tool type (more granular than toolMode)
  const [activeToolType, setActiveToolType] =
    React.useState<ToolType>('pointer')

  /**
   * Handles tool selection
   */
  const handleToolSelect = React.useCallback(
    (toolType: ToolType) => {
      try {
        // Update local active tool state
        setActiveToolType(toolType)

        // Update viewer store with mapped tool mode
        const toolModeValue = mapToolTypeToToolMode(toolType)
        viewerStore.setState((prev) => ({
          ...prev,
          toolMode: toolModeValue,
        }))

        // Activate tool in Cornerstone3D tool group if provided
        if (toolGroupId) {
          activateTool(toolGroupId, toolType)
        }
      } catch (error) {
        console.error('Failed to activate tool:', error)
      }
    },
    [toolGroupId],
  )

  /**
   * Renders a tool button
   */
  const renderToolButton = React.useCallback(
    (tool: ToolDefinition) => {
      const Icon = tool.icon
      const isActive = activeToolType === tool.type

      return (
        <Button
          key={tool.type}
          variant={isActive ? 'default' : 'outline'}
          size={showLabels ? size : (`icon-${size}` as any)}
          onClick={() => handleToolSelect(tool.type)}
          title={tool.description}
          className={cn(
            'transition-all',
            isActive && 'ring-2 ring-primary/50',
            !showLabels && 'aspect-square',
          )}
        >
          <Icon className={cn('shrink-0', showLabels && 'mr-2')} />
          {showLabels && <span>{tool.label}</span>}
        </Button>
      )
    },
    [activeToolType, handleToolSelect, showLabels, size],
  )

  return (
    <div
      className={cn(
        'flex gap-1.5 rounded-lg bg-gray-900/80 p-2 backdrop-blur-sm',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        className,
      )}
      role="toolbar"
      aria-label="Viewport tools"
    >
      {TOOLS.map(renderToolButton)}
    </div>
  )
}

/**
 * Compact preset - icon-only buttons, small size
 */
export function ViewportToolbarCompact(
  props: Omit<ViewportToolbarProps, 'size' | 'showLabels'>,
) {
  return <ViewportToolbar {...props} size="xs" showLabels={false} />
}

/**
 * Full preset - buttons with labels, default size
 */
export function ViewportToolbarFull(
  props: Omit<ViewportToolbarProps, 'size' | 'showLabels'>,
) {
  return <ViewportToolbar {...props} size="default" showLabels={true} />
}

/**
 * Vertical preset - vertical orientation, icon-only
 */
export function ViewportToolbarVertical(
  props: Omit<ViewportToolbarProps, 'orientation' | 'showLabels'>,
) {
  return (
    <ViewportToolbar {...props} orientation="vertical" showLabels={false} />
  )
}

export default ViewportToolbar
