import * as React from 'react'
import { UploadProgress } from './UploadProgress'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { validateDicomFile } from '@/lib/imaging/dicom-parser'

export interface DicomUploaderProps {
  /** Callback when upload completes successfully */
  onUploadComplete?: (result: UploadResult) => void
  /** Callback when upload fails */
  onUploadError?: (error: string) => void
  /** Additional class names */
  className?: string
}

export interface UploadResult {
  success: boolean
  studies: number
  series: Array<{
    studyId: number
    seriesId: number
    seriesNumber: number | null
    sliceCount: number
  }>
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

function DicomUploader({
  onUploadComplete,
  onUploadError,
  className,
}: DicomUploaderProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [uploadStatus, setUploadStatus] = React.useState<UploadStatus>('idle')
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [selectedFiles, setSelectedFiles] = React.useState<Array<File>>([])
  const [completedFiles, setCompletedFiles] = React.useState(0)
  const [currentFileName, setCurrentFileName] = React.useState<string>()
  const [errorMessage, setErrorMessage] = React.useState<string>()

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const dragCounterRef = React.useRef(0)

  // Handle file selection
  const handleFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      const fileArray = Array.from(files)
      setSelectedFiles(fileArray)
      setUploadStatus('idle')
      setErrorMessage(undefined)
      setUploadProgress(0)
      setCompletedFiles(0)

      // Validate DICOM files
      setUploadStatus('uploading')
      setCurrentFileName('Validating files...')
      setUploadProgress(10)

      const validFiles: Array<File> = []
      const invalidFiles: Array<string> = []

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        setCurrentFileName(file.name)

        const isValid = await validateDicomFile(file)
        if (isValid) {
          validFiles.push(file)
        } else {
          invalidFiles.push(file.name)
        }

        // Update validation progress (10% to 30%)
        setUploadProgress(10 + (20 * (i + 1)) / fileArray.length)
      }

      if (invalidFiles.length > 0) {
        setUploadStatus('error')
        setErrorMessage(
          `Invalid DICOM files detected: ${invalidFiles.join(', ')}. Please ensure all files are valid DICOM Part 10 format.`,
        )
        setCurrentFileName(undefined)
        onUploadError?.(
          `${invalidFiles.length} invalid file(s): ${invalidFiles.join(', ')}`,
        )
        return
      }

      if (validFiles.length === 0) {
        setUploadStatus('error')
        setErrorMessage('No valid DICOM files selected')
        setCurrentFileName(undefined)
        onUploadError?.('No valid DICOM files selected')
        return
      }

      // Upload files
      try {
        setCurrentFileName('Uploading to server...')
        setUploadProgress(40)

        const formData = new FormData()
        validFiles.forEach((file) => {
          formData.append('files', file)
        })

        const response = await fetch('/api/imaging/upload', {
          method: 'POST',
          body: formData,
        })

        setUploadProgress(90)

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Upload failed')
        }

        const result: UploadResult = await response.json()
        setUploadProgress(100)
        setCompletedFiles(validFiles.length)
        setUploadStatus('success')
        setCurrentFileName(undefined)
        onUploadComplete?.(result)
      } catch (error) {
        setUploadStatus('error')
        const message =
          error instanceof Error
            ? error.message
            : 'An error occurred during upload'
        setErrorMessage(message)
        setCurrentFileName(undefined)
        onUploadError?.(message)
      }
    },
    [onUploadComplete, onUploadError],
  )

  // Drag and drop handlers
  const handleDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      dragCounterRef.current = 0

      const files = e.dataTransfer.files
      handleFiles(files)
    },
    [handleFiles],
  )

  // File input handler
  const handleFileInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files)
    },
    [handleFiles],
  )

  // Click to select files
  const handleClick = React.useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Reset uploader
  const handleReset = React.useCallback(() => {
    setSelectedFiles([])
    setUploadStatus('idle')
    setUploadProgress(0)
    setCompletedFiles(0)
    setCurrentFileName(undefined)
    setErrorMessage(undefined)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const showUploadProgress = uploadStatus !== 'idle' && selectedFiles.length > 0

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drag and Drop Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          'relative flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-background px-6 py-12 text-center transition-all hover:border-primary hover:bg-accent/50',
          isDragging && 'border-primary bg-accent',
          uploadStatus === 'uploading' && 'cursor-not-allowed opacity-60',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".dcm,.dicom"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={uploadStatus === 'uploading'}
        />

        {/* Upload Icon */}
        <div
          className={cn(
            'mb-4 rounded-full bg-primary/10 p-4 transition-all',
            isDragging && 'scale-110 bg-primary/20',
          )}
        >
          <svg
            className="size-12 text-primary"
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

        {/* Instructions */}
        <div className="space-y-2">
          <p className="text-lg font-medium">
            {isDragging ? 'Drop DICOM files here' : 'Drag and drop DICOM files'}
          </p>
          <p className="text-sm text-muted-foreground">
            or click to browse your computer
          </p>
          <p className="text-xs text-muted-foreground">
            Supports .dcm and .dicom files
          </p>
        </div>
      </div>

      {/* Upload Progress */}
      {showUploadProgress && (
        <UploadProgress
          progress={uploadProgress}
          totalFiles={selectedFiles.length}
          completedFiles={completedFiles}
          currentFileName={currentFileName}
          status={uploadStatus}
          errorMessage={errorMessage}
        />
      )}

      {/* Actions */}
      {(uploadStatus === 'success' || uploadStatus === 'error') && (
        <div className="flex justify-end gap-2">
          <Button onClick={handleReset} variant="outline">
            Upload More Files
          </Button>
        </div>
      )}
    </div>
  )
}

export { DicomUploader }
