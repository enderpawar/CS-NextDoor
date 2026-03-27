import { useRef, useState } from 'react';
import { useRuntimeMode } from './hooks/useRuntimeMode';
import './styles/tokens.css';
import './styles/global.css';
import './styles/animations.css';

interface ClipboardImage {
  dataUrl: string;
  file: File;
}

export default function App() {
  const mode = useRuntimeMode();
  const [symptom, setSymptom] = useState('');
  const [clipboardImage, setClipboardImage] = useState<ClipboardImage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Phase 2: 클립보드 이미지 붙여넣기 — Web API paste 이벤트 (IPC 불필요)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setClipboardImage({ dataUrl, file });
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => setClipboardImage(null);

  // Phase 진행에 따라 컴포넌트 교체 예정
  return (
    <div className={`app-root mode-${mode}`}>
      <header className="top-app-bar">
        <span className="text-h2">옆집 컴공생</span>
        <span className="badge text-badge">
          {mode === 'electron' ? 'DESKTOP' : mode === 'pwa-session' ? 'MOBILE' : 'STANDALONE'}
        </span>
      </header>

      <main className="app-content">
        {mode === 'pwa-standalone' && (
          <div className="badge-warning" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
            ⚠️ SW 데이터 없이 분석 — 정확도가 제한될 수 있어요
          </div>
        )}

        <section className="symptom-section">
          <label className="text-label" htmlFor="symptom-input">증상 입력</label>
          <textarea
            id="symptom-input"
            ref={textareaRef}
            className="symptom-textarea"
            placeholder="PC 증상을 입력하세요... (Ctrl+V로 스크린샷 첨부 가능)"
            value={symptom}
            onChange={e => setSymptom(e.target.value)}
            onPaste={handlePaste}
            rows={4}
          />

          {/* 클립보드 이미지 썸네일 미리보기 */}
          {clipboardImage && (
            <div className="clipboard-preview">
              <img
                src={clipboardImage.dataUrl}
                alt="첨부 이미지"
                className="clipboard-thumbnail"
              />
              <button
                type="button"
                className="clipboard-remove"
                onClick={clearImage}
                aria-label="이미지 제거"
              >
                ✕
              </button>
            </div>
          )}
        </section>

        {/* Phase 3~: SystemDashboard, HypothesisTracker 등 조건부 렌더링 */}
        {mode === 'electron' && (
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            시스템 정보를 수집 중이에요...
          </p>
        )}
      </main>
    </div>
  );
}
