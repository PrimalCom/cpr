import { createFileRoute } from '@tanstack/react-router'
import type { UploadResult } from '@/components/upload/DicomUploader'
import { DicomUploader } from '@/components/upload/DicomUploader'
import { DemoModelSelector } from '@/components/upload/DemoModelSelector'

export const Route = createFileRoute('/upload')({
  component: UploadPage,
})

function UploadPage() {
  const handleUploadComplete = (result: UploadResult) => {
    // Handle successful upload - could redirect to studies page or show success message
    if (result.success) {
      // Success handled by upload component UI
    }
  }

  const handleUploadError = (_error: string) => {
    // Error handled by upload component UI
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4 text-white"
      style={{
        background:
          'linear-gradient(135deg, #0c1a2b 0%, #1a2332 50%, #16202e 100%)',
      }}
    >
      <div
        className="w-full max-w-4xl rounded-xl border border-white/10 p-8 shadow-2xl"
        style={{
          background:
            'linear-gradient(135deg, rgba(22, 32, 46, 0.95) 0%, rgba(12, 26, 43, 0.95) 100%)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div
          className="mb-8 flex items-center justify-center gap-4 rounded-lg p-4"
          style={{
            background:
              'linear-gradient(90deg, rgba(93, 103, 227, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
            border: '1px solid rgba(93, 103, 227, 0.2)',
          }}
        >
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-lg blur-lg opacity-60 group-hover:opacity-100 transition duration-500"></div>
            <div className="relative bg-gradient-to-br from-indigo-600 to-purple-600 p-3 rounded-lg">
              <svg
                className="h-8 w-8 transform group-hover:scale-110 transition-transform duration-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 text-transparent bg-clip-text">
            Load Study
          </h1>
        </div>

        <div className="space-y-8">
          {/* Demo Models Section */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-indigo-200">
              Demo Models
            </h2>
            <p className="mb-4 text-sm text-indigo-300/60">
              Select a synthetic vessel phantom to open in the viewer.
            </p>
            <DemoModelSelector />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-medium uppercase tracking-wider text-indigo-300/40">
              or upload your own
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Upload Section */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-indigo-200">
              Upload DICOM Files
            </h2>
            <p className="mb-4 text-sm text-indigo-300/60">
              Drag and drop DICOM files or click to browse.
            </p>

            <DicomUploader
              onUploadComplete={handleUploadComplete}
              onUploadError={handleUploadError}
            />

            <div
              className="mt-4 rounded-lg border p-4"
              style={{
                background: 'rgba(93, 103, 227, 0.05)',
                borderColor: 'rgba(93, 103, 227, 0.2)',
              }}
            >
              <h3 className="text-sm font-semibold mb-2 text-indigo-200">
                Requirements
              </h3>
              <ul className="space-y-1 text-xs text-indigo-300/60 list-disc list-inside">
                <li>Files must be in DICOM Part 10 format (.dcm or .dicom)</li>
                <li>Multiple files can be uploaded at once</li>
                <li>
                  Files will be organized by Study UID and Series automatically
                </li>
                <li>View uploaded studies on the Studies page after upload</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
