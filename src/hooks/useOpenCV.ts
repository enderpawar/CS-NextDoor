import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const cv: any;

// CDN URL 사용 이유:
//   로컬 /opencv.js는 구 Service Worker 캐시에 HTML(SPA 폴백)로 오염될 수 있음.
//   cross-origin CDN 요청은 SW 캐시에 hit하지 않으므로 항상 실제 파일을 받음.
const OPENCV_CDN =
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';

export function useOpenCV(): boolean {
  const [ready, setReady] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 이미 로드+초기화된 경우 즉시 반환
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof cv !== 'undefined' && (cv as any).Mat) { setReady(true); return; }

    const markReady = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setReady(true);
    };

    const script = document.createElement('script');
    script.src = OPENCV_CDN;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cvGlobal = (window as any).cv;
      if (!cvGlobal) return; // 스크립트가 window.cv를 세팅하지 않은 경우

      // WASM이 이미 초기화된 경우 (race condition 방어)
      if (cvGlobal.Mat) { markReady(); return; }

      // 아직 초기화 중 → 콜백 등록
      cvGlobal['onRuntimeInitialized'] = markReady;

      // 폴링 폴백: onRuntimeInitialized가 이미 호출됐거나 지원 안 할 경우 대비
      pollRef.current = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof cv !== 'undefined' && (cv as any).Mat) markReady();
      }, 200);
    };
    document.body.appendChild(script);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return ready;
}
