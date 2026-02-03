import * as React from 'react'
import { cn } from '@/lib/utils'

export interface UploadProgressProps {
  /** Current upload progress (0-100) */
  progress: number
  /** Total number of files being uploaded */
  totalFiles: number
  /** Number of files completed */
  completedFiles: number
  /** Current file name being uploaded */
  currentFileName?: string
  /** Upload status */
  status: 'idle' | 'uploading' | 'success' | 'error'
  /** Error message if status is error */
  errorMessage?: string
  /** Additional class names */
  className?: string
}

function UploadProgress({
  progress,
  totalFiles,
  completedFiles,
  currentFileName,
  status,
  errorMessage,
  className,
}: UploadProgressProps) {
  const showProgress = status === 'uploading' || status === 'success'

  return (
    <div
      className={cn(
        'rounded-lg border bg-background p-4 shadow-xs transition-all',
        status === 'error' && 'border-destructive',
        status === 'success' && 'border-primary',
        className,
      )}
    >
      {/* Status Message */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'uploading' && (
            <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          {status === 'success' && (
            <svg
              className="size-4 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          {status === 'error' && (
            <svg
              className="size-4 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          <span className="text-sm font-medium">
            {status === 'uploading' && 'Uploading...'}
            {status === 'success' && 'Upload complete'}
            {status === 'error' && 'Upload failed'}
            {status === 'idle' && 'Ready to upload'}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {completedFiles} / {totalFiles} files
        </span>
      </div>

      {/* Progress Bar */}
      {showProgress && (
        <div className="mb-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                'h-full transition-all duration-300',
                status === 'success' ? 'bg-primary' : 'bg-primary',
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {/* Current File */}
      {currentFileName && status === 'uploading' && (
        <div className="text-xs text-muted-foreground">
          Processing: {currentFileName}
        </div>
      )}

      {/* Error Message */}
      {status === 'error' && errorMessage && (
        <div className="mt-2 text-sm text-destructive">{errorMessage}</div>
      )}
    </div>
  )
}

export { UploadProgress }
