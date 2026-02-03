import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import * as dicomParser from 'dicom-parser'

/**
 * Initialization state to ensure Cornerstone3D is only initialized once
 */
let isInitialized = false
let initializationPromise: Promise<void> | null = null

/**
 * Error types for Cornerstone initialization
 */
export class CornerstoneInitError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'WEBGL2_NOT_SUPPORTED'
      | 'SHARED_ARRAY_BUFFER_NOT_AVAILABLE'
      | 'INIT_FAILED',
  ) {
    super(message)
    this.name = 'CornerstoneInitError'
  }
}

/**
 * Checks if WebGL2 is supported in the current browser
 *
 * @returns true if WebGL2 is available
 */
export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    return !!gl
  } catch {
    return false
  }
}

/**
 * Checks if SharedArrayBuffer is available
 * Required for volume rendering with Cornerstone3D
 *
 * @returns true if SharedArrayBuffer is available
 */
export function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * Gets user-friendly error message for WebGL2 not supported
 */
export function getWebGL2ErrorMessage(): string {
  return `WebGL2 is not supported in your browser.

Cornerstone3D requires WebGL2 for volume rendering. Please use one of these browsers:
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

Make sure hardware acceleration is enabled in your browser settings.`
}

/**
 * Gets user-friendly error message for SharedArrayBuffer not available
 */
export function getSharedArrayBufferErrorMessage(): string {
  return `SharedArrayBuffer is not available.

Volume rendering requires SharedArrayBuffer, which needs specific HTTP headers:
- Cross-Origin-Opener-Policy: same-origin
- Cross-Origin-Embedder-Policy: require-corp

For development:
Make sure vite.config.ts has these headers configured in server.headers.

For production:
Configure your web server or CDN to send these headers.

Current status:
- SharedArrayBuffer available: ${isSharedArrayBufferAvailable()}
- crossOriginIsolated: ${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'undefined'}

Note: These headers may break some third-party scripts that don't support CORP.`
}

/**
 * Configures the DICOM image loader
 * Sets up dicom-parser integration and default options
 */
function configureDICOMImageLoader(): void {
  // Configure external libraries that the DICOM image loader depends on
  cornerstoneDICOMImageLoader.external.cornerstone = cornerstone
  cornerstoneDICOMImageLoader.external.dicomParser = dicomParser

  // Configure DICOM image loader options
  cornerstoneDICOMImageLoader.configure({
    useWebWorkers: true,
    decodeConfig: {
      convertFloatPixelDataToInt: false,
      use16BitDataType: true,
    },
    // Maximum number of web workers for decoding
    maxWebWorkers: navigator.hardwareConcurrency || 4,
  })
}

/**
 * Registers image loaders with Cornerstone3D
 * Registers the DICOM image loader for 'dicomweb' and 'wadouri' schemes
 */
function registerImageLoaders(): void {
  // Register the DICOM image loader
  // This allows Cornerstone to load DICOM images via wadouri:// and dicomweb:// schemes
  cornerstone.imageLoader.registerImageLoader(
    'wadouri',
    cornerstoneDICOMImageLoader.wadouri.loadImage,
  )

  cornerstone.imageLoader.registerImageLoader(
    'dicomweb',
    cornerstoneDICOMImageLoader.wadors.loadImage,
  )

  cornerstone.imageLoader.registerImageLoader(
    'dicomfile',
    cornerstoneDICOMImageLoader.wadouri.loadImage,
  )
}

/**
 * Initializes the Cornerstone3D rendering engine
 * Creates and configures the default rendering engine
 *
 * @returns The initialized rendering engine
 */
function initializeRenderingEngine(): void {
  // Initialize Cornerstone3D core
  // This sets up the rendering pipeline and GPU resources
  cornerstone.init()

  // Initialize Cornerstone Tools
  // This provides measurement tools, annotations, and interactions
  cornerstoneTools.init()
}

/**
 * Performs environment checks before initialization
 *
 * @throws CornerstoneInitError if environment requirements are not met
 */
function checkEnvironment(): void {
  // Check WebGL2 support
  if (!isWebGL2Supported()) {
    throw new CornerstoneInitError(
      getWebGL2ErrorMessage(),
      'WEBGL2_NOT_SUPPORTED',
    )
  }

  // Check SharedArrayBuffer availability
  if (!isSharedArrayBufferAvailable()) {
    throw new CornerstoneInitError(
      getSharedArrayBufferErrorMessage(),
      'SHARED_ARRAY_BUFFER_NOT_AVAILABLE',
    )
  }
}

/**
 * Initializes Cornerstone3D with lazy initialization pattern
 * Only initializes once, subsequent calls return immediately
 *
 * This function:
 * 1. Checks for WebGL2 support
 * 2. Checks for SharedArrayBuffer availability
 * 3. Initializes the rendering engine
 * 4. Configures and registers DICOM image loaders
 * 5. Sets up Cornerstone Tools
 *
 * @throws CornerstoneInitError if initialization fails or requirements not met
 * @returns Promise that resolves when initialization is complete
 */
export function initializeCornerstone(): Promise<void> {
  // If already initialized, return immediately
  if (isInitialized) {
    return Promise.resolve()
  }

  // If initialization is in progress, return the existing promise
  if (initializationPromise) {
    return initializationPromise
  }

  // Start initialization
  initializationPromise = new Promise<void>((resolve, reject) => {
    try {
      // Check environment requirements
      checkEnvironment()

      // Configure DICOM image loader first
      configureDICOMImageLoader()

      // Register image loaders
      registerImageLoaders()

      // Initialize rendering engine
      initializeRenderingEngine()

      // Mark as initialized
      isInitialized = true
      resolve()
    } catch (error) {
      // Reset initialization state on error
      initializationPromise = null

      // Re-throw CornerstoneInitError as-is
      if (error instanceof CornerstoneInitError) {
        reject(error)
        return
      }

      // Wrap other errors
      reject(new CornerstoneInitError(
        `Failed to initialize Cornerstone3D: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_FAILED',
      ))
    }
  })

  return initializationPromise
}

/**
 * Checks if Cornerstone3D has been initialized
 *
 * @returns true if Cornerstone3D is initialized
 */
export function isCornerstoneInitialized(): boolean {
  return isInitialized
}

/**
 * Resets initialization state (primarily for testing)
 * WARNING: This does not actually cleanup Cornerstone resources
 */
export function resetInitialization(): void {
  isInitialized = false
  initializationPromise = null
}
