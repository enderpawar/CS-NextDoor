import { useRef, useState, useCallback } from 'react';
import { useOpenCV } from '../../hooks/useOpenCV';
import type { ScoreSummary } from '../../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const cv: any;

const SEND_TOP      = 5;
const MAX_IMG_BYTES = 5  * 1024 * 1024;  // 5 MB
const MAX_VID_BYTES = 50 * 1024 * 1024;  // 50 MB
const MAX_DIM       = 1280;
const BLUR_THRESHOLD = 100;

interface FrameCandidate {
  dataUrl:      string;
  qualityScore: number;
  blurScore:    number;
}

interface Props {
  onFramesReady: (
    frames:       string[],
    audioBlob:    Blob,
    mimeType:     string,
    scoreSummary: ScoreSummary,
  ) => void;
}

// canvas를 MAX_DIM 이내로 축소. 이미 작으면 원본 반환
function resizeIfNeeded(src: HTMLCanvasElement): HTMLCanvasElement {
  const ratio = Math.min(MAX_DIM / src.width, MAX_DIM / src.height, 1);
  if (ratio >= 1) return src;
  const dst = document.createElement('canvas');
  dst.width  = Math.round(src.width  * ratio);
  dst.height = Math.round(src.height * ratio);
  dst.getContext('2d')!.drawImage(src, 0, 0, dst.width, dst.height);
  return dst;
}

// OpenCV Laplacian blur + Canny coverage 품질 점수 계산
// cvReady=false 시 기본 점수 반환 (OpenCV 없이도 동작)
function scoreCanvas(
  canvas:  HTMLCanvasElement,
  cvReady: boolean,
): { qualityScore: number; blurScore: number; skip: boolean } {
  if (!cvReady) return { qualityScore: 1, blurScore: 999, skip: false };

  const ctx = canvas.getContext('2d');
  if (!ctx) return { qualityScore: 1, blurScore: 999, skip: false };

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src       = cv.matFromImageData(imageData);
  const gray      = new cv.Mat();
  const lap       = new cv.Mat();
  const mean      = new cv.Mat();
  const stddev    = new cv.Mat();
  const edges     = new cv.Mat();
  const contours  = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, stddev);
    const blurScore = stddev.data64F[0] ** 2;

    if (blurScore < BLUR_THRESHOLD) {
      return { qualityScore: 0, blurScore, skip: true };
    }

    cv.Canny(gray, edges, 50, 150);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const area = canvas.width * canvas.height;
    let coveredArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const rect = cv.boundingRect(contours.get(i));
      coveredArea += rect.width * rect.height;
    }
    const coverageRatio = Math.min(coveredArea / area, 1);
    const qualityScore  = blurScore * 0.4 + coverageRatio * 100 * 0.6;

    return { qualityScore, blurScore, skip: false };
  } finally {
    [src, gray, lap, mean, stddev, edges, contours, hierarchy].forEach(m => {
      try { m.delete(); } catch { /* already deleted */ }
    });
  }
}

// 단일 이미지 파일 → FrameCandidate | null (blur 제외 시 null)
function processImageFile(
  file:    File,
  cvReady: boolean,
): Promise<FrameCandidate | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width  = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        const resized = resizeIfNeeded(c);
        try {
          const { qualityScore, blurScore, skip } = scoreCanvas(resized, cvReady);
          if (skip) { resolve(null); return; }
          resolve({ dataUrl: resized.toDataURL('image/jpeg', 0.7), qualityScore, blurScore });
        } catch {
          // OpenCV 오류 시 기본 점수로 포함
          resolve({ dataUrl: resized.toDataURL('image/jpeg', 0.7), qualityScore: 1, blurScore: 999 });
        }
      };
      img.onerror = () => resolve(null);
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// 영상 파일 → FrameCandidate[] (최대 15프레임 seek)
function processVideoFile(
  file:    File,
  cvReady: boolean,
): Promise<{ candidates: FrameCandidate[]; blurDiscarded: number }> {
  return new Promise(resolve => {
    const url   = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted   = true;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const duration  = Math.min(video.duration, 15);
      const interval  = Math.max(duration / 15, 1);
      const seekTimes: number[] = [];
      for (let t = 0; t < duration; t += interval) seekTimes.push(t);

      const candidates: FrameCandidate[] = [];
      let blurDiscarded = 0;
      let idx = 0;

      const seekNext = () => {
        if (idx >= seekTimes.length) {
          URL.revokeObjectURL(url);
          resolve({ candidates, blurDiscarded });
          return;
        }
        video.currentTime = seekTimes[idx++];
      };

      video.onseeked = () => {
        if (!video.videoWidth || !video.videoHeight) { seekNext(); return; }
        const c = document.createElement('canvas');
        c.width  = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d')!.drawImage(video, 0, 0);
        const resized = resizeIfNeeded(c);
        try {
          const { qualityScore, blurScore, skip } = scoreCanvas(resized, cvReady);
          if (skip) {
            blurDiscarded++;
          } else {
            candidates.push({ dataUrl: resized.toDataURL('image/jpeg', 0.7), qualityScore, blurScore });
          }
        } catch {
          candidates.push({ dataUrl: resized.toDataURL('image/jpeg', 0.7), qualityScore: 1, blurScore: 999 });
        }
        seekNext();
      };

      video.onerror = () => { URL.revokeObjectURL(url); resolve({ candidates: [], blurDiscarded: 0 }); };
      seekNext();
    };

    video.onerror = () => { URL.revokeObjectURL(url); resolve({ candidates: [], blurDiscarded: 0 }); };
    video.src = url;
  });
}

export default function GalleryUpload({ onFramesReady }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cvReady      = useOpenCV();

  const [processing,  setProcessing]  = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);
  const [fileNames,   setFileNames]   = useState<string[]>([]);

  const handleFiles = useCallback(async (files: FileList) => {
    setErrorMsg(null);
    setProcessing(true);
    setProgress(0);

    const allCandidates: FrameCandidate[] = [];
    let totalBlurDiscarded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(Math.round((i / files.length) * 90));

      if (file.type.startsWith('image/')) {
        if (file.size > MAX_IMG_BYTES) {
          setErrorMsg(`"${file.name}"이 5MB를 초과해요. 더 작은 이미지를 선택해주세요.`);
          setProcessing(false);
          return;
        }
        const result = await processImageFile(file, cvReady);
        if (result) allCandidates.push(result);
        else totalBlurDiscarded++;

      } else if (file.type.startsWith('video/')) {
        if (file.size > MAX_VID_BYTES) {
          setErrorMsg(`"${file.name}"이 50MB를 초과해요. 더 짧은 영상을 선택해주세요.`);
          setProcessing(false);
          return;
        }
        const { candidates, blurDiscarded } = await processVideoFile(file, cvReady);
        allCandidates.push(...candidates);
        totalBlurDiscarded += blurDiscarded;
      }
    }

    setProgress(100);

    if (allCandidates.length === 0) {
      setErrorMsg('분석 가능한 프레임이 없어요. 더 선명한 이미지/영상을 업로드해주세요.');
      setProcessing(false);
      return;
    }

    const sorted   = [...allCandidates].sort((a, b) => b.qualityScore - a.qualityScore);
    const selected = sorted.slice(0, SEND_TOP);
    const scores   = allCandidates.map(f => f.qualityScore);

    const scoreSummary: ScoreSummary = {
      total:         allCandidates.length,
      sent:          selected.length,
      blurDiscarded: totalBlurDiscarded,
      max:           scores.length ? Math.max(...scores) : 0,
      avg:           scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      frameScores:   sorted.map(f => ({
        score: f.qualityScore.toFixed(1),
        blur:  f.blurScore.toFixed(0),
      })),
    };

    const frames    = selected.map(f => f.dataUrl.includes(',') ? f.dataUrl.split(',')[1] : f.dataUrl);
    const dummyBlob = new Blob([], { type: 'image/jpeg' });

    onFramesReady(frames, dummyBlob, 'image/jpeg', scoreSummary);
    setProcessing(false);
  }, [cvReady, onFramesReady]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setFileNames(Array.from(files).map(f => f.name));
    handleFiles(files);
    // 동일 파일 재선택 허용
    e.target.value = '';
  };

  return (
    <div className="nd-gallery-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="nd-gallery-input-hidden"
        onChange={handleChange}
      />

      {!processing ? (
        <div className="nd-gallery-dropzone" onClick={() => fileInputRef.current?.click()}>
          <div className="nd-gallery-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>

          {fileNames.length > 0 ? (
            <p className="nd-gallery-filenames">
              {fileNames.length === 1
                ? fileNames[0]
                : `${fileNames[0]} 외 ${fileNames.length - 1}개`}
            </p>
          ) : (
            <>
              <p className="nd-camera-hint-title">갤러리에서 선택</p>
              <p className="nd-camera-hint">
                PC 내부 사진 또는 영상을 업로드하세요.<br />
                이미지 최대 5MB · 영상 최대 50MB
              </p>
            </>
          )}

          {errorMsg && (
            <div className="nd-pwa-error-banner" style={{ marginTop: 12 }}>
              {errorMsg}
            </div>
          )}

          <button
            className="nd-camera-start-btn"
            onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
          >
            파일 선택
          </button>
        </div>
      ) : (
        <div className="nd-gallery-processing">
          <div className="nd-video-analysis-stats">
            <span className="nd-video-stat">
              {cvReady ? 'OpenCV 품질 채점 중' : '이미지 처리 중'}
            </span>
            <span className="nd-video-stat">{progress}%</span>
          </div>
          <div className="nd-video-progress-bar">
            <div className="nd-video-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="nd-camera-hint" style={{ marginTop: 8 }}>
            상위 {SEND_TOP}개 프레임을 선별해 AI로 전송합니다
          </p>
        </div>
      )}
    </div>
  );
}
