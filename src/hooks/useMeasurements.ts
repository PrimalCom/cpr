import { useCallback, useState } from 'react'

/**
 * Measurement data structure
 */
export interface Measurement {
  id: number
  centerlineId: number
  position: number
  type: string
  value: number
  unit: string | null
  metadata: {
    lumenArea?: number
    wallArea?: number
    minDiameter?: number
    maxDiameter?: number
    meanHU?: number
    stdHU?: number
    minHU?: number
    maxHU?: number
    plaqueVolume?: number
    stenosisPct?: number
  } | null
  createdAt: Date
}

/**
 * Create measurement payload
 */
export interface CreateMeasurementPayload {
  centerlineId: number
  position: number
  type: string
  value: number
  unit: string
  metadata?: {
    lumenArea?: number
    wallArea?: number
    minDiameter?: number
    maxDiameter?: number
    meanHU?: number
    stdHU?: number
    minHU?: number
    maxHU?: number
    plaqueVolume?: number
    stenosisPct?: number
  }
}

/**
 * Update measurement payload
 */
export interface UpdateMeasurementPayload {
  id: number
  centerlineId?: number
  position?: number
  type?: string
  value?: number
  unit?: string
  metadata?: {
    lumenArea?: number
    wallArea?: number
    minDiameter?: number
    maxDiameter?: number
    meanHU?: number
    stdHU?: number
    minHU?: number
    maxHU?: number
    plaqueVolume?: number
    stenosisPct?: number
  }
}

/**
 * Hook for managing measurements
 *
 * Provides functions to fetch, create, update, and delete measurements
 * for a given centerline.
 */
export function useMeasurements() {
  const [measurements, setMeasurements] = useState<Array<Measurement>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch measurements for a centerline
   */
  const fetchMeasurements = useCallback(async (centerlineId: number) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/imaging/measurements?centerlineId=${centerlineId}`,
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to fetch measurements')
      }

      const data = await response.json()
      setMeasurements(data)
      return data
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch measurements'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Create a new measurement
   */
  const createMeasurement = useCallback(
    async (payload: CreateMeasurementPayload) => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/imaging/measurements', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to create measurement')
        }

        const newMeasurement = await response.json()

        // Update local state
        setMeasurements((prev) => [...prev, newMeasurement])

        return newMeasurement
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to create measurement'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  /**
   * Update an existing measurement
   */
  const updateMeasurement = useCallback(
    async (payload: UpdateMeasurementPayload) => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/imaging/measurements', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to update measurement')
        }

        const updatedMeasurement = await response.json()

        // Update local state
        setMeasurements((prev) =>
          prev.map((m) => (m.id === payload.id ? updatedMeasurement : m)),
        )

        return updatedMeasurement
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to update measurement'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  /**
   * Delete a measurement
   */
  const deleteMeasurement = useCallback(async (id: number) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/imaging/measurements?id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete measurement')
      }

      // Update local state
      setMeasurements((prev) => prev.filter((m) => m.id !== id))

      return true
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete measurement'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Clear all measurements from local state
   */
  const clearMeasurements = useCallback(() => {
    setMeasurements([])
    setError(null)
  }, [])

  return {
    measurements,
    loading,
    error,
    fetchMeasurements,
    createMeasurement,
    updateMeasurement,
    deleteMeasurement,
    clearMeasurements,
  }
}
