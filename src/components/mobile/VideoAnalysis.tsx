import { useRef, useState, useCallback, useEffect } from 'react';
import { processFrame } from './CameraView';
import { useOpenCV } from '../../hooks/useOpenCV';
import type { ScoreSummary } from '../../types';

const CAPTURE_TOTAL = 15;
const SEND_TOP      = 5;
const INTERVAL_MS   = 1000;

interface FrameCandidate {
  dataUrl: string;
  qualityScore: number;
  blurScore: number;
}

interface Props {
  onFramesReady: (
    frames: string[],
    audioBlob: Blob,
    mimeType: string,
    scoreSummary: ScoreSummary,
  ) => void;
}

export default function VideoAnalysis({ onFramesReady }: Props) {
  const videoRef         = useRef<HTMLVideoElement>(null);
  // off-screen canvas — DOM에 마운트하지 않음
  const canvasRef        = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const candidatesRef    = useRef<FrameCandidate[]>([]);
  const blurCountRef     = useRef(0);
  const readyCountRef    = useRef(0);
  const streamRef        = useRef<MediaStream | null>(null);

  const cvReady = useOpenCV();

  const [recording, setRecording]       = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [blurCount, setBlurCount]       = useState(0);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);

  const stopRecording = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    audioRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
  }, []);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const captureAndScore = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2) return;

    if (canvas.width !== video.videoWidth)   canvas.width  = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;

    try {
      const result = processFrame(video, canvas, readyCountRef.current);

      if (result.guidance === 'stabilize') {
        blurCountRef.current += 1;
        setBlurCount(blurCountRef.current);
      } else {
        if (result.isReadyToCapture) readyCountRef.current = 0;
        else readyCountRef.current = result.guidance === 'ready' ? readyCountRef.current + 1 : 0;

        candidatesRef.current.push({
          dataUrl: canvas.toDataURL('image/jpeg', 0.7),
          qualityScore: result.qualityScore,
          blurScore: result.blurScore,
        });
        setCaptureCount(c => c + 1);
      }
    } catch {
      // OpenCV 오류 시 해당 프레임 skip
    }

    if (candidatesRef.current.length + blurCountRef.current >= CAPTURE_TOTAL) {
      stopRecording();
    }
  }, [stopRecording]);

  const start = async () => {
    setErrorMsg(null);
    candidatesRef.current  = [];
    audioChunksRef.current = [];
    blurCountRef.current   = 0;
    readyCountRef.current  = 0;
    setCaptureCount(0);
    setBlurCount(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRecording(true);
      intervalRef.current = setInterval(captureAndScore, INTERVAL_MS);

      // iOS: audio/webm 미지원 → audio/mp4 폴백
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const audioRecorder = new MediaRecorder(stream, { mimeType });
      audioRecorder.ondataavailable = e => audioChunksRef.current.push(e.data);
      audioRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const sorted    = [...candidatesRef.current].sort((a, b) => b.qualityScore - a.qualityScore);
        const selected  = sorted.slice(0, SEND_TOP);
        const scores    = candidatesRef.current.map(f => f.qualityScore);
        const scoreSummary: ScoreSummary = {
          total:          candidatesRef.current.length,
          sent:           selected.length,
          blurDiscarded:  blurCountRef.current,
          max:            scores.length ? Math.max(...scores) : 0,
          avg:            scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
          frameScores:    sorted.map(f => ({
            score: f.qualityScore.toFixed(1),
            blur:  f.blurScore.toFixed(0),
          })),
        };
        // base64 부분만 추출 (data:image/jpeg;base64, 제거)
        const frames = selected.map(f =>
          f.dataUrl.includes(',') ? f.dataUrl.split(',')[1] : f.dataUrl
        );
        onFramesReady(frames, audioBlob, mimeType, scoreSummary);
      };
      audioRecorder.start();
      audioRecorderRef.current = audioRecorder;
    } catch (e) {
      const err = e as Error;
      setErrorMsg(err.name === 'NotAllowedError'
        ? '카메라/마이크 권한이 필요해요. 브라우저 설정에서 허용해주세요.'
        : err.message
      );
    }
  };

  const totalProcessed = captureCount + blurCount;
  const progress = Math.round((totalProcessed / CAPTURE_TOTAL) * 100);

  return (
    <div className="nd-video-analysis">
      <video ref={videoRef} autoPlay muted playsInline className="nd-camera-stream" />

      {recording && (
        <div className="nd-video-analysis-progress">
          <div className="nd-video-analysis-stats">
            <span className="nd-video-stat">선명 프레임 {captureCount}개</span>
            <span className="nd-video-stat nd-video-stat--blur">흔들림 제외 {blurCount}개</span>
            <span className="nd-video-stat">{progress}%</span>
          </div>
          <div className="nd-video-progress-bar">
            <div className="nd-video-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="nd-camera-hint" style={{ marginTop: 8 }}>
            OpenCV 채점 중 — 이상도 상위 {SEND_TOP}개 프레임을 AI로 전송합니다
          </p>
        </div>
      )}

      {errorMsg && (
        <div className="nd-pwa-error-banner" style={{ margin: '8px 0' }}>
          {errorMsg}
        </div>
      )}

      {!recording ? (
        <div className="nd-camera-placeholder" style={{ minHeight: 160 }}>
          {!cvReady ? (
            <>
              <div className="nd-camera-loading-dots"><span/><span/><span/></div>
              <p className="nd-camera-hint">OpenCV 로딩 중… 잠시만 기다려주세요</p>
            </>
          ) : (
            <>
              <div className="nd-camera-icon-wrap">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10 8 16 12 10 16 10 8"/>
                </svg>
              </div>
              <p className="nd-camera-hint-title">영상+오디오 촬영 시작</p>
              <p className="nd-camera-hint">
                {CAPTURE_TOTAL}초간 자동 촬영 후 품질 상위 {SEND_TOP}개 프레임을 AI로 전송해요.
                비프음도 함께 녹음됩니다.
              </p>
              <button className="nd-camera-start-btn" onClick={start}>
                촬영 시작
              </button>
            </>
          )}
        </div>
      ) : (
        <button className="nd-camera-stop-btn-inline" onClick={stopRecording}>
          ⏹ 촬영 종료 + 분석
        </button>
      )}
    </div>
  );
}
