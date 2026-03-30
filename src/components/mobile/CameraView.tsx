import { useRef, useState, useEffect, useCallback } from 'react';

type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

interface Props {
  onStreamReady?: () => void;
  onStreamStop?: () => void;
}

export default function CameraView({ onStreamReady, onStreamStop }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    onStreamStop?.();
  }, [onStreamStop]);

  // unmount 시 스트림 정리
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
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
          <div className="nd-camera-focus-guide"/>
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
