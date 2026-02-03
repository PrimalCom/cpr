import { Derived, Store } from '@tanstack/store'

export interface MeasurementResult {
  id: string
  vesselId: string
  type: 'length' | 'diameter' | 'area' | 'angle'
  value: number
  unit: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface MeasurementState {
  measurements: Array<MeasurementResult>
}

export const measurementStore = new Store<MeasurementState>({
  measurements: [],
})

export const measurementCount = new Derived({
  fn: () => measurementStore.state.measurements.length,
  deps: [measurementStore],
})

measurementCount.mount()
