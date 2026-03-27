import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFpsMonitor } from './useFpsMonitor';

// rAF을 시간 기반 틱으로 대체
let rafCallbacks: ((time: number) => void)[] = [];
let currentTime = 0;

beforeEach(() => {
  rafCallbacks = [];
  currentTime = 0;

  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });

  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {
    rafCallbacks = [];
  });

  vi.spyOn(globalThis.performance, 'now').mockImplementation(() => currentTime);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function tickFrames(count: number, msPerFrame = 16) {
  for (let i = 0; i < count; i++) {
    currentTime += msPerFrame;
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    cbs.forEach(cb => cb(currentTime));
  }
}

describe('useFpsMonitor', () => {
  it('초기 상태 — fps null, drops 빈 배열', () => {
    const { result } = renderHook(() => useFpsMonitor());
    expect(result.current.fps).toBeNull();
    expect(result.current.drops).toHaveLength(0);
  });

  it('start() 후 1초 경과 시 fps 계산', () => {
    const { result } = renderHook(() => useFpsMonitor());

    act(() => result.current.start());
    // 1초(1000ms) 동안 ~60프레임 tick
    act(() => tickFrames(63, 16)); // 63 * 16 = 1008ms > 1000ms

    expect(result.current.fps).not.toBeNull();
    expect(result.current.fps!).toBeGreaterThan(0);
  });

  it('stop() 호출 시 rAF 취소', () => {
    const { result } = renderHook(() => useFpsMonitor());

    act(() => result.current.start());
    act(() => result.current.stop());

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('reset() 호출 시 drops 초기화', () => {
    const { result } = renderHook(() => useFpsMonitor());

    act(() => result.current.start());
    // 6초 분량 tick → 히스토리 쌓음
    for (let sec = 0; sec < 6; sec++) {
      act(() => tickFrames(63, 16));
    }

    act(() => result.current.reset());
    expect(result.current.drops).toHaveLength(0);
  });

  it('언마운트 시 rAF 자동 정리', () => {
    const { result, unmount } = renderHook(() => useFpsMonitor());

    act(() => result.current.start());
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('베이스라인 대비 20% 미만 드랍은 drops에 추가 안 됨', () => {
    const { result } = renderHook(() => useFpsMonitor());

    act(() => result.current.start());
    // 균일한 60fps 유지 (드랍 없음)
    for (let sec = 0; sec < 7; sec++) {
      act(() => tickFrames(63, 16));
    }

    expect(result.current.drops).toHaveLength(0);
  });

  it('베이스라인 대비 20% 초과 드랍은 drops에 기록', () => {
    const { result } = renderHook(() => useFpsMonitor());

    act(() => result.current.start());
    // 5초 동안 60fps 베이스라인 수립
    for (let sec = 0; sec < 5; sec++) {
      act(() => tickFrames(63, 16));
    }
    // 급격한 드랍: 1초 동안 10fps (100ms/frame)
    act(() => tickFrames(10, 100));

    expect(result.current.drops.length).toBeGreaterThan(0);
    expect(result.current.drops[0]!.dropPercent).toBeGreaterThan(20);
  });
});
