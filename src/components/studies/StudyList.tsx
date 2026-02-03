import * as React from 'react'
import { cn } from '@/lib/utils'

export interface Study {
  id: number
  patientId: string | null
  studyDate: Date | null
  description: string | null
  createdAt: Date | null
}

export interface StudyListProps {
  studies: Array<Study>
  className?: string
}

function StudyList({ studies, className }: StudyListProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className={cn('space-y-3', className)}>
      {studies.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 p-4 w-16 h-16 flex items-center justify-center">
            <svg
              className="h-8 w-8 text-white"
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
          <p className="text-lg font-medium text-indigo-200">
            No studies found
          </p>
          <p className="text-sm text-indigo-300/70 mt-2">
            Upload DICOM files to create your first study
          </p>
        </div>
      ) : (
        studies.map((study) => (
          <div
            key={study.id}
            className="rounded-lg border p-4 shadow-md transition-all hover:scale-[1.02] cursor-pointer group"
            style={{
              background:
                'linear-gradient(135deg, rgba(93, 103, 227, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)',
              borderColor: 'rgba(93, 103, 227, 0.3)',
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white group-hover:text-indigo-200 transition-colors">
                    {study.description || 'Untitled Study'}
                  </h3>
                  <span className="text-xs text-indigo-300/70">
                    #{study.id}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-indigo-300/80">
                  <span className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    Patient: {study.patientId || 'Unknown'}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {formatDate(study.studyDate)}
                  </span>
                </div>
              </div>
              <div
                className="flex items-center justify-center w-10 h-10 rounded-lg transition-all group-hover:scale-110"
                style={{
                  background: 'rgba(93, 103, 227, 0.2)',
                }}
              >
                <svg
                  className="h-5 w-5 text-indigo-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export { StudyList }
