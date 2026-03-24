# 디자인 토큰 — 구현 시 참조

> 전체 CSS 스펙: `docs/design-system.md`
> 테마: 라이트 (토스 스타일) — 흰 배경 + 파란 강조 + 넓은 여백 + 둥근 모서리
> 스타일링: CSS Modules + CSS Custom Properties (Tailwind 미사용)
> 아이콘: `lucide-react`

## CSS 변수 (tokens.css)

| 용도 | 변수명 | 값 | 실제 색상 |
|---|---|---|---|
| 앱 배경 | `--color-bg-base` | `#ffffff` | 흰색 |
| 카드/패널 | `--color-bg-surface` | `#f9fafb` | 아주 연한 회색 |
| 입력창/비활성 버튼 | `--color-bg-input` | `#f2f4f6` | 연한 회색 |
| 강조색 | `--color-accent` | `#3182f6` | 파란색 |
| 강조 hover | `--color-accent-dim` | `#1b64da` | 진한 파란색 |
| 신뢰도 높음 80%+ | `--color-conf-high` | `#05c46b` | 초록색 |
| 신뢰도 높음 배경 | `--color-conf-high-bg` | `#f0fff8` | 아주 연한 초록 |
| 신뢰도 중간 60~79% | `--color-conf-mid` | `#ff9f43` | 주황색 |
| 신뢰도 낮음 <60% | `--color-conf-low` | `#ff5e57` | 빨간색 |
| 신뢰도 낮음 배경 | `--color-conf-low-bg` | `#fff4f4` | 아주 연한 빨강 |
| 주 텍스트 | `--color-text-primary` | `#191f28` | 거의 검정 |
| 보조 텍스트 | `--color-text-muted` | `#4e5968` | 중간 회색 |
| 힌트/비활성 | `--color-text-hint` | `#6b7684` | 회색 (WCAG AA 대비 충족) |
| 테두리 | `--color-border` | `#e5e8eb` | 아주 연한 회색 |
| 폰트 (UI) | `--font-sans` | `'Pretendard', 'Noto Sans KR', sans-serif` | |
| 폰트 (수치) | `--font-mono` | `'JetBrains Mono', monospace` | |
| 폰트 굵기 기본 | `--font-weight-regular` | `400` | |
| 폰트 굵기 강조 | `--font-weight-bold` | `700` | |
| 줄간격 | `--line-height-normal` | `1.5` | |
| 기본 radius | `--radius-md` | `16px` | |
| 작은 radius | `--radius-sm` | `8px` | 배지, 태그 |
| 큰 radius | `--radius-lg` | `24px` | bottom-sheet 상단 |
| 버튼 radius | `--radius-pill` | `999px` | pill 형태 버튼 |
| 애니메이션 빠름 | `--transition-fast` | `0.15s ease` | 버튼 hover |
| 애니메이션 기본 | `--transition-base` | `0.2s ease` | 카드 상태 전환 |
| z-index 모달 | `--z-modal` | `100` | QR 모달, 오버레이 |
| z-index 상태바 | `--z-statusbar` | `50` | SystemStatusBar |

## 스페이싱

```
--space-1: 4px   --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-5: 20px  --space-6: 24px  --space-8: 32px  --space-10: 40px
```

## 컴포넌트 상태 클래스 패턴

```css
/* HypothesisCard */
.card          /* box-shadow: 0 1px 8px rgba(0,0,0,0.08) */
.card.active   /* border-left: 4px solid --color-accent */
.card.failed   /* background: --color-conf-low-bg, border-left: 4px solid --color-conf-low, opacity: 0.5 */
.card.solved   /* background: --color-conf-high-bg, border-left: 4px solid --color-conf-high */

/* SystemStatusBar 수치 */
.normal        /* --color-text-primary */
.warning       /* --color-conf-mid */
.critical      /* --color-conf-low + diagPulse 애니메이션 */

/* 버튼 */
.btnPrimary    /* background: --color-accent, color: #fff, border-radius: --radius-pill */
.btnSecondary  /* background: --color-bg-input, color: --color-text-primary */
```

## 레이아웃 구조

```
Electron: grid(44px 상태바 | 1fr 메인) — 상단 step bar 인디케이터
PWA:      flex-column(카메라 flex:1 | bottom-sheet max-height:55dvh)
          bottom-sheet: padding-bottom: max(--space-6, env(safe-area-inset-bottom))
```

## manifest.json 값

```json
"background_color": "#ffffff",
"theme_color": "#3182f6"
```

## 에셋 경로

```
public/pc-diagram.png      ← PC 부품 구조도 (SVG 오버레이용, CSS filter 불필요)
public/icons/icon-192.png
public/opencv.js           ← SW precache 대상
```

## PCDiagram 주의사항

- `preserveAspectRatio="xMidYMid meet"` 사용 (none 사용 시 좌표 왜곡)
- `@keyframes diagPulse`는 `animations.css`에서 정의 — 인라인 `<style>` 태그 금지
- 부품 키: `GPU` `CPU` `RAM` `SSD` `HDD` `CPU_COOLER` `MAINBOARD` `M2_SSD`
- 오류 시 `--color-conf-low` 테두리 + diagPulse / 경고 시 `--color-conf-mid`
