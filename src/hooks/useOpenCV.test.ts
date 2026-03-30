import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOpenCV } from './useOpenCV';

// JSDOM에서는 실제 WASM 로딩이 불가하므로 스크립트 주입 + 콜백 경로를 모킹으로 검증
describe('useOpenCV', () => {
  let appendedScript: HTMLScriptElement | null = null;
  const originalAppendChild = document.body.appendChild.bind(document.body);

  beforeEach(() => {
    appendedScript = null;
    // document.body.appendChild를 가로채 스크립트 요소를 캡처
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) {
        appendedScript = node;
        return node;
      }
      return originalAppendChild(node);
    });
    // window.cv가 없는 초기 상태 보장
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).cv;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).cv;
  });

  it('초기 상태는 false를 반환한다', () => {
    const { result } = renderHook(() => useOpenCV());
    expect(result.current).toBe(false);
  });

  it('/opencv.js 스크립트를 DOM에 추가한다', () => {
    renderHook(() => useOpenCV());
    expect(appendedScript).not.toBeNull();
    expect(appendedScript?.src).toContain('/opencv.js');
    expect(appendedScript?.async).toBe(true);
  });

  it('onload → cv.onRuntimeInitialized 콜백 실행 시 true를 반환한다', async () => {
    const { result } = renderHook(() => useOpenCV());
    expect(result.current).toBe(false);

    // cv 전역 stub 설정 (window.cv = {} with onRuntimeInitialized setter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).cv = {};

    // script.onload 트리거 → cv.onRuntimeInitialized 세팅
    await act(async () => {
      appendedScript?.dispatchEvent(new Event('load'));
    });

    // onRuntimeInitialized 콜백이 등록됐는지 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = (window as any).cv?.onRuntimeInitialized;
    expect(typeof cb).toBe('function');

    // 콜백 실행 → ready = true
    await act(async () => {
      cb();
    });

    expect(result.current).toBe(true);
  });

  it('cv.Mat이 이미 존재하면 스크립트를 추가하지 않고 즉시 true를 반환한다', async () => {
    // cv가 이미 로드된 상태 시뮬레이션
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).cv = { Mat: vi.fn() };

    const { result } = renderHook(() => useOpenCV());

    // 스크립트 추가 없이 바로 true
    expect(appendedScript).toBeNull();
    expect(result.current).toBe(true);
  });
});
