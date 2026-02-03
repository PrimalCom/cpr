Coronary Curved MPR Web System — Features & Flow
Core Features
1. DICOM Data Ingestion

Upload coronary CTA DICOM series directly or load from PACS
Automatic extraction of metadata, pixel data, and spatial information
Optional loading of pre-computed AI segmentation masks for vessels

2. 3D Vessel Visualization

Interactive 3D surface rendering of vessel segmentation masks using VTK.js
Rotate, zoom, and pan controls for navigating the 3D scene
Visual identification of LAD, LCX, and RCA vessels

3. Manual Centerline Generation (Two-Click Workflow)

Click a start point on the 3D vessel surface — ray casting converts the 2D screen click into a 3D coordinate
Click an end point — both points are sent to the backend
Automatic B-spline interpolation computes a smooth curve guided by the vessel segmentation (distance transform / skeletonization)
Visual markers displayed at start, end, and intermediate control points
Centerline editing: add, move, or remove control points for refinement
Visual feedback when the spline deviates outside the vessel lumen (color change)
Independent centerline management per vessel (LAD, LCX, RCA)

4. Curved MPR Generation

Volume reformatting along the finalized centerline
Centerline sampled at regular intervals (e.g. 0.5 mm)
At each sample point: local tangent vector computed, orthogonal perpendicular plane generated, CT volume resampled onto that plane
Slices stacked to form the curved MPR volume
Trilinear or cubic interpolation for high-quality resampling
Consistent up-vector maintenance to prevent rotation artifacts
Progressive loading: low-resolution preview first, then full resolution
Caching of computed MPR volumes for fast retrieval

5. Cross-Sectional Analysis

Click any position on the curved MPR to generate a geometry-correct perpendicular slice at that centerline point
Segmentation overlay on the cross-section showing lumen and vessel wall contours
Quantitative measurements: lumen area, vessel wall area, min/max diameters, mean HU statistics
Plaque quantification on the cross-section

6. Segmentation Overlay

Real-time rendering of lumen and vessel wall masks on both the curved MPR and cross-section views
Overlay toggling on/off for unobstructed viewing

7. Measurement Tools

Lumen area calculation
Vessel wall area calculation
Diameter measurements (min, max)
HU (Hounsfield Unit) statistics
Plaque quantification
Measurement visualization directly on viewports
Measurement export functionality

8. Multi-Viewport Synchronized Display

3D View — vessel segmentation with centerline overlay and point selection
Curved MPR View — vessel unfolded along centerline with measurement tools
Cross-Section View — perpendicular slice with segmentation overlay
Straightened View (optional) — curved MPR projected to a straight line

Synchronization behavior:

Cursor position in any view updates all other views
Zoom/pan operations maintain relative positions across viewports
Window/level adjustments apply uniformly across all views

9. Multi-Vessel Workflow

Create, store, and switch between independent centerlines for LAD, LCX, and RCA
Each vessel maintains its own centerline, MPR volume, and measurement set

10. Session & Storage

Centerline definitions, measurements, and session data persisted in the database
User preferences and session management
Audit logging for all data access and modifications

11. Security & Compliance

Encryption at rest (AES-256) and in transit (TLS 1.3)
Role-based access control for multi-user scenarios
JWT-based secure session management
HIPAA-compliant data handling: de-identification, audit trails, retention/deletion policies


End-to-End Workflow
Step 1 — Data Ingestion
User uploads a coronary CTA DICOM series (or retrieves it from PACS). The system extracts metadata and pixel data. Optionally, pre-computed AI vessel segmentation masks are loaded alongside.
Step 2 — 3D Visualization
The system renders the vessel segmentation as an interactive 3D surface. The user rotates and zooms to identify the vessel of interest (LAD, LCX, or RCA).
Step 3 — Centerline Creation
The user clicks a start point on the vessel surface, then clicks an end point. The backend computes a smooth B-spline through the vessel lumen using segmentation guidance. The centerline appears as an overlay on the 3D view. The user can refine it by adding, moving, or removing control points.
Step 4 — Curved MPR Generation
Once the centerline is finalized, the system resamples the CT volume along the centerline to produce the curved MPR. A low-resolution preview is streamed first, followed by the full-resolution volume. The result is cached for subsequent access.
Step 5 — Interactive Analysis
The user clicks a position on the curved MPR. The system generates a perpendicular cross-section at that centerline point. The cross-section is displayed with segmentation overlays (lumen, vessel wall). All viewports update synchronously to reflect the selected position.
Step 6 — Measurement & Quantification
The user activates measurement tools on the cross-section or curved MPR. Lumen area, vessel wall area, diameters, HU statistics, and plaque metrics are computed and displayed. Results can be exported.
Step 7 — Multi-Vessel Repeat
The user switches to the next vessel (e.g. from LAD to LCX), repeats steps 3–6 with an independent centerline and measurement set.
Step 8 — Save & Export
All centerlines, measurements, and session data are persisted. Results can be exported for reporting or further analysis.

Planned Future Enhancements

AI-powered automatic centerline detection and tracing
Automated stenosis detection with percentage calculation
Plaque characterization (calcified vs. non-calcified via HU thresholds and texture)
FFR-CT (fractional flow reserve) computation from CTA
Structured reporting module with images, measurements, and findings
Multi-timepoint comparison for tracking disease progression across follow-up scans
Mobile/tablet support with touch-optimized interaction
Real-time collaborative annotation and multi-user discussion

