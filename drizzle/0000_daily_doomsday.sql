CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "centerline_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"centerline_id" integer NOT NULL,
	"position" integer,
	"x" real,
	"y" real,
	"z" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "centerlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"vessel_type" text NOT NULL,
	"control_points" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dicom_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"series_number" integer,
	"modality" text,
	"rows" integer,
	"columns" integer,
	"slice_count" integer,
	"pixel_spacing" text,
	"slice_thickness" real,
	"window_width" integer,
	"window_center" integer,
	"storage_path" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dicom_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" text,
	"study_date" timestamp,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"centerline_id" integer NOT NULL,
	"position" real,
	"type" text NOT NULL,
	"value" real,
	"unit" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "segmentations" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"vessel_type" text,
	"storage_path" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "centerline_points" ADD CONSTRAINT "centerline_points_centerline_id_centerlines_id_fk" FOREIGN KEY ("centerline_id") REFERENCES "public"."centerlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centerlines" ADD CONSTRAINT "centerlines_study_id_dicom_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."dicom_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dicom_series" ADD CONSTRAINT "dicom_series_study_id_dicom_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."dicom_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_centerline_id_centerlines_id_fk" FOREIGN KEY ("centerline_id") REFERENCES "public"."centerlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segmentations" ADD CONSTRAINT "segmentations_series_id_dicom_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."dicom_series"("id") ON DELETE no action ON UPDATE no action;