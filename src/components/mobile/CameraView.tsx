import { useRef, useState, useEffect, useCallback } from 'react';
import { useOpenCV } from '../../hooks/useOpenCV';
import type { FrameAnalysis, Guidance } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const cv: any;

type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

interface Props {
  onStreamReady?: () => void;
  onStreamStop?: () => void;
}

export default function CameraView({ onStreamReady, onStreamStop }: Props) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const rafRef        = useRef<number | null>(null);
  const readyCountRef = useRef(0);

  const [cameraState, setCameraState]   = useState<CameraState>('idle');
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [guidance, setGuidance]         = useState<Guidance | null>(null);
  const [guidanceText, setGuidanceText] = useState('');

  const cvReady = useOpenCV();

  const startCamera = useCallback(async () => {
    setCameraState('requesting');
    setErrorMsg(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      const isHttp = location.protocol === 'http:' && location.hostname !== 'localhost';
      setCameraState('error');
      setErrorMsg(
        isHttp
          ? 'HTTPS가 필요해요. 주소창에서 http:// 대신 https://로 접속해주세요.'
          : '이 브라우저는 카메라 접근을 지원하지 않아요.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('active');
      onStreamReady?.();
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraState('denied');
      } else {
        setCameraState('error');
        setErrorMsg(err.message);
      }
    }
  }, [onStreamReady]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
    setGuidance(null);
    onStreamStop?.();
  }, [onStreamStop]);

  // OpenCV rAF 루프 — cameraState=active && cvReady 조건에서만 실행
  useEffect(() => {
    if (cameraState !== 'active' || !cvReady) return;

    readyCountRef.current = 0;

    const tick = () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        if (canvas.width !== video.videoWidth)   canvas.width  = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        try {
          const result = processFrame(video, canvas, readyCountRef.current);
          setGuidance(result.guidance);
          setGuidanceText(result.guidanceText);
          if (result.guidance === 'ready') readyCountRef.current++;
          else readyCountRef.current = 0;
        } catch {
          // OpenCV 오류는 무시 — 가이드 없이 스트림 유지
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraState, cvReady]);

  // unmount 시 스트림 정리
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="nd-camera-view">
      {/* video는 항상 DOM에 유지 — ref가 startCamera 시점에 반드시 존재해야 함 */}
      <div className="nd-camera-stream-wrap" style={{ display: cameraState === 'active' ? undefined : 'none' }}>
        <video
          ref={videoRef}
          className="nd-camera-stream"
          autoPlay
          playsInline
          muted
        />
        <div className="nd-camera-stream-overlay">
          <canvas ref={canvasRef} className="nd-camera-cv-canvas" />
          <div className="nd-camera-focus-guide"/>
          {guidance && (
            <div className={`nd-camera-guidance nd-camera-guidance--${guidance}`}>
              {guidanceText}
            </div>
          )}
          <button className="nd-camera-stop-btn" onClick={stopCamera}>
            종료
          </button>
        </div>
      </div>

      {cameraState === 'idle' && (
        <div className="nd-camera-placeholder">
          <div className="nd-camera-icon-wrap">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <p className="nd-camera-hint-title">PC 내부를 촬영해서 하드웨어 상태를 분석해요</p>
          <p className="nd-camera-hint">메인보드, 커패시터, RAM 슬롯 등을 가까이 비춰주세요.</p>
          <button className="nd-camera-start-btn" onClick={startCamera}>
            카메라 시작하기
          </button>
        </div>
      )}

      {cameraState === 'requesting' && (
        <div className="nd-camera-placeholder">
          <div className="nd-camera-loading-dots">
            <span/><span/><span/>
          </div>
          <p className="nd-camera-hint">카메라 권한을 요청 중이에요…</p>
        </div>
      )}

      {cameraState === 'denied' && (
        <div className="nd-camera-placeholder nd-camera-denied">
          <div className="nd-camera-status-icon denied">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <p className="nd-camera-hint-title">카메라 접근이 거부됐어요</p>
          <p className="nd-camera-hint">브라우저 주소창 옆 자물쇠 아이콘 → 카메라 권한을 허용 후 새로고침해주세요.</p>
          <button className="nd-camera-retry-btn" onClick={startCamera}>
            다시 시도
          </button>
        </div>
      )}

      {cameraState === 'error' && (
        <div className="nd-camera-placeholder nd-camera-error-state">
          <div className="nd-camera-status-icon error">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <p className="nd-camera-hint-title">카메라를 열 수 없어요</p>
          {errorMsg && <p className="nd-camera-error-detail">{errorMsg}</p>}
          <button className="nd-camera-retry-btn" onClick={startCamera}>
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

// ── OpenCV 프레임 분석 (VideoAnalysis에서 import하여 재사용) ──────────────────

const BLUR_THRESHOLD      = 100;
const COVERAGE_MIN        = 0.05;
const READY_FRAMES_NEEDED = 3;

export function processFrame(
  videoEl: HTMLVideoElement,
  canvasEl: HTMLCanvasElement,
  readyCount: number,
): FrameAnalysis {
  const ctx = canvasEl.getContext('2d')!;
  ctx.drawImage(videoEl, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
  const frameArea = canvasEl.width * canvasEl.height;

  const src       = cv.matFromImageData(imageData);
  const gray      = new cv.Mat();
  const blurred   = new cv.Mat();
  const edges     = new cv.Mat();
  const contours  = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const lap       = new cv.Mat();
  const mean      = new cv.Mat();
  const stddev    = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // CLAHE 명암 개선
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    clahe.apply(gray, gray);
    clahe.delete();

    // Laplacian으로 선명도 평가
    cv.Laplacian(gray, lap, cv.CV_32F);
    cv.meanStdDev(lap, mean, stddev);
    const blurScore = stddev.doubleAt(0, 0) ** 2;

    if (blurScore < BLUR_THRESHOLD) {
      return { guidance: 'stabilize', guidanceText: '카메라를 고정해 주세요',
               qualityScore: 0, blurScore, coverageRatio: 0, isReadyToCapture: false };
    }

    // Canny + 컨투어로 대상 감지
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() === 0) {
      return { guidance: 'no_target', guidanceText: 'PC 내부를 향해주세요',
               qualityScore: 0, blurScore, coverageRatio: 0, isReadyToCapture: false };
    }

    let maxArea = 0;
    let maxIdx  = 0;
    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > maxArea) { maxArea = area; maxIdx = i; }
    }
    const coverageRatio = maxArea / frameArea;

    if (coverageRatio < COVERAGE_MIN) {
      return { guidance: 'too_far', guidanceText: '더 가까이 찍어주세요',
               qualityScore: 0, blurScore, coverageRatio, isReadyToCapture: false };
    }

    // 품질 점수 계산 + 컨투어 박스 그리기
    const sharpScore    = Math.min(blurScore / 500, 1.0);
    const coverageScore = Math.min(coverageRatio / 0.3, 1.0);
    const qualityScore  = Math.round((sharpScore * 0.5 + coverageScore * 0.5) * 100);

    for (let i = 0; i < contours.size(); i++) {
      const rect = cv.boundingRect(contours.get(i));
      if (rect.width < 60 || rect.height < 60) continue;
      ctx.strokeStyle = i === maxIdx ? '#3182f6' : '#05c46b';
      ctx.lineWidth   = i === maxIdx ? 3 : 1;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }

    const isReadyToCapture = readyCount + 1 >= READY_FRAMES_NEEDED;
    return { guidance: 'ready', guidanceText: '좋아요!',
             qualityScore, blurScore, coverageRatio, isReadyToCapture };

  } finally {
    // WASM 힙 메모리 반드시 해제 — JS GC는 WASM 힙 미회수
    [src, gray, blurred, edges, contours, hierarchy, lap, mean, stddev].forEach(m => m.delete());
  }
}
