import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'
import { db } from '@/db/index'
import { dicomStudies } from '@/db/schema'
import { StudyList } from '@/components/studies/StudyList'

const getStudies = createServerFn({
  method: 'GET',
}).handler(async () => {
  return await db.query.dicomStudies.findMany({
    orderBy: [desc(dicomStudies.createdAt)],
  })
})

export const Route = createFileRoute('/studies')({
  component: StudiesPage,
  loader: async () => await getStudies(),
})

function StudiesPage() {
  const studies = Route.useLoaderData()

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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300 text-transparent bg-clip-text">
            DICOM Studies
          </h1>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-indigo-300/80">
              View and manage your uploaded DICOM studies
            </p>
            <div className="text-sm text-indigo-300/70">
              {studies.length} {studies.length === 1 ? 'study' : 'studies'}
            </div>
          </div>

          <StudyList studies={studies} />

          <div
            className="mt-6 rounded-lg border p-4"
            style={{
              background: 'rgba(93, 103, 227, 0.05)',
              borderColor: 'rgba(93, 103, 227, 0.2)',
            }}
          >
            <h3 className="text-lg font-semibold mb-2 text-indigo-200">
              About Studies
            </h3>
            <p className="text-sm text-indigo-300/80">
              Studies are automatically created when you upload DICOM files.
              Each study contains one or more series of images organized by
              Study Instance UID. Click on a study to view detailed information
              and image series.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
