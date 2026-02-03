import * as React from 'react'
import type {Measurement} from '@/hooks/useMeasurements';
import { Button } from '@/components/ui/button'
import {  useMeasurements } from '@/hooks/useMeasurements'

interface MeasurementPanelProps {
  centerlineId: number | null
  vesselType?: 'LAD' | 'LCX' | 'RCA'
  className?: string
}

/**
 * MeasurementPanel Component
 *
 * Displays computed measurements (lumen area, wall area, diameters, HU stats)
 * for a selected centerline. Includes measurement export as JSON download.
 *
 * Features:
 * - Display all measurements for a centerline
 * - Group measurements by type
 * - Export measurements as JSON
 * - Responsive side panel layout
 */
export function MeasurementPanel({
  centerlineId,
  vesselType,
  className,
}: MeasurementPanelProps) {
  const { measurements, loading, error, fetchMeasurements } = useMeasurements()
  const [exportError, setExportError] = React.useState<string | null>(null)

  // Fetch measurements when centerlineId changes
  React.useEffect(() => {
    if (centerlineId) {
      fetchMeasurements(centerlineId).catch((err) => {
        // Error is handled by the hook
      })
    }
  }, [centerlineId, fetchMeasurements])

  /**
   * Export measurements as JSON file
   */
  const handleExport = React.useCallback(() => {
    try {
      setExportError(null)

      if (measurements.length === 0) {
        setExportError('No measurements to export')
        return
      }

      // Prepare export data
      const exportData = {
        vesselType: vesselType || 'Unknown',
        centerlineId,
        exportDate: new Date().toISOString(),
        measurementCount: measurements.length,
        measurements: measurements.map((m) => ({
          id: m.id,
          position: m.position,
          type: m.type,
          value: m.value,
          unit: m.unit,
          metadata: m.metadata,
          createdAt: m.createdAt,
        })),
      }

      // Convert to JSON
      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      // Create download link
      const link = document.createElement('a')
      link.href = url
      link.download = `measurements-${vesselType || 'vessel'}-${centerlineId}-${Date.now()}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setExportError(err.message || 'Failed to export measurements')
    }
  }, [measurements, centerlineId, vesselType])

  /**
   * Format measurement value with unit
   */
  const formatValue = (value: number, unit: string | null) => {
    if (unit) {
      return `${value.toFixed(2)} ${unit}`
    }
    return value.toFixed(2)
  }

  /**
   * Get display name for measurement type
   */
  const getTypeName = (type: string): string => {
    const typeNames: Record<string, string> = {
      lumen_area: 'Lumen Area',
      wall_area: 'Wall Area',
      min_diameter: 'Min Diameter',
      max_diameter: 'Max Diameter',
      mean_hu: 'Mean HU',
      plaque_volume: 'Plaque Volume',
    }
    return typeNames[type] || type
  }

  /**
   * Group measurements by position
   */
  const groupedMeasurements = React.useMemo(() => {
    const groups: Record<number, Array<Measurement>> = {}

    measurements.forEach((m) => {
      const position = m.position
      if (!Object.prototype.hasOwnProperty.call(groups, position)) {
        groups[position] = []
      }
      groups[position].push(m)
    })

    return groups
  }, [measurements])

  const positionKeys = Object.keys(groupedMeasurements)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div
      className={`flex flex-col h-full bg-background border-l border-border ${className || ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold">Measurements</h2>
          {vesselType && (
            <p className="text-sm text-muted-foreground">
              Vessel: <span className="font-medium">{vesselType}</span>
            </p>
          )}
        </div>
        <Button
          onClick={handleExport}
          size="sm"
          variant="outline"
          disabled={measurements.length === 0}
        >
          Export JSON
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">
              Loading measurements...
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium">
              Error: {error}
            </p>
          </div>
        )}

        {exportError && (
          <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium">
              Export Error: {exportError}
            </p>
          </div>
        )}

        {!loading && !error && !centerlineId && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              Select a centerline to view measurements
            </p>
          </div>
        )}

        {!loading && !error && centerlineId && measurements.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              No measurements available
            </p>
          </div>
        )}

        {!loading && !error && measurements.length > 0 && (
          <div className="space-y-6">
            {/* Summary Statistics */}
            <div className="p-4 rounded-lg bg-accent/50 border border-border">
              <h3 className="text-sm font-semibold mb-2">Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Total:</span>
                  <span className="ml-2 font-medium">
                    {measurements.length}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Positions:</span>
                  <span className="ml-2 font-medium">
                    {positionKeys.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Measurements by Position */}
            {positionKeys.map((position) => {
              const positionMeasurements = groupedMeasurements[position]

              return (
                <div
                  key={position}
                  className="p-4 rounded-lg bg-card border border-border"
                >
                  <h3 className="text-sm font-semibold mb-3 text-primary">
                    Position: {position.toFixed(2)} mm
                  </h3>

                  <div className="space-y-2">
                    {positionMeasurements.map((measurement) => (
                      <div
                        key={measurement.id}
                        className="flex items-start justify-between py-2 border-b border-border/50 last:border-0"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {getTypeName(measurement.type)}
                          </p>
                          {measurement.metadata && (
                            <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                              {measurement.metadata.lumenArea && (
                                <p>
                                  Lumen Area:{' '}
                                  {measurement.metadata.lumenArea.toFixed(2)}{' '}
                                  mm²
                                </p>
                              )}
                              {measurement.metadata.wallArea && (
                                <p>
                                  Wall Area:{' '}
                                  {measurement.metadata.wallArea.toFixed(2)} mm²
                                </p>
                              )}
                              {measurement.metadata.minDiameter && (
                                <p>
                                  Min Diameter:{' '}
                                  {measurement.metadata.minDiameter.toFixed(2)}{' '}
                                  mm
                                </p>
                              )}
                              {measurement.metadata.maxDiameter && (
                                <p>
                                  Max Diameter:{' '}
                                  {measurement.metadata.maxDiameter.toFixed(2)}{' '}
                                  mm
                                </p>
                              )}
                              {measurement.metadata.meanHU !== undefined && (
                                <p>
                                  Mean HU:{' '}
                                  {measurement.metadata.meanHU.toFixed(1)} HU
                                </p>
                              )}
                              {measurement.metadata.stdHU !== undefined && (
                                <p>
                                  Std HU:{' '}
                                  {measurement.metadata.stdHU.toFixed(1)} HU
                                </p>
                              )}
                              {measurement.metadata.stenosisPct !==
                                undefined && (
                                <p>
                                  Stenosis:{' '}
                                  {measurement.metadata.stenosisPct.toFixed(1)}%
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="ml-4 text-right">
                          <p className="text-sm font-semibold text-primary">
                            {formatValue(measurement.value, measurement.unit)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
