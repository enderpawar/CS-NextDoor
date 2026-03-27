import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRuntimeMode } from './useRuntimeMode';

describe('useRuntimeMode', () => {
  beforeEach(() => {
    // window.electronAPI 초기화
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it('electronAPI 존재 시 electron 반환', () => {
    Object.defineProperty(window, 'electronAPI', {
      value: { getSystemInfo: vi.fn() },
      writable: true,
      configurable: true,
    });

    expect(useRuntimeMode()).toBe('electron');
  });

  it('?session= 파라미터 있으면 pwa-session 반환', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?session=abc-123' },
      writable: true,
      configurable: true,
    });

    expect(useRuntimeMode()).toBe('pwa-session');
  });

  it('파라미터 없으면 pwa-standalone 반환', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });

    expect(useRuntimeMode()).toBe('pwa-standalone');
  });

  it('electronAPI가 있으면 URL 파라미터와 무관하게 electron 반환', () => {
    Object.defineProperty(window, 'electronAPI', {
      value: { getSystemInfo: vi.fn() },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'location', {
      value: { search: '?session=xyz' },
      writable: true,
      configurable: true,
    });

    expect(useRuntimeMode()).toBe('electron');
  });
});
