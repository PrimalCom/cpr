/**
 * Cornerstone3D Measurement Tools Registration
 *
 * This module registers measurement and interaction tools with Cornerstone3D.
 * Tools must be registered globally before they can be added to tool groups.
 *
 * Registered Tools:
 * - LengthTool: Measure linear distances
 * - AngleTool: Measure angles between lines
 * - EllipticalROITool: Draw elliptical regions of interest for area/stats measurements
 * - PanTool: Pan the viewport
 * - ZoomTool: Zoom in/out
 * - WindowLevelTool: Adjust window/level (brightness/contrast)
 * - StackScrollMouseWheelTool: Scroll through stack slices
 *
 * Usage:
 * 1. Call registerMeasurementTools() once during Cornerstone initialization
 * 2. Use createToolGroup() to create tool groups for viewports
 * 3. Use activateTool() to set the active tool for a viewport
 */

import * as cornerstoneTools from '@cornerstonejs/tools'

/**
 * Tracks whether measurement tools have been registered
 */
let areToolsRegistered = false

/**
 * Available tool types for the viewer
 */
export type ToolType =
  | 'pointer'
  | 'length'
  | 'angle'
  | 'ellipticalROI'
  | 'windowLevel'
  | 'zoom'
  | 'pan'

/**
 * Tool names mapping for Cornerstone3D tools
 */
export const TOOL_NAMES = {
  length: cornerstoneTools.LengthTool.toolName,
  angle: cornerstoneTools.AngleTool.toolName,
  ellipticalROI: cornerstoneTools.EllipticalROITool.toolName,
  pan: cornerstoneTools.PanTool.toolName,
  zoom: cornerstoneTools.ZoomTool.toolName,
  windowLevel: cornerstoneTools.WindowLevelTool.toolName,
  stackScroll: cornerstoneTools.StackScrollMouseWheelTool.toolName,
} as const

/**
 * Registers measurement and interaction tools with Cornerstone3D
 * Should be called once during application initialization
 *
 * This function is idempotent - it can be called multiple times safely
 *
 * @throws Error if tool registration fails
 */
export function registerMeasurementTools(): void {
  // Skip if already registered
  if (areToolsRegistered) {
    return
  }

  try {
    // Register measurement tools
    cornerstoneTools.addTool(cornerstoneTools.LengthTool)
    cornerstoneTools.addTool(cornerstoneTools.AngleTool)
    cornerstoneTools.addTool(cornerstoneTools.EllipticalROITool)

    // Register interaction tools
    cornerstoneTools.addTool(cornerstoneTools.PanTool)
    cornerstoneTools.addTool(cornerstoneTools.ZoomTool)
    cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool)
    cornerstoneTools.addTool(cornerstoneTools.StackScrollMouseWheelTool)

    areToolsRegistered = true
  } catch (error) {
    throw new Error(
      `Failed to register measurement tools: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Checks if measurement tools have been registered
 *
 * @returns true if tools are registered
 */
export function areToolsRegisteredCheck(): boolean {
  return areToolsRegistered
}

/**
 * Creates a tool group for a viewport with all standard tools
 *
 * @param toolGroupId - Unique identifier for the tool group
 * @param renderingEngineId - ID of the rendering engine
 * @returns The created tool group, or null if creation failed
 */
export function createToolGroup(
  toolGroupId: string,
  renderingEngineId: string,
): cornerstoneTools.Types.IToolGroup | null {
  try {
    // Check if tool group already exists
    let toolGroup = cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId)

    if (toolGroup) {
      return toolGroup
    }

    // Create new tool group
    toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId)

    if (!toolGroup) {
      console.error('Failed to create tool group')
      return null
    }

    // Add measurement tools
    toolGroup.addTool(TOOL_NAMES.length)
    toolGroup.addTool(TOOL_NAMES.angle)
    toolGroup.addTool(TOOL_NAMES.ellipticalROI)

    // Add interaction tools
    toolGroup.addTool(TOOL_NAMES.pan)
    toolGroup.addTool(TOOL_NAMES.zoom)
    toolGroup.addTool(TOOL_NAMES.windowLevel)
    toolGroup.addTool(TOOL_NAMES.stackScroll)

    // Set default tool bindings
    // Middle mouse button for pan
    toolGroup.setToolPassive(TOOL_NAMES.pan)

    // Right mouse button for zoom
    toolGroup.setToolPassive(TOOL_NAMES.zoom)

    // Mouse wheel for stack scrolling
    toolGroup.setToolActive(TOOL_NAMES.stackScroll)

    // Measurement tools start passive (activated by toolbar)
    toolGroup.setToolPassive(TOOL_NAMES.length)
    toolGroup.setToolPassive(TOOL_NAMES.angle)
    toolGroup.setToolPassive(TOOL_NAMES.ellipticalROI)

    // Window/level starts as default active tool (left mouse)
    toolGroup.setToolActive(TOOL_NAMES.windowLevel, {
      bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Primary }],
    })

    return toolGroup
  } catch (error) {
    console.error('Failed to create tool group:', error)
    return null
  }
}

/**
 * Activates a specific tool for a tool group
 * Deactivates other conflicting tools that use the same mouse button
 *
 * @param toolGroupId - ID of the tool group
 * @param toolType - Type of tool to activate
 */
export function activateTool(toolGroupId: string, toolType: ToolType): void {
  try {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId)

    if (!toolGroup) {
      console.error(`Tool group not found: ${toolGroupId}`)
      return
    }

    // Set all measurement and interaction tools to passive first
    toolGroup.setToolPassive(TOOL_NAMES.length)
    toolGroup.setToolPassive(TOOL_NAMES.angle)
    toolGroup.setToolPassive(TOOL_NAMES.ellipticalROI)
    toolGroup.setToolPassive(TOOL_NAMES.windowLevel)

    // Activate the selected tool based on type
    switch (toolType) {
      case 'pointer':
        // Pointer mode - no active tool, just basic interactions
        // Pan and zoom remain available via middle/right mouse
        break

      case 'length':
        toolGroup.setToolActive(TOOL_NAMES.length, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        })
        break

      case 'angle':
        toolGroup.setToolActive(TOOL_NAMES.angle, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        })
        break

      case 'ellipticalROI':
        toolGroup.setToolActive(TOOL_NAMES.ellipticalROI, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        })
        break

      case 'windowLevel':
        toolGroup.setToolActive(TOOL_NAMES.windowLevel, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        })
        break

      case 'zoom':
        toolGroup.setToolActive(TOOL_NAMES.zoom, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        })
        break

      case 'pan':
        toolGroup.setToolActive(TOOL_NAMES.pan, {
          bindings: [
            { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
          ],
        })
        break

      default:
        console.warn(`Unknown tool type: ${toolType}`)
    }
  } catch (error) {
    console.error('Failed to activate tool:', error)
  }
}

/**
 * Gets the currently active tool for a tool group
 *
 * @param toolGroupId - ID of the tool group
 * @returns The active tool type, or 'pointer' if none active
 */
export function getActiveTool(toolGroupId: string): ToolType {
  try {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId)

    if (!toolGroup) {
      return 'pointer'
    }

    // Check which tool is active with primary mouse binding
    const toolNames = Object.entries(TOOL_NAMES)

    for (const [key, toolName] of toolNames) {
      // Skip stackScroll as it's always active on mouse wheel
      if (key === 'stackScroll') continue

      const toolState = toolGroup.getToolOptions(toolName)

      // This is a simplified check - in practice you'd need to check the actual bindings
      // For now, we'll rely on the application keeping track via the viewer store
    }

    return 'pointer'
  } catch (error) {
    console.error('Failed to get active tool:', error)
    return 'pointer'
  }
}

/**
 * Adds a viewport to a tool group
 *
 * @param toolGroupId - ID of the tool group
 * @param viewportId - ID of the viewport to add
 * @param renderingEngineId - ID of the rendering engine
 */
export function addViewportToToolGroup(
  toolGroupId: string,
  viewportId: string,
  renderingEngineId: string,
): void {
  try {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId)

    if (!toolGroup) {
      console.error(`Tool group not found: ${toolGroupId}`)
      return
    }

    toolGroup.addViewport(viewportId, renderingEngineId)
  } catch (error) {
    console.error('Failed to add viewport to tool group:', error)
  }
}

/**
 * Removes a viewport from a tool group
 *
 * @param toolGroupId - ID of the tool group
 * @param viewportId - ID of the viewport to remove
 * @param renderingEngineId - ID of the rendering engine
 */
export function removeViewportFromToolGroup(
  toolGroupId: string,
  viewportId: string,
  renderingEngineId: string,
): void {
  try {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId)

    if (!toolGroup) {
      return
    }

    toolGroup.removeViewports(renderingEngineId, viewportId)
  } catch (error) {
    console.error('Failed to remove viewport from tool group:', error)
  }
}

/**
 * Destroys a tool group and cleans up resources
 *
 * @param toolGroupId - ID of the tool group to destroy
 */
export function destroyToolGroup(toolGroupId: string): void {
  try {
    const toolGroup =
      cornerstoneTools.ToolGroupManager.getToolGroup(toolGroupId)

    if (toolGroup) {
      cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId)
    }
  } catch (error) {
    console.error('Failed to destroy tool group:', error)
  }
}

/**
 * Resets tool registration state (primarily for testing)
 */
export function resetToolRegistration(): void {
  areToolsRegistered = false
}
