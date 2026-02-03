/**
 * VTK.js Ray Caster Utility
 *
 * Converts 2D screen click coordinates to 3D world coordinates on vessel surfaces.
 * Uses vtkCellPicker to perform ray casting and pick points on 3D geometry.
 *
 * This utility is essential for the centerline generation workflow where users
 * click on the 3D vessel surface to define start and end points.
 */

import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker'
import type { vtkObject } from '@kitware/vtk.js/interfaces'

/**
 * Result of a ray cast pick operation
 */
export interface PickResult {
  /** Whether a surface was successfully picked */
  success: boolean
  /** 3D world coordinates of the picked point [x, y, z] */
  worldPosition: [number, number, number] | null
  /** 3D normal vector at the picked point [x, y, z] */
  normal: [number, number, number] | null
  /** Actor that was picked (vessel surface) */
  actor: vtkObject | null
  /** Cell ID of the picked triangle on the mesh */
  cellId: number | null
}

/**
 * Configuration for the ray caster
 */
export interface RayCasterConfig {
  /** Tolerance for picking in world coordinates (default: 0.001) */
  tolerance?: number
  /** Maximum number of pick points to consider (default: 1) */
  pickFromList?: number
}

/**
 * Ray Caster for converting 2D screen coordinates to 3D world coordinates
 *
 * Uses VTK.js cell picker to perform ray casting from the camera through
 * the screen coordinate into the 3D scene, finding intersections with
 * vessel surface geometry.
 */
export class RayCaster {
  private picker: vtkObject
  private tolerance: number

  constructor(config: RayCasterConfig = {}) {
    this.tolerance = config.tolerance ?? 0.001

    // Create VTK cell picker
    this.picker = vtkCellPicker.newInstance()
    this.picker.setTolerance(this.tolerance)

    if (config.pickFromList !== undefined) {
      this.picker.setPickFromList(config.pickFromList)
    }
  }

  /**
   * Performs a ray cast pick operation at the given screen coordinates
   *
   * @param screenX - X coordinate in screen space (pixels from left)
   * @param screenY - Y coordinate in screen space (pixels from top)
   * @param renderer - VTK.js renderer containing the scene
   * @returns PickResult with world coordinates and other pick information
   */
  public pick(
    screenX: number,
    screenY: number,
    renderer: vtkObject,
  ): PickResult {
    // Perform the pick operation
    // The picker will cast a ray from the camera through the screen point
    // and find the closest intersection with geometry in the scene
    const pickSuccessful = this.picker.pick([screenX, screenY, 0], renderer)

    if (!pickSuccessful) {
      return {
        success: false,
        worldPosition: null,
        normal: null,
        actor: null,
        cellId: null,
      }
    }

    // Get the picked position in world coordinates
    const worldPosition = this.picker.getPickPosition() as [
      number,
      number,
      number,
    ]

    // Get the surface normal at the picked point
    const normal = this.picker.getPickNormal() as [number, number, number]

    // Get the picked actor (vessel surface)
    const actor = this.picker.getActors()[0] || null

    // Get the cell ID of the picked triangle
    const cellId = this.picker.getCellId()

    return {
      success: true,
      worldPosition: [...worldPosition] as [number, number, number],
      normal: [...normal] as [number, number, number],
      actor,
      cellId,
    }
  }

  /**
   * Picks a point on the vessel surface at the given screen coordinates
   * This is a convenience method that handles click events and extracts
   * just the 3D world position.
   *
   * @param screenX - X coordinate in screen space (pixels from left)
   * @param screenY - Y coordinate in screen space (pixels from top)
   * @param renderer - VTK.js renderer containing the scene
   * @returns 3D world coordinates [x, y, z] or null if pick failed
   */
  public pickPoint(
    screenX: number,
    screenY: number,
    renderer: vtkObject,
  ): [number, number, number] | null {
    const result = this.pick(screenX, screenY, renderer)
    return result.success ? result.worldPosition : null
  }

  /**
   * Handles a mouse event and performs picking
   * Converts DOM event coordinates to VTK.js screen coordinates
   *
   * @param event - Mouse event from DOM
   * @param container - HTML container element for the VTK.js viewport
   * @param renderer - VTK.js renderer containing the scene
   * @returns PickResult with world coordinates and other pick information
   */
  public pickFromMouseEvent(
    event: MouseEvent,
    container: HTMLElement,
    renderer: vtkObject,
  ): PickResult {
    // Get container bounding box
    const rect = container.getBoundingClientRect()

    // Convert mouse coordinates to container-relative coordinates
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    // VTK.js uses bottom-left origin, but DOM uses top-left
    // Convert Y coordinate: VTK Y = container height - DOM Y
    const vtkY = rect.height - y

    return this.pick(x, vtkY, renderer)
  }

  /**
   * Handles a mouse event and extracts just the picked 3D point
   * This is a convenience method for simple click handling
   *
   * @param event - Mouse event from DOM
   * @param container - HTML container element for the VTK.js viewport
   * @param renderer - VTK.js renderer containing the scene
   * @returns 3D world coordinates [x, y, z] or null if pick failed
   */
  public pickPointFromMouseEvent(
    event: MouseEvent,
    container: HTMLElement,
    renderer: vtkObject,
  ): [number, number, number] | null {
    const result = this.pickFromMouseEvent(event, container, renderer)
    return result.success ? result.worldPosition : null
  }

  /**
   * Updates the picker tolerance
   * Larger values make it easier to pick small objects but less precise
   *
   * @param tolerance - New tolerance value in world coordinates
   */
  public setTolerance(tolerance: number): void {
    this.tolerance = tolerance
    this.picker.setTolerance(tolerance)
  }

  /**
   * Gets the current picker tolerance
   *
   * @returns Current tolerance value
   */
  public getTolerance(): number {
    return this.tolerance
  }

  /**
   * Adds an actor to the pick list
   * When using pick lists, only actors in the list can be picked
   *
   * @param actor - VTK.js actor to add to pick list
   */
  public addPickList(actor: vtkObject): void {
    this.picker.addPickList(actor)
  }

  /**
   * Removes an actor from the pick list
   *
   * @param actor - VTK.js actor to remove from pick list
   */
  public removePickList(actor: vtkObject): void {
    this.picker.deletePickList(actor)
  }

  /**
   * Clears the pick list
   * After clearing, all actors in the scene can be picked
   */
  public clearPickList(): void {
    this.picker.initializePickList()
  }

  /**
   * Enables or disables picking from a list
   * When enabled, only actors in the pick list will be considered
   *
   * @param enabled - Whether to use pick list
   */
  public setPickFromList(enabled: boolean): void {
    this.picker.setPickFromList(enabled ? 1 : 0)
  }

  /**
   * Gets the VTK.js picker instance
   * Advanced usage: access underlying picker for custom configuration
   *
   * @returns vtkCellPicker instance
   */
  public getPicker(): vtkObject {
    return this.picker
  }

  /**
   * Cleans up VTK.js resources
   * Call this before removing the ray caster
   */
  public destroy(): void {
    this.picker.delete()
  }
}

/**
 * Creates a new ray caster instance
 *
 * @param config - Ray caster configuration
 * @returns RayCaster instance
 */
export function createRayCaster(config?: RayCasterConfig): RayCaster {
  return new RayCaster(config)
}

/**
 * Utility function to pick a point on the surface
 * This is a stateless helper that creates a picker, performs the pick, and cleans up
 *
 * @param screenX - X coordinate in screen space (pixels from left)
 * @param screenY - Y coordinate in screen space (pixels from top)
 * @param renderer - VTK.js renderer containing the scene
 * @param tolerance - Pick tolerance (default: 0.001)
 * @returns 3D world coordinates [x, y, z] or null if pick failed
 */
export function pickPoint(
  screenX: number,
  screenY: number,
  renderer: vtkObject,
  tolerance: number = 0.001,
): [number, number, number] | null {
  const rayCaster = createRayCaster({ tolerance })
  const point = rayCaster.pickPoint(screenX, screenY, renderer)
  rayCaster.destroy()
  return point
}

/**
 * Utility function to pick a point from a mouse event
 * This is a stateless helper that creates a picker, performs the pick, and cleans up
 *
 * @param event - Mouse event from DOM
 * @param container - HTML container element for the VTK.js viewport
 * @param renderer - VTK.js renderer containing the scene
 * @param tolerance - Pick tolerance (default: 0.001)
 * @returns 3D world coordinates [x, y, z] or null if pick failed
 */
export function pickPointFromMouseEvent(
  event: MouseEvent,
  container: HTMLElement,
  renderer: vtkObject,
  tolerance: number = 0.001,
): [number, number, number] | null {
  const rayCaster = createRayCaster({ tolerance })
  const point = rayCaster.pickPointFromMouseEvent(event, container, renderer)
  rayCaster.destroy()
  return point
}
