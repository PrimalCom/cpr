import {
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const todos = pgTable('todos', {
  id: serial().primaryKey(),
  title: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// Medical Imaging Tables

export const dicomStudies = pgTable('dicom_studies', {
  id: serial().primaryKey(),
  patientId: text('patient_id'),
  studyDate: timestamp('study_date'),
  description: text(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const dicomSeries = pgTable('dicom_series', {
  id: serial().primaryKey(),
  studyId: integer('study_id')
    .notNull()
    .references(() => dicomStudies.id),
  seriesNumber: integer('series_number'),
  modality: text(),
  rows: integer(),
  columns: integer(),
  sliceCount: integer('slice_count'),
  pixelSpacing: text('pixel_spacing'),
  sliceThickness: real('slice_thickness'),
  windowWidth: integer('window_width'),
  windowCenter: integer('window_center'),
  storagePath: text('storage_path'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const segmentations = pgTable('segmentations', {
  id: serial().primaryKey(),
  seriesId: integer('series_id')
    .notNull()
    .references(() => dicomSeries.id),
  vesselType: text('vessel_type'),
  storagePath: text('storage_path'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const centerlines = pgTable('centerlines', {
  id: serial().primaryKey(),
  studyId: integer('study_id')
    .notNull()
    .references(() => dicomStudies.id),
  vesselType: text('vessel_type').notNull(),
  controlPoints: jsonb('control_points'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const centerlinePoints = pgTable('centerline_points', {
  id: serial().primaryKey(),
  centerlineId: integer('centerline_id')
    .notNull()
    .references(() => centerlines.id),
  position: integer(),
  x: real(),
  y: real(),
  z: real(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const measurements = pgTable('measurements', {
  id: serial().primaryKey(),
  centerlineId: integer('centerline_id')
    .notNull()
    .references(() => centerlines.id),
  position: real(),
  type: text().notNull(),
  value: real(),
  unit: text(),
  metadata: jsonb(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: serial().primaryKey(),
  userId: text('user_id'),
  action: text().notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  metadata: jsonb(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const userRoles = pgTable('user_roles', {
  id: serial().primaryKey(),
  userId: text('user_id').notNull(),
  role: text().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
