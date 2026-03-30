interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ShootingGuide({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="nd-shooting-guide-overlay" onClick={onClose}>
      <div className="nd-shooting-guide" onClick={e => e.stopPropagation()}>
        <div className="nd-shooting-guide-header">
          <h2 className="nd-shooting-guide-title">촬영 가이드</h2>
          <button className="nd-shooting-guide-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {/* 거리 + 플래시 팁 */}
        <div className="nd-shooting-guide-tips">
          <div className="nd-shooting-tip">
            <div style={{ fontSize: 20, marginBottom: 4 }}>📏</div>
            <div>거리</div>
            <strong>20~30cm</strong>
          </div>
          <div className="nd-shooting-tip nd-shooting-tip--flash">
            <div style={{ fontSize: 20, marginBottom: 4 }}>🔦</div>
            <div>플래시</div>
            <strong>ON 권장</strong>
          </div>
        </div>

        {/* PC 내부 다이어그램 — 절대 위치 레이블 오버레이 */}
        <div className="nd-shooting-guide-diagram">
          <img
            src="/pc-diagram.png"
            alt="PC 내부 메인보드 다이어그램"
            className="nd-shooting-guide-diagram-img"
          />
          <div className="nd-diagram-label nd-diagram-label--mainboard">메인보드</div>
          <div className="nd-diagram-label nd-diagram-label--cap">커패시터</div>
          <div className="nd-diagram-label nd-diagram-label--ram">RAM</div>
          <div className="nd-diagram-label nd-diagram-label--gpu">GPU</div>
          <div className="nd-diagram-label nd-diagram-label--pwr">전원부</div>
        </div>

        {/* 촬영 순서 안내 */}
        <ol className="nd-shooting-guide-steps">
          <li>PC 측면 패널을 열어 내부를 노출합니다</li>
          <li>스마트폰 플래시를 켜고 20~30cm 거리를 유지합니다</li>
          <li>메인보드 전체 → 커패시터 근접 → RAM → GPU 순서로 촬영합니다</li>
          <li>카메라를 고정한 상태에서 흔들림 없이 촬영합니다</li>
        </ol>
      </div>
    </div>
  );
}
