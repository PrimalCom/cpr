/**
 * VTK.js Surface Renderer
 *
 * Renders vessel segmentation masks as 3D surfaces using marching cubes.
 * Provides color-coding for different coronary vessels:
 * - LAD (Left Anterior Descending): Red
 * - LCX (Left Circumflex): Blue
 * - RCA (Right Coronary Artery): Green
 */

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow'
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData'
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes'
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor'
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper'
import type { vtkObject } from '@kitware/vtk.js/interfaces'

/**
 * Vessel types with corresponding color codes
 */
export type VesselType = 'LAD' | 'LCX' | 'RCA'

/**
 * Color mapping for vessel types
 * RGB values normalized to 0-1 range
 */
export const VESSEL_COLORS: Record<VesselType, [number, number, number]> = {
  LAD: [1.0, 0.0, 0.0], // Red
  LCX: [0.0, 0.0, 1.0], // Blue
  RCA: [0.0, 1.0, 0.0], // Green
}

/**
 * Segmentation mask metadata
 */
export interface SegmentationMetadata {
  /** Image dimensions [width, height, depth] */
  dimensions: [number, number, number]
  /** Voxel spacing in mm [x, y, z] */
  spacing: [number, number, number]
  /** Origin point in world coordinates [x, y, z] */
  origin: [number, number, number]
  /** Pixel data as typed array (typically Uint8Array for binary masks) */
  data: Uint8Array | Uint16Array | Float32Array
}

/**
 * Surface renderer configuration
 */
export interface SurfaceRendererConfig {
  /** HTML container element for the renderer */
  container: HTMLElement
  /** Isosurface threshold value (default: 0.5 for binary masks) */
  isoValue?: number
  /** Enable/disable interaction (rotate, zoom, pan) */
  enableInteraction?: boolean
  /** Background color [r, g, b] normalized to 0-1 */
  backgroundColor?: [number, number, number]
}

/**
 * Surface renderer instance
 * Manages VTK.js rendering pipeline for vessel visualization
 */
export class SurfaceRenderer {
  private fullScreenRenderer: vtkObject | null = null
  private renderer: vtkObject | null = null
  private renderWindow: vtkObject | null = null
  private interactor: vtkObject | null = null
  private actors: Map<VesselType, vtkObject> = new Map()
  private container: HTMLElement

  constructor(config: SurfaceRendererConfig) {
    this.container = config.container

    // Initialize VTK.js rendering components
    this.initializeRenderer(config)
  }

  /**
   * Initializes the VTK.js rendering pipeline
   */
  private initializeRenderer(config: SurfaceRendererConfig): void {
    // Create a full screen render window
    this.fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
      container: this.container,
      background: config.backgroundColor || [0.1, 0.1, 0.1],
    })

    // Get renderer, render window, and interactor
    this.renderer = this.fullScreenRenderer.getRenderer()
    this.renderWindow = this.fullScreenRenderer.getRenderWindow()
    this.interactor = this.fullScreenRenderer.getInteractor()

    // Enable/disable interaction
    if (config.enableInteraction !== false) {
      this.interactor.initialize()
      this.interactor.bindEvents(this.container)
    }

    // Reset camera to fit all content
    this.renderer.resetCamera()
  }

  /**
   * Renders a vessel surface from segmentation mask data
   *
   * @param vesselType - Type of vessel (LAD, LCX, or RCA)
   * @param metadata - Segmentation mask metadata and pixel data
   * @param isoValue - Isosurface threshold (default: 0.5)
   */
  public renderVessel(
    vesselType: VesselType,
    metadata: SegmentationMetadata,
    isoValue: number = 0.5,
  ): void {
    // Remove existing actor for this vessel if present
    this.removeVessel(vesselType)

    // Create VTK image data from segmentation mask
    const imageData = vtkImageData.newInstance()
    imageData.setDimensions(metadata.dimensions)
    imageData.setSpacing(metadata.spacing)
    imageData.setOrigin(metadata.origin)

    // Get the scalar data array
    const scalars = imageData.getPointData().getScalars()
    scalars.setData(metadata.data)

    // Create marching cubes filter to extract isosurface
    const marchingCubes = vtkImageMarchingCubes.newInstance({
      contourValue: isoValue,
      computeNormals: true,
      mergePoints: true,
    })
    marchingCubes.setInputData(imageData)

    // Create mapper
    const mapper = vtkMapper.newInstance()
    mapper.setInputConnection(marchingCubes.getOutputPort())

    // Create actor
    const actor = vtkActor.newInstance()
    actor.setMapper(mapper)

    // Set vessel color
    const color = VESSEL_COLORS[vesselType]
    actor.getProperty().setColor(color[0], color[1], color[2])

    // Optional: Set surface properties
    actor.getProperty().setSpecular(0.3)
    actor.getProperty().setSpecularPower(30)
    actor.getProperty().setAmbient(0.2)
    actor.getProperty().setDiffuse(0.8)

    // Add actor to renderer
    this.renderer.addActor(actor)

    // Store actor for later removal
    this.actors.set(vesselType, actor)

    // Reset camera to fit all content
    this.renderer.resetCamera()

    // Render
    this.renderWindow.render()
  }

  /**
   * Removes a vessel surface from the scene
   *
   * @param vesselType - Type of vessel to remove
   */
  public removeVessel(vesselType: VesselType): void {
    const actor = this.actors.get(vesselType)
    if (actor) {
      this.renderer.removeActor(actor)
      this.actors.delete(vesselType)
      this.renderWindow.render()
    }
  }

  /**
   * Shows or hides a vessel surface
   *
   * @param vesselType - Type of vessel
   * @param visible - Whether the vessel should be visible
   */
  public setVesselVisibility(vesselType: VesselType, visible: boolean): void {
    const actor = this.actors.get(vesselType)
    if (actor) {
      actor.setVisibility(visible)
      this.renderWindow.render()
    }
  }

  /**
   * Updates vessel color
   *
   * @param vesselType - Type of vessel
   * @param color - RGB color values (0-1 range)
   */
  public setVesselColor(
    vesselType: VesselType,
    color: [number, number, number],
  ): void {
    const actor = this.actors.get(vesselType)
    if (actor) {
      actor.getProperty().setColor(color[0], color[1], color[2])
      this.renderWindow.render()
    }
  }

  /**
   * Updates vessel opacity
   *
   * @param vesselType - Type of vessel
   * @param opacity - Opacity value (0-1 range)
   */
  public setVesselOpacity(vesselType: VesselType, opacity: number): void {
    const actor = this.actors.get(vesselType)
    if (actor) {
      actor.getProperty().setOpacity(opacity)
      this.renderWindow.render()
    }
  }

  /**
   * Resets the camera to fit all vessels in view
   */
  public resetCamera(): void {
    this.renderer.resetCamera()
    this.renderWindow.render()
  }

  /**
   * Gets all currently rendered vessel types
   */
  public getRenderedVessels(): Array<VesselType> {
    return Array.from(this.actors.keys())
  }

  /**
   * Clears all vessel surfaces from the scene
   */
  public clear(): void {
    for (const vesselType of this.actors.keys()) {
      this.removeVessel(vesselType)
    }
  }

  /**
   * Renders the scene
   * Call this after making multiple changes to batch updates
   */
  public render(): void {
    this.renderWindow.render()
  }

  /**
   * Resizes the renderer to fit the container
   * Call this when the container size changes
   */
  public resize(): void {
    if (this.fullScreenRenderer) {
      this.fullScreenRenderer.resize()
    }
  }

  /**
   * Gets the VTK.js renderer instance
   * Used for advanced operations like ray-casting
   */
  public getRenderer(): vtkObject | null {
    return this.renderer
  }

  /**
   * Gets the VTK.js render window instance
   * Used for advanced operations like coordinate conversion
   */
  public getRenderWindow(): vtkObject | null {
    return this.renderWindow
  }

  /**
   * Gets the VTK.js interactor instance
   * Used for advanced interaction handling
   */
  public getInteractor(): vtkObject | null {
    return this.interactor
  }

  /**
   * Gets the HTML container element
   * Used for coordinate conversion and event handling
   */
  public getContainer(): HTMLElement {
    return this.container
  }

  /**
   * Cleans up VTK.js resources
   * Call this before removing the component
   */
  public destroy(): void {
    // Remove all actors
    this.clear()

    // Cleanup VTK.js objects
    if (this.interactor) {
      this.interactor.unbindEvents()
    }

    if (this.fullScreenRenderer) {
      this.fullScreenRenderer.delete()
    }

    // Clear references
    this.fullScreenRenderer = null
    this.renderer = null
    this.renderWindow = null
    this.interactor = null
    this.actors.clear()
  }
}

/**
 * Creates a new surface renderer instance
 *
 * @param config - Renderer configuration
 * @returns SurfaceRenderer instance
 */
export function createSurfaceRenderer(
  config: SurfaceRendererConfig,
): SurfaceRenderer {
  return new SurfaceRenderer(config)
}
