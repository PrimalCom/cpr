import { describe, expect, it } from 'vitest'
import { isDicomFile, parseDicomFile } from '../dicom-parser'

/**
 * Helper to create a minimal DICOM Part 10 buffer with the DICM preamble
 * and specified DICOM data elements.
 */
function createDicomBuffer(
  elements: Array<{ tag: string; vr: string; value: string }>,
): ArrayBuffer {
  // DICOM Part 10: 128 bytes preamble + 'DICM' prefix + data elements
  const preambleSize = 128 + 4 // 128 zero bytes + 'DICM'

  // Calculate total size needed for elements
  let elementsSize = 0
  for (const el of elements) {
    // Each element: 4 bytes tag + 2 bytes VR + 2 bytes length + value bytes
    elementsSize += 4 + 2 + 2 + el.value.length
  }

  // Add File Meta Information header (group 0002)
  // Minimum: Transfer Syntax UID element
  const transferSyntaxValue = '1.2.840.10008.1.2.1' // Explicit VR Little Endian
  const metaHeaderSize = 4 + 2 + 2 + transferSyntaxValue.length

  const totalSize = preambleSize + metaHeaderSize + elementsSize
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)
  const uint8 = new Uint8Array(buffer)

  // Write 128-byte preamble (zeros) — already zero
  // Write 'DICM' at offset 128
  uint8[128] = 'D'.charCodeAt(0)
  uint8[129] = 'I'.charCodeAt(0)
  uint8[130] = 'C'.charCodeAt(0)
  uint8[131] = 'M'.charCodeAt(0)

  let offset = preambleSize

  // Write Transfer Syntax UID (0002,0010)
  view.setUint16(offset, 0x0002, true) // group
  view.setUint16(offset + 2, 0x0010, true) // element
  uint8[offset + 4] = 'U'.charCodeAt(0) // VR = UI
  uint8[offset + 5] = 'I'.charCodeAt(0)
  view.setUint16(offset + 6, transferSyntaxValue.length, true) // length
  for (let i = 0; i < transferSyntaxValue.length; i++) {
    uint8[offset + 8 + i] = transferSyntaxValue.charCodeAt(i)
  }
  offset += 8 + transferSyntaxValue.length

  // Write each element
  for (const el of elements) {
    const tagNum = parseInt(el.tag.replace('x', '0x'), 16)
    const group = (tagNum >> 16) & 0xffff
    const element = tagNum & 0xffff

    view.setUint16(offset, group, true)
    view.setUint16(offset + 2, element, true)
    uint8[offset + 4] = el.vr.charCodeAt(0)
    uint8[offset + 5] = el.vr.charCodeAt(1)
    view.setUint16(offset + 6, el.value.length, true)

    for (let i = 0; i < el.value.length; i++) {
      uint8[offset + 8 + i] = el.value.charCodeAt(i)
    }
    offset += 8 + el.value.length
  }

  return buffer
}

describe('dicom-parser', () => {
  describe('isDicomFile', () => {
    it('should return true for valid DICOM Part 10 buffer', () => {
      const buffer = createDicomBuffer([])
      expect(isDicomFile(buffer)).toBe(true)
    })

    it('should return false for buffer too small', () => {
      const buffer = new ArrayBuffer(100)
      expect(isDicomFile(buffer)).toBe(false)
    })

    it('should return false for buffer without DICM magic number', () => {
      const buffer = new ArrayBuffer(200)
      const uint8 = new Uint8Array(buffer)
      uint8[128] = 'N'.charCodeAt(0)
      uint8[129] = 'O'.charCodeAt(0)
      uint8[130] = 'P'.charCodeAt(0)
      uint8[131] = 'E'.charCodeAt(0)
      expect(isDicomFile(buffer)).toBe(false)
    })

    it('should return false for empty buffer', () => {
      const buffer = new ArrayBuffer(0)
      expect(isDicomFile(buffer)).toBe(false)
    })
  })

  describe('parseDicomFile', () => {
    it('should extract patient ID from DICOM buffer', () => {
      const buffer = createDicomBuffer([
        { tag: 'x00100020', vr: 'LO', value: 'PATIENT001' },
      ])
      const metadata = parseDicomFile(buffer)
      expect(metadata.patientId).toBe('PATIENT001')
    })

    it('should extract modality from DICOM buffer', () => {
      const buffer = createDicomBuffer([
        { tag: 'x00080060', vr: 'CS', value: 'CT' },
      ])
      const metadata = parseDicomFile(buffer)
      expect(metadata.modality).toBe('CT')
    })

    it('should return null for missing fields', () => {
      // Buffer with only modality set — all other fields should be null
      const buffer = createDicomBuffer([
        { tag: 'x00080060', vr: 'CS', value: 'CT' },
      ])
      const metadata = parseDicomFile(buffer)
      expect(metadata.patientId).toBeNull()
      expect(metadata.studyDate).toBeNull()
      expect(metadata.seriesNumber).toBeNull()
      expect(metadata.rows).toBeNull()
      expect(metadata.columns).toBeNull()
      expect(metadata.pixelSpacing).toBeNull()
      expect(metadata.sliceThickness).toBeNull()
      expect(metadata.imagePosition).toBeNull()
      expect(metadata.windowCenter).toBeNull()
      expect(metadata.windowWidth).toBeNull()
    })

    it('should throw for invalid DICOM data', () => {
      // Random garbage data
      const buffer = new ArrayBuffer(10)
      const uint8 = new Uint8Array(buffer)
      for (let i = 0; i < 10; i++) uint8[i] = Math.floor(Math.random() * 256)
      expect(() => parseDicomFile(buffer)).toThrow('Failed to parse DICOM file')
    })

    it('should extract study description', () => {
      const buffer = createDicomBuffer([
        { tag: 'x00081030', vr: 'LO', value: 'CT CORONARY' },
      ])
      const metadata = parseDicomFile(buffer)
      expect(metadata.studyDescription).toBe('CT CORONARY')
    })

    it('should return all metadata fields as part of the DicomMetadata interface', () => {
      const buffer = createDicomBuffer([
        { tag: 'x00080060', vr: 'CS', value: 'CT' },
      ])
      const metadata = parseDicomFile(buffer)
      // Verify all expected keys exist
      expect(metadata).toHaveProperty('patientId')
      expect(metadata).toHaveProperty('patientName')
      expect(metadata).toHaveProperty('studyInstanceUID')
      expect(metadata).toHaveProperty('studyDate')
      expect(metadata).toHaveProperty('seriesInstanceUID')
      expect(metadata).toHaveProperty('seriesNumber')
      expect(metadata).toHaveProperty('modality')
      expect(metadata).toHaveProperty('rows')
      expect(metadata).toHaveProperty('columns')
      expect(metadata).toHaveProperty('pixelSpacing')
      expect(metadata).toHaveProperty('sliceThickness')
      expect(metadata).toHaveProperty('imagePosition')
      expect(metadata).toHaveProperty('windowCenter')
      expect(metadata).toHaveProperty('windowWidth')
      expect(metadata).toHaveProperty('bitsAllocated')
      expect(metadata).toHaveProperty('bitsStored')
    })
  })
})
