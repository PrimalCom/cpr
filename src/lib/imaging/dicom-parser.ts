import * as dicomParser from 'dicom-parser'

/**
 * DICOM metadata extracted from a DICOM file
 */
export interface DicomMetadata {
  // Patient information
  patientId: string | null
  patientName: string | null

  // Study information
  studyInstanceUID: string | null
  studyDate: string | null
  studyTime: string | null
  studyDescription: string | null

  // Series information
  seriesInstanceUID: string | null
  seriesNumber: number | null
  seriesDescription: string | null
  modality: string | null

  // Image information
  sopInstanceUID: string | null
  instanceNumber: number | null
  rows: number | null
  columns: number | null

  // Spatial information
  pixelSpacing: [number, number] | null // [row spacing, column spacing]
  sliceThickness: number | null
  imagePosition: [number, number, number] | null // [x, y, z]
  imageOrientation: Array<number> | null

  // Display information
  windowCenter: number | null
  windowWidth: number | null

  // Additional metadata
  bitsAllocated: number | null
  bitsStored: number | null
  samplesPerPixel: number | null
  photometricInterpretation: string | null
}

/**
 * Parses a DICOM file and extracts metadata
 *
 * @param arrayBuffer - ArrayBuffer containing DICOM file data
 * @returns Extracted DICOM metadata
 * @throws Error if DICOM parsing fails
 */
export function parseDicomFile(arrayBuffer: ArrayBuffer): DicomMetadata {
  try {
    // Parse DICOM file
    const byteArray = new Uint8Array(arrayBuffer)
    const dataSet = dicomParser.parseDicom(byteArray)

    // Helper function to safely get string value
    const getString = (tag: string): string | null => {
      try {
        return dataSet.string(tag) ?? null
      } catch {
        return null
      }
    }

    // Helper function to safely get integer value
    const getInt = (tag: string): number | null => {
      try {
        const value = dataSet.intString(tag)
        return value !== undefined ? parseInt(String(value), 10) : null
      } catch {
        return null
      }
    }

    // Helper function to safely get float value
    const getFloat = (tag: string): number | null => {
      try {
        const value = dataSet.floatString(tag)
        return value !== undefined ? parseFloat(String(value)) : null
      } catch {
        return null
      }
    }

    // Helper function to get array of floats
    const getFloatArray = (tag: string): Array<number> | null => {
      try {
        const str = getString(tag)
        if (!str) return null
        return str
          .split('\\')
          .map((s) => parseFloat(s.trim()))
          .filter((n) => !isNaN(n))
      } catch {
        return null
      }
    }

    // Extract pixel spacing [row spacing, column spacing]
    const pixelSpacingArray = getFloatArray('x00280030')
    const pixelSpacing: [number, number] | null =
      pixelSpacingArray && pixelSpacingArray.length >= 2
        ? [pixelSpacingArray[0], pixelSpacingArray[1]]
        : null

    // Extract image position [x, y, z]
    const imagePositionArray = getFloatArray('x00200032')
    const imagePosition: [number, number, number] | null =
      imagePositionArray && imagePositionArray.length >= 3
        ? [imagePositionArray[0], imagePositionArray[1], imagePositionArray[2]]
        : null

    // Extract image orientation
    const imageOrientation = getFloatArray('x00200037')

    // Extract window center and width (may be multi-valued, take first)
    const windowCenterStr = getString('x00281050')
    const windowWidthStr = getString('x00281051')
    const windowCenter = windowCenterStr
      ? parseFloat(windowCenterStr.split('\\')[0])
      : null
    const windowWidth = windowWidthStr
      ? parseFloat(windowWidthStr.split('\\')[0])
      : null

    // Build metadata object
    const metadata: DicomMetadata = {
      // Patient information
      patientId: getString('x00100020'),
      patientName: getString('x00100010'),

      // Study information
      studyInstanceUID: getString('x0020000d'),
      studyDate: getString('x00080020'),
      studyTime: getString('x00080030'),
      studyDescription: getString('x00081030'),

      // Series information
      seriesInstanceUID: getString('x0020000e'),
      seriesNumber: getInt('x00200011'),
      seriesDescription: getString('x0008103e'),
      modality: getString('x00080060'),

      // Image information
      sopInstanceUID: getString('x00080018'),
      instanceNumber: getInt('x00200013'),
      rows: getInt('x00280010'),
      columns: getInt('x00280011'),

      // Spatial information
      pixelSpacing,
      sliceThickness: getFloat('x00180050'),
      imagePosition,
      imageOrientation,

      // Display information
      windowCenter: !isNaN(windowCenter!) ? windowCenter : null,
      windowWidth: !isNaN(windowWidth!) ? windowWidth : null,

      // Additional metadata
      bitsAllocated: getInt('x00280100'),
      bitsStored: getInt('x00280101'),
      samplesPerPixel: getInt('x00280002'),
      photometricInterpretation: getString('x00280004'),
    }

    return metadata
  } catch (error) {
    throw new Error(
      `Failed to parse DICOM file: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Validates that a file is a DICOM file by checking the Part 10 header
 *
 * @param arrayBuffer - ArrayBuffer containing file data
 * @returns true if the file has a valid DICOM Part 10 header
 */
export function isDicomFile(arrayBuffer: ArrayBuffer): boolean {
  try {
    // DICOM Part 10 files have 'DICM' magic number at byte 128
    if (arrayBuffer.byteLength < 132) {
      return false
    }

    const byteArray = new Uint8Array(arrayBuffer)
    const dicm = String.fromCharCode(
      byteArray[128],
      byteArray[129],
      byteArray[130],
      byteArray[131],
    )

    return dicm === 'DICM'
  } catch {
    return false
  }
}

/**
 * Parses a DICOM file from a File object
 *
 * @param file - File object containing DICOM data
 * @returns Promise that resolves to extracted DICOM metadata
 */
export async function parseDicomFileFromFile(
  file: File,
): Promise<DicomMetadata> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        if (!event.target?.result) {
          reject(new Error('Failed to read file'))
          return
        }

        const arrayBuffer = event.target.result as ArrayBuffer
        const metadata = parseDicomFile(arrayBuffer)
        resolve(metadata)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * Validates a DICOM file from a File object
 *
 * @param file - File object to validate
 * @returns Promise that resolves to true if file is valid DICOM
 */
export async function validateDicomFile(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        if (!event.target?.result) {
          resolve(false)
          return
        }

        const arrayBuffer = event.target.result as ArrayBuffer
        resolve(isDicomFile(arrayBuffer))
      } catch {
        resolve(false)
      }
    }

    reader.onerror = () => {
      resolve(false)
    }

    // Only read first 132 bytes for validation
    reader.readAsArrayBuffer(file.slice(0, 132))
  })
}
