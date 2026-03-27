# 디자인 시스템 규칙

> 출처: Figma "Untitled" (GlSyRrVWR7Q8R8mGeUwoxX) — AI 생성 목업 기반, 레이아웃·색상 구조만 채택.
> 구현 파일: `src/styles/tokens.css` → `global.css` → `animations.css` 순으로 import.

---

## 색상 사용 원칙

| 목적 | 토큰 | 값 |
|---|---|---|
| 앱 배경 | `--color-bg-base` | `#f9f9f9` |
| 카드 배경 | `--color-bg-card` | `#ffffff` |
| 서브 섹션 배경 | `--color-bg-card-sub` | `#f2f4f4` |
| 브랜드 (CTA, 활성) | `--color-brand` | `#4355b9` |
| 브랜드 틴트 (뱃지 배경) | `--color-brand-light` | `#dee0ff` |
| 앱 헤더 타이틀 | `--color-heading` | `#1e293b` |
| 주 텍스트 | `--color-text-primary` | `#2d3335` |
| 부 텍스트 | `--color-text-secondary` | `#5a6061` |
| 비활성/placeholder | `--color-text-hint` | `#adb3b4` |
| 세션 만료·이상 패턴 강조 | `--color-error-dark` | `#9e3f4e` |

- **직접 색상값 하드코딩 금지** — 반드시 CSS 변수 사용
- 상태 색상: `--color-success` / `--color-warning` / `--color-error` 사용

---

## 타이포그래피 원칙

- **폰트**: Inter (Google Fonts) — `global.css`에서 import
- **피그마 원본 대비 조정**: 초보자 친화 가독성을 위해 Thin→Light, Light→Regular 한 단계 상향
- **코드에서 클래스 사용**: `.text-hero` / `.text-h1` ~ `.text-sm` / `.text-label` / `.text-badge`
- **UPPERCASE 레이블**: 반드시 `.text-label` 클래스 — 직접 `text-transform` 쓰지 말 것

```
히어로 제목:   56px / Light(300) / tracking -0.025em
섹션 제목:     30px / Regular(400) / tracking -0.015em
카드 제목:     24px / Regular(400)
서브 제목:     18px / Bold(700) / tracking -0.015em
본문:          14px / Regular(400)   ← 피그마 Light에서 상향
소문자 설명:   12px / Regular(400)   ← 피그마 Light에서 상향
섹션 레이블:   11px / SemiBold / UPPERCASE / tracking 0.05em
모노 뱃지:     10px / Liberation Mono
```

---

## 레이아웃 원칙

### PWA (모바일)
- 기준 너비: 390px, 좌우 패딩 24px
- 상단 고정 헤더: 64px (`.top-app-bar`)
- 하단 고정 탭바: 64px (`.bottom-nav`) — frosted glass, `backdrop-filter: blur(6px)`
- 콘텐츠 영역: `padding-top: 64px; padding-bottom: 64px` 확보 필수

### Electron (데스크톱)
- 좌측 사이드바: 256px 고정 (`.sidebar`)
- 상단 헤더: 64px (좌측 256px 오프셋)
- 콘텐츠 max-width: 1280px, 패딩 48px
- 증상 입력창 max-width: 672px

---

## 카드 계층

```
배경(#f9f9f9)
  └─ 서브 섹션 카드(#f2f4f4, radius-lg)
       └─ 일반 카드(#ffffff, radius-lg, shadow-card)
            └─ 소형 아이콘 배경(#ffffff, radius-sm)
```

- 카드 radius: `--radius-md`(8px) 소형 / `--radius-lg`(12px) 일반 / `--radius-xl`(16px) 대형 섹션 / `--radius-2xl`(32px) QR 카드
- 카드 shadow: `--shadow-card` (`0 1px 2px rgba(0,0,0,0.05)`) — 과도한 그림자 금지

---

## 브랜드 Glow 패턴 (피그마 핵심 요소)

피그마에서 추출한 고유 디자인 언어. 3가지 상황에서만 사용:

1. **활성 상태 dot**: `width: 8px; box-shadow: --glow-brand` → `.animate-glow-pulse`
2. **프로그레스 바 fill**: `box-shadow: --glow-divider` (파란 glow 선)
3. **브랜드 Divider**: `.divider-brand` 클래스 — 선의 40%만 채워진 브랜드 컬러

```css
/* ❌ 금지 — 임의 glow 남발 */
box-shadow: 0 0 8px blue;

/* ✅ 허용 — 토큰 사용 */
box-shadow: var(--glow-brand);
```

---

## 뱃지 사용 규칙

| 상태 | 클래스 | 용도 |
|---|---|---|
| 완료/정상 | `.badge` + `.text-badge` | PASSED, CONNECTED |
| 성공 | `.badge-success` | RESOLVED |
| 오류 | `.badge-error` | FAILED, ERROR |
| 경고 | `.badge-warning` | WARNING |

- 뱃지 내부 텍스트는 반드시 UPPERCASE + `.text-badge` (Liberation Mono)

---

## 애니메이션 사용 규칙

컴포넌트 진입: `.animate-fade-in-up` (기본) — 과도한 애니메이션 금지
활성 상태 dot: `.animate-glow-pulse`
로딩 상태: `.dot-loading` (3개 dot bounce)
SSE 스트리밍 텍스트: `.typing-cursor`
스켈레톤 로딩: `.skeleton`
캡처 피드백: `.animate-capture-pop`
stale 경고: `.animate-shake`

`prefers-reduced-motion` 대응 — `animations.css` 하단에 전역 처리됨.

---

## 피그마에서 제거한 요소 (구현 금지)

- PWA 배경의 회로/카메라 일러스트 이미지 → 배경은 단색 `#f9f9f9`만 사용
- AI 더미 텍스트 (AES-256-GCM, Workstation ID 등) → 실제 앱 데이터로만 표시
- 영문 전문용어 UI 레이블 → 한국어 친근체 사용 ("진단 시작", "연결됨" 등)

---

## 피그마 전체 화면 목록 (node-id 기준)

| node-id | 화면명 | 환경 | 해당 Phase |
|---|---|---|---|
| `1:2` | 세션 홈 (PWA 메인) | PWA | Phase 6 |
| `1:87` | 촬영 가이드 | PWA | Phase 7 |
| `1:241` | 실시간 스캔 (카메라 뷰파인더 + AR 오버레이 + 오디오 파형) | PWA | Phase 7/8 |
| `1:329` | QR 세션 연결 (데스크톱 사이드바 + QR 카드 + 만료 타이머) | Electron | Phase 11 |
| `1:454` | 재현 모드 (라인 그래프 + Abnormal 패턴 사이드바) | Electron | Phase 5 |

### 화면별 핵심 패턴 요약

**실시간 스캔 (1:241)**
- 카메라 뷰 위 반투명 카드: `backdrop-blur-[8px] bg-[rgba(255,255,255,0.9)]`
- 오디오 파형 바: 활성 `--color-brand` / 비활성 `--color-brand-light`
- 스캐닝 레티클: 브랜드 컬러 코너 브래킷 + 수평 스캐닝 라인

**QR 세션 연결 (1:329)**
- 데스크톱 사이드바 256px (`.sidebar` 클래스)
- QR 컨테이너 `--radius-2xl`(32px) + `shadow-[0px_20px_60px...]`
- 세션 만료 타이머: `--color-error-dark`(#9e3f4e) 배경·텍스트
- 수동 입력 코드: Liberation Mono 30px + `tracking-[12px]`

**재현 모드 (1:454)**
- 브레드크럼 헤더: `SYSTEM STATUS / 재현 모드` 형식
- 라인 그래프 + 그리드 라인: `--color-border`(#ebeeef)
- Abnormal 패턴 카드: `border-l-4` 좌측 컬러 액센트
  - Critical: `--color-error-dark` / Warning: `#535f78` / Tonal: `--color-border`
- Pulse Meter 카드: `--color-bg-card-sub` 배경 + `--confidence-bar` 패턴

---

## import 순서

```css
/* main.tsx 또는 App.tsx 상단 */
import './styles/tokens.css';
import './styles/global.css';
import './styles/animations.css';
/* 이후 컴포넌트별 .module.css는 각 컴포넌트에서 import */
```

---

## 컴포넌트 CSS 작성 시 체크리스트

- [ ] CSS 변수(`var(--...)`)만 사용, 하드코딩 금지
- [ ] 색상은 `tokens.css` 변수, 레이아웃 간격은 `--space-*` 변수
- [ ] 폰트 크기/굵기는 `global.css` 클래스 또는 변수 참조
- [ ] 애니메이션은 `animations.css` 클래스 사용
- [ ] `prefers-reduced-motion`은 `animations.css`에서 전역 처리됨 — 개별 컴포넌트에서 중복 처리 불필요
