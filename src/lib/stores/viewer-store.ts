import { Derived, Store } from '@tanstack/store'

export interface CursorPosition {
  x: number
  y: number
  z: number
}

export interface WindowLevel {
  window: number
  level: number
}

export type ToolMode =
  | 'pan'
  | 'zoom'
  | 'window-level'
  | 'measurement'
  | 'rotate'

export interface ViewerState {
  activeVesselId: string | null
  cursorPosition: CursorPosition
  toolMode: ToolMode
  windowLevel: WindowLevel
}

export const viewerStore = new Store<ViewerState>({
  activeVesselId: null,
  cursorPosition: { x: 0, y: 0, z: 0 },
  toolMode: 'pan',
  windowLevel: { window: 400, level: 40 },
})

export const hasActiveVessel = new Derived({
  fn: () => viewerStore.state.activeVesselId !== null,
  deps: [viewerStore],
})

hasActiveVessel.mount()
