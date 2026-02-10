import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

interface DemoModel {
  name: string
  description: string
  shape: [number, number, number]
  numVessels: number
}

interface DemoModelSelectorProps {
  className?: string
}

function DemoModelSelector({ className }: DemoModelSelectorProps) {
  const navigate = useNavigate()
  const [demos, setDemos] = React.useState<Array<DemoModel>>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [loadingModel, setLoadingModel] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function fetchDemos() {
      try {
        const response = await fetch('/api/imaging/demos')
        if (response.status === 401) {
          navigate({ to: '/login' })
          return
        }
        if (!response.ok) {
          throw new Error('Failed to load demo models')
        }
        const data = await response.json()
        setDemos(data.demos)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load demos')
      } finally {
        setIsLoading(false)
      }
    }
    fetchDemos()
  }, [navigate])

  const handleLoadDemo = async (name: string) => {
    setLoadingModel(name)
    setError(null)

    try {
      const response = await fetch('/api/imaging/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      if (response.status === 401) {
        navigate({ to: '/login' })
        return
      }
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to load demo')
      }

      const data = await response.json()
      navigate({ to: '/viewer/$studyId', params: { studyId: String(data.studyId) } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo')
      setLoadingModel(null)
    }
  }

  const formatShape = (shape: [number, number, number]) =>
    `${shape[0]} x ${shape[1]} x ${shape[2]}`

  const formatName = (name: string) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          Loading demo models...
        </div>
      </div>
    )
  }

  if (error && demos.length === 0) {
    return (
      <div className={cn('text-sm text-destructive', className)}>{error}</div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {demos.map((demo) => {
          const isLoadingThis = loadingModel === demo.name
          return (
            <button
              key={demo.name}
              onClick={() => handleLoadDemo(demo.name)}
              disabled={loadingModel !== null}
              className={cn(
                'group relative flex flex-col gap-2 rounded-lg border border-white/10 p-4 text-left transition-all',
                'hover:border-indigo-500/50 hover:bg-indigo-500/5',
                isLoadingThis && 'border-indigo-500/50 bg-indigo-500/10',
                loadingModel !== null && !isLoadingThis && 'opacity-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-indigo-200 group-hover:text-indigo-100">
                  {formatName(demo.name)}
                </h4>
                {isLoadingThis ? (
                  <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
                ) : (
                  <svg
                    className="h-4 w-4 shrink-0 text-indigo-400/50 transition-colors group-hover:text-indigo-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14 5l7 7m0 0l-7 7m7-7H3"
                    />
                  </svg>
                )}
              </div>
              <p className="text-xs text-indigo-300/60">{demo.description}</p>
              <div className="flex gap-3 text-xs text-indigo-300/40">
                <span>{formatShape(demo.shape)} voxels</span>
                <span>{demo.numVessels} vessel{demo.numVessels !== 1 ? 's' : ''}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { DemoModelSelector }
