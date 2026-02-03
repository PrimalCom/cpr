import { beforeEach, describe, expect, it } from 'vitest'
import { hasActiveVessel, viewerStore } from '../viewer-store'

describe('viewer-store', () => {
  beforeEach(() => {
    // Reset store to default state
    viewerStore.setState(() => ({
      activeVesselId: null,
      cursorPosition: { x: 0, y: 0, z: 0 },
      toolMode: 'pan',
      windowLevel: { window: 400, level: 40 },
    }))
  })

  describe('default state', () => {
    it('should have null activeVesselId by default', () => {
      expect(viewerStore.state.activeVesselId).toBeNull()
    })

    it('should have default cursor position at origin', () => {
      expect(viewerStore.state.cursorPosition).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('should have pan as default tool mode', () => {
      expect(viewerStore.state.toolMode).toBe('pan')
    })

    it('should have default window/level values', () => {
      expect(viewerStore.state.windowLevel).toEqual({ window: 400, level: 40 })
    })
  })

  describe('vessel switching', () => {
    it('should update activeVesselId', () => {
      viewerStore.setState((prev) => ({ ...prev, activeVesselId: 'LAD' }))
      expect(viewerStore.state.activeVesselId).toBe('LAD')
    })

    it('should switch between vessels', () => {
      viewerStore.setState((prev) => ({ ...prev, activeVesselId: 'LAD' }))
      expect(viewerStore.state.activeVesselId).toBe('LAD')

      viewerStore.setState((prev) => ({ ...prev, activeVesselId: 'LCX' }))
      expect(viewerStore.state.activeVesselId).toBe('LCX')

      viewerStore.setState((prev) => ({ ...prev, activeVesselId: 'RCA' }))
      expect(viewerStore.state.activeVesselId).toBe('RCA')
    })

    it('should clear vessel selection', () => {
      viewerStore.setState((prev) => ({ ...prev, activeVesselId: 'LAD' }))
      viewerStore.setState((prev) => ({ ...prev, activeVesselId: null }))
      expect(viewerStore.state.activeVesselId).toBeNull()
    })
  })

  describe('tool selection', () => {
    it('should switch to measurement tool', () => {
      viewerStore.setState((prev) => ({ ...prev, toolMode: 'measurement' }))
      expect(viewerStore.state.toolMode).toBe('measurement')
    })

    it('should switch to zoom tool', () => {
      viewerStore.setState((prev) => ({ ...prev, toolMode: 'zoom' }))
      expect(viewerStore.state.toolMode).toBe('zoom')
    })

    it('should switch to window-level tool', () => {
      viewerStore.setState((prev) => ({ ...prev, toolMode: 'window-level' }))
      expect(viewerStore.state.toolMode).toBe('window-level')
    })

    it('should switch to rotate tool', () => {
      viewerStore.setState((prev) => ({ ...prev, toolMode: 'rotate' }))
      expect(viewerStore.state.toolMode).toBe('rotate')
    })
  })

  describe('cursor position', () => {
    it('should update cursor position', () => {
      viewerStore.setState((prev) => ({
        ...prev,
        cursorPosition: { x: 10.5, y: 20.3, z: 30.1 },
      }))
      expect(viewerStore.state.cursorPosition).toEqual({
        x: 10.5,
        y: 20.3,
        z: 30.1,
      })
    })

    it('should handle negative coordinates', () => {
      viewerStore.setState((prev) => ({
        ...prev,
        cursorPosition: { x: -5, y: -10, z: -15 },
      }))
      expect(viewerStore.state.cursorPosition.x).toBe(-5)
      expect(viewerStore.state.cursorPosition.y).toBe(-10)
      expect(viewerStore.state.cursorPosition.z).toBe(-15)
    })
  })

  describe('window/level', () => {
    it('should update window width', () => {
      viewerStore.setState((prev) => ({
        ...prev,
        windowLevel: { ...prev.windowLevel, window: 800 },
      }))
      expect(viewerStore.state.windowLevel.window).toBe(800)
    })

    it('should update window level', () => {
      viewerStore.setState((prev) => ({
        ...prev,
        windowLevel: { ...prev.windowLevel, level: 100 },
      }))
      expect(viewerStore.state.windowLevel.level).toBe(100)
    })

    it('should update both window and level', () => {
      viewerStore.setState((prev) => ({
        ...prev,
        windowLevel: { window: 1500, level: 300 },
      }))
      expect(viewerStore.state.windowLevel).toEqual({
        window: 1500,
        level: 300,
      })
    })
  })

  describe('hasActiveVessel derived state', () => {
    it('should be false when no vessel selected', () => {
      expect(hasActiveVessel.state).toBe(false)
    })

    it('should be true when vessel is selected', () => {
      viewerStore.setState((prev) => ({ ...prev, activeVesselId: 'LAD' }))
      expect(hasActiveVessel.state).toBe(true)
    })
  })
})
