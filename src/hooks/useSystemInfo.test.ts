import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSystemInfo } from './useSystemInfo';
import type { SystemSnapshot } from '../types/electron';

const MOCK_SNAPSHOT: SystemSnapshot = {
  cpu: { usage: 42, temperature: 55 },
  memory: { used: 8_000_000_000, total: 16_000_000_000 },
  gpu: { model: 'RTX 4070', vram: 12288 },
  disk: { read: 1024, write: 512 },
};

function makeApi(snapshot = MOCK_SNAPSHOT) {
  let cb: ((data: SystemSnapshot) => void) | null = null;
  return {
    api: {
      getSystemInfo: vi.fn().mockResolvedValue(snapshot),
      onSystemUpdate: vi.fn((c: (data: SystemSnapshot) => void) => { cb = c; }),
      removeSystemListener: vi.fn(),
      getEventLogs: vi.fn(),
      getSessionId: vi.fn(),
    },
    push: (data: SystemSnapshot) => cb?.(data),
  };
}

describe('useSystemInfo', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it('PWA 환경에서 null 반환', () => {
    const { result } = renderHook(() => useSystemInfo());
    expect(result.current).toBeNull();
  });

  it('Electron 환경에서 초기 스냅샷 수신', async () => {
    const { api } = makeApi();
    Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });

    const { result } = renderHook(() => useSystemInfo());

    await act(async () => {});
    expect(result.current?.cpu.usage).toBe(42);
    expect(result.current?.cpu.temperature).toBe(55);
  });

  it('onSystemUpdate 콜백으로 스냅샷 갱신', async () => {
    const { api, push } = makeApi();
    Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });

    const { result } = renderHook(() => useSystemInfo());
    await act(async () => {});

    const updated: SystemSnapshot = { ...MOCK_SNAPSHOT, cpu: { usage: 88, temperature: 72 } };
    act(() => push(updated));

    expect(result.current?.cpu.usage).toBe(88);
  });

  it('마운트 시 removeSystemListener() 선행 호출 (Strict Mode 이중 등록 방지)', async () => {
    const { api } = makeApi();
    Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });

    renderHook(() => useSystemInfo());
    await act(async () => {});

    expect(api.removeSystemListener).toHaveBeenCalled();
  });

  it('언마운트 시 리스너 정리', async () => {
    const { api } = makeApi();
    Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });

    const { unmount } = renderHook(() => useSystemInfo());
    await act(async () => {});
    unmount();

    // cleanup에서 removeSystemListener 재호출
    expect(api.removeSystemListener).toHaveBeenCalledTimes(2);
  });

  it('CPU 온도 null — 스냅샷에 null 유지', async () => {
    const noTempSnapshot: SystemSnapshot = {
      ...MOCK_SNAPSHOT,
      cpu: { usage: 30, temperature: null },
    };
    const { api } = makeApi(noTempSnapshot);
    Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true });

    const { result } = renderHook(() => useSystemInfo());
    await act(async () => {});

    expect(result.current?.cpu.temperature).toBeNull();
  });
});
