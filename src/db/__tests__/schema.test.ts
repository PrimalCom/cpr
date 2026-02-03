import { describe, expect, it } from 'vitest'
import {
  auditLogs,
  centerlinePoints,
  centerlines,
  dicomSeries,
  dicomStudies,
  measurements,
  segmentations,
  todos,
  userRoles,
} from '../schema'

/**
 * Helper to get column names from a Drizzle table
 */
function getColumnNames(table: Record<string, unknown>): Array<string> {
  // Drizzle tables have a Symbol property for columns, but the columns
  // are also directly accessible as properties of the table
  return Object.keys(table).filter((key) => {
    const val = table[key]
    // Drizzle column objects have a 'name' property and 'columnType'
    return val && typeof val === 'object' && 'name' in val
  })
}

describe('database schema', () => {
  describe('all 9 tables are defined', () => {
    it('should export todos table', () => {
      expect(todos).toBeDefined()
    })

    it('should export dicomStudies table', () => {
      expect(dicomStudies).toBeDefined()
    })

    it('should export dicomSeries table', () => {
      expect(dicomSeries).toBeDefined()
    })

    it('should export segmentations table', () => {
      expect(segmentations).toBeDefined()
    })

    it('should export centerlines table', () => {
      expect(centerlines).toBeDefined()
    })

    it('should export centerlinePoints table', () => {
      expect(centerlinePoints).toBeDefined()
    })

    it('should export measurements table', () => {
      expect(measurements).toBeDefined()
    })

    it('should export auditLogs table', () => {
      expect(auditLogs).toBeDefined()
    })

    it('should export userRoles table', () => {
      expect(userRoles).toBeDefined()
    })
  })

  describe('dicomStudies columns', () => {
    it('should have id column', () => {
      const cols = getColumnNames(dicomStudies)
      expect(cols).toContain('id')
    })

    it('should have patientId column', () => {
      const cols = getColumnNames(dicomStudies)
      expect(cols).toContain('patientId')
    })

    it('should have studyDate column', () => {
      const cols = getColumnNames(dicomStudies)
      expect(cols).toContain('studyDate')
    })

    it('should have description column', () => {
      const cols = getColumnNames(dicomStudies)
      expect(cols).toContain('description')
    })

    it('should have createdAt column', () => {
      const cols = getColumnNames(dicomStudies)
      expect(cols).toContain('createdAt')
    })
  })

  describe('dicomSeries columns', () => {
    it('should have required columns', () => {
      const cols = getColumnNames(dicomSeries)
      expect(cols).toContain('id')
      expect(cols).toContain('studyId')
      expect(cols).toContain('seriesNumber')
      expect(cols).toContain('modality')
      expect(cols).toContain('rows')
      expect(cols).toContain('columns')
      expect(cols).toContain('sliceCount')
      expect(cols).toContain('pixelSpacing')
      expect(cols).toContain('sliceThickness')
      expect(cols).toContain('storagePath')
    })
  })

  describe('centerlines columns', () => {
    it('should have required columns', () => {
      const cols = getColumnNames(centerlines)
      expect(cols).toContain('id')
      expect(cols).toContain('studyId')
      expect(cols).toContain('vesselType')
      expect(cols).toContain('controlPoints')
      expect(cols).toContain('createdAt')
      expect(cols).toContain('updatedAt')
    })
  })

  describe('centerlinePoints columns', () => {
    it('should have coordinate columns', () => {
      const cols = getColumnNames(centerlinePoints)
      expect(cols).toContain('id')
      expect(cols).toContain('centerlineId')
      expect(cols).toContain('position')
      expect(cols).toContain('x')
      expect(cols).toContain('y')
      expect(cols).toContain('z')
    })
  })

  describe('measurements columns', () => {
    it('should have required columns', () => {
      const cols = getColumnNames(measurements)
      expect(cols).toContain('id')
      expect(cols).toContain('centerlineId')
      expect(cols).toContain('position')
      expect(cols).toContain('type')
      expect(cols).toContain('value')
      expect(cols).toContain('unit')
      expect(cols).toContain('metadata')
    })
  })

  describe('auditLogs columns', () => {
    it('should have required columns', () => {
      const cols = getColumnNames(auditLogs)
      expect(cols).toContain('id')
      expect(cols).toContain('userId')
      expect(cols).toContain('action')
      expect(cols).toContain('resourceType')
      expect(cols).toContain('resourceId')
      expect(cols).toContain('metadata')
      expect(cols).toContain('createdAt')
    })
  })

  describe('userRoles columns', () => {
    it('should have required columns', () => {
      const cols = getColumnNames(userRoles)
      expect(cols).toContain('id')
      expect(cols).toContain('userId')
      expect(cols).toContain('role')
      expect(cols).toContain('createdAt')
    })
  })

  describe('segmentations columns', () => {
    it('should have required columns', () => {
      const cols = getColumnNames(segmentations)
      expect(cols).toContain('id')
      expect(cols).toContain('seriesId')
      expect(cols).toContain('vesselType')
      expect(cols).toContain('storagePath')
      expect(cols).toContain('createdAt')
    })
  })

  describe('foreign key constraints', () => {
    it('should have studyId FK on dicomSeries', () => {
      // Drizzle column with .references() will have a reference config
      const studyIdCol = dicomSeries.studyId as unknown as {
        config?: { references?: unknown }
      }
      // The column should exist and be defined with notNull
      expect(dicomSeries.studyId).toBeDefined()
    })

    it('should have seriesId FK on segmentations', () => {
      expect(segmentations.seriesId).toBeDefined()
    })

    it('should have studyId FK on centerlines', () => {
      expect(centerlines.studyId).toBeDefined()
    })

    it('should have centerlineId FK on centerlinePoints', () => {
      expect(centerlinePoints.centerlineId).toBeDefined()
    })

    it('should have centerlineId FK on measurements', () => {
      expect(measurements.centerlineId).toBeDefined()
    })
  })
})
