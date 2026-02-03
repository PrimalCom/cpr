/**
 * VTK.js Initialization Module
 *
 * Provides lazy initialization for VTK.js rendering components.
 * VTK.js is used for 3D visualization of vessel surfaces extracted
 * from segmentation masks using marching cubes.
 *
 * This module ensures VTK.js is only initialized once and provides
 * environment checks similar to the Cornerstone initialization.
 */

/**
 * Initialization state to ensure VTK.js is only initialized once
 */
let isInitialized = false
let initializationPromise: Promise<void> | null = null

/**
 * Error types for VTK.js initialization
 */
export class VTKInitError extends Error {
  constructor(
    message: string,
    public readonly code: 'WEBGL_NOT_SUPPORTED' | 'INIT_FAILED',
  ) {
    super(message)
    this.name = 'VTKInitError'
  }
}

/**
 * Checks if WebGL is supported in the current browser
 * VTK.js requires WebGL for 3D rendering
 *
 * @returns true if WebGL is available
 */
export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
    return !!gl
  } catch {
    return false
  }
}

/**
 * Gets user-friendly error message for WebGL not supported
 */
export function getWebGLErrorMessage(): string {
  return `WebGL is not supported in your browser.

VTK.js requires WebGL for 3D rendering. Please use one of these browsers:
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

Make sure hardware acceleration is enabled in your browser settings.`
}

/**
 * Performs environment checks before initialization
 *
 * @throws VTKInitError if environment requirements are not met
 */
function checkEnvironment(): void {
  // Check WebGL support
  if (!isWebGLSupported()) {
    throw new VTKInitError(getWebGLErrorMessage(), 'WEBGL_NOT_SUPPORTED')
  }
}

/**
 * Initializes VTK.js with lazy initialization pattern
 * Only initializes once, subsequent calls return immediately
 *
 * This function:
 * 1. Checks for WebGL support
 * 2. Performs any global VTK.js configuration if needed
 *
 * @throws VTKInitError if initialization fails or requirements not met
 * @returns Promise that resolves when initialization is complete
 */
export function initializeVTK(): Promise<void> {
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

      // VTK.js doesn't require explicit global initialization
      // Individual components are initialized as needed
      // This function primarily serves as an environment check
      // and maintains consistency with the Cornerstone init pattern

      // Mark as initialized
      isInitialized = true
      resolve()
    } catch (error) {
      // Reset initialization state on error
      initializationPromise = null

      // Re-throw VTKInitError as-is
      if (error instanceof VTKInitError) {
        reject(error)
        return
      }

      // Wrap other errors
      reject(new VTKInitError(
        `Failed to initialize VTK.js: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_FAILED',
      ))
    }
  })

  return initializationPromise
}

/**
 * Checks if VTK.js has been initialized
 *
 * @returns true if VTK.js is initialized
 */
export function isVTKInitialized(): boolean {
  return isInitialized
}

/**
 * Resets initialization state (primarily for testing)
 */
export function resetInitialization(): void {
  isInitialized = false
  initializationPromise = null
}
