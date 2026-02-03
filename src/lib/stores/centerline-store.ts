import { Derived, Store } from '@tanstack/store'

export interface CenterlinePoint {
  x: number
  y: number
  z: number
  radius: number
}

export interface VesselCenterline {
  vesselId: string
  points: Array<CenterlinePoint>
  length: number
}

export interface CenterlineState {
  centerlines: Map<string, VesselCenterline>
}

export const centerlineStore = new Store<CenterlineState>({
  centerlines: new Map(),
})

export const centerlineCount = new Derived({
  fn: () => centerlineStore.state.centerlines.size,
  deps: [centerlineStore],
})

centerlineCount.mount()
