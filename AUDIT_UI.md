# SYBA UI/UX Audit Report

**Date:** 2026-02-14  
**Auditor:** AI Code Reviewer  
**Scope:** `app/` (screens) + `src/components/` + `src/constants/theme.ts` + `src/hooks/useTheme.ts`

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| Major | 12 |
| Minor | 8 |

---

## 1. 다크모드 — 하드코딩된 색상 (Critical)

**147개 하드코딩된 색상값** 발견. `theme` 토큰 대신 직접 색상 사용.

### Critical: 다크모드에서 깨지는 하드코딩

대부분 `#FFFFFF`가 버튼 텍스트에 사용됨. 이는 선택된 항목의 텍스트이므로 `theme.textInverse` 사용 필요.

| File | Lines | Issue |
|------|-------|-------|
| `app/(tabs)/settings.tsx` | 327, 393, 442, 823, 1090, 1147, 1203, 1210, 1262, 1277 | `#FFFFFF`, `#F5A623` 하드코딩 |
| `app/(auth)/login.tsx` | 189 | `#FFFFFF` → `theme.textInverse` |
| `app/(auth)/biometric-setup.tsx` | 73 | `#FFFFFF` → `theme.textInverse` |
| `app/(auth)/setup.tsx` | 122 | `#FFFFFF` → `theme.textInverse` |
| `app/(modals)/add-asset.tsx` | 189, 199, 207, 229, 237, 310, 408, 429, 451, 468, 518, 525, 529 | `#FFFFFF`, `#22C55E`, `#FEE2E2`, `#F0F9FF`, `#0284C7`, `#0369A1` 하드코딩 |
| `app/(modals)/edit-record.tsx` | 390, 400, 404, 454, 549, 553, 633, 647, 740, 783 | `#FFFFFF`, `#6B7280` 하드코딩 |
| `app/(modals)/asset-detail.tsx` | 67, 194, 231, 262, 280, 350, 439, 460, 482, 499, 577, 618, 637 | `#FFFFFF`, `#FEE2E2`, `#F59E0B`, `#D1D5DB` 하드코딩 |
| `app/(modals)/subscription.tsx` | 283, 347, 351, 364, 407, 409, 411, 440, 491, 493, 495, 561, 565, 578, 615 | `#FFFFFF`, `#000` 하드코딩 |
| `app/(modals)/add-income.tsx` | 279, 292, 299, 412, 421, 459, 473, 515 | `#FFFFFF`, `#22C55E`, `#D1FAE5`, `#FDE68A` 하드코딩 |
| `app/(modals)/add-loan.tsx` | 175, 234, 511, 562, 576, 603, 611, 686, 694, 738, 746, 784, 806, 820, 863, 897 | `#3B82F6`, `#FFFFFF` 하드코딩 — loan은 전부 `theme.info` 대신 직접 사용 |
| `app/(modals)/change-password.tsx` | 211 | `#FFFFFF` |
| `app/(modals)/payment.tsx` | 153, 157, 170, 212, 213 | `#FFFFFF`, `#000`, `#F59E0B` |
| `app/(modals)/add-expense.tsx` | 366, 379, 386, 443, 541, 547, 630, 644, 695, 742, 797 | `#FFFFFF`, `#6B7280`, `#D1FAE5`, `#FDE68A` |
| `app/(modals)/add-installment.tsx` | 493, 528, 578 | `#FFFFFF` |
| `app/(modals)/installment-detail.tsx` | 78, 703, 737, 784 | `#FFFFFF` |
| `app/(modals)/card-list.tsx` | 97, 117, 120, 127, 133, 139, 148, 154, 159, 165, 169, 219, 220 | `#FFFFFF`, `rgba(255,255,255,*)`, `rgba(239,68,68,0.8)` |
| `app/(modals)/loan-detail.tsx` | 97, 927, 1025, 1059, 1106, 1180 | `#FFFFFF` |
| `app/(modals)/add-card.tsx` | 34, 194, 197, 202, 205, 246, 279, 371, 392, 444 | `#FFFFFF`, `rgba(255,255,255,*)`, `#F59E0B` (카드 색상 배열) |
| `src/components/ErrorBoundary.tsx` | 44, 78 | `#0F0F0F`, `#FFFFFF` — `isDark` 삼항 사용하나 theme 토큰 아님 |

### Charts — rgba 하드코딩 (Major)

차트 라이브러리 `color` 콜백에서 isDark 분기 사용하나 theme 토큰이 아닌 직접 색상:

| File | Lines |
|------|-------|
| `src/components/charts/NetWorthChart.tsx` | 130 |
| `src/components/charts/CategoryPieChart.tsx` | 37 |
| `src/components/charts/IncomeExpenseChart.tsx` | 24, 194-198 |
| `src/components/charts/SpendingTrendChart.tsx` | 105 |

> **권장:** `theme` 객체에서 차트 색상 토큰을 추가하고, charts에서도 theme 사용.

---

## 2. KeyboardAvoidingView (Minor — 양호)

✅ 모든 입력 폼 화면(13개)에 `KeyboardAvoidingView` 적용됨.  
✅ 모든 곳에서 `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` 올바르게 설정.

**해당 파일:** login, setup, add-asset, edit-record, asset-detail, add-income, add-loan, change-password, add-expense, add-installment, installment-detail, loan-detail, add-card

---

## 3. Safe Area (Minor — 양호)

✅ 모든 화면에서 `react-native-safe-area-context`의 `SafeAreaView` 사용 (RN 기본 SafeAreaView 아님).  
✅ 모든 SafeAreaView에 `backgroundColor: theme.background` 설정되어 Android edge-to-edge 겹침 방지.

---

## 4. 폰트 스케일링 (Major)

### 4-1. `scaledFontSize()` 미적용

`scaledFontSize()` 함수가 **프로젝트 어디에도 사용되지 않음**. 모든 `fontSize`가 고정값.

> **권장:** 접근성 대응을 위해 `scaledFontSize()` 유틸리티를 만들고 전체 적용 필요.

### 4-2. `height` 고정 + 텍스트 포함 컨테이너 → `minHeight`로 변경 필요

| File | Line | height | Context |
|------|------|--------|---------|
| `app/(tabs)/settings.tsx` | 300 | 40 | 프로필 영역 (텍스트 포함) |
| `app/(tabs)/debts.tsx` | 281 | 36 | 진행바 컨테이너 (텍스트 포함) |
| `app/(tabs)/assets.tsx` | 250, 336 | 40 | 자산 항목 버튼 (텍스트 포함) |
| `app/(modals)/subscription.tsx` | 275 | 48 | 플랜 항목 (텍스트 포함) |
| `app/(modals)/subscription.tsx` | 324, 432 | 32, 40 | 배지/버튼 (텍스트 포함) |
| `app/(modals)/add-income.tsx` | 471, 513 | 40 | 자산 선택 항목 |
| `app/(modals)/add-expense.tsx` | 795 | 40 | 자산 선택 항목 |
| `app/(modals)/edit-record.tsx` | 836 | 40 | 자산 선택 |
| `app/(modals)/add-installment.tsx` | 437 | 26 | 월 선택 버튼 (너무 작음) |
| `app/(modals)/installment-detail.tsx` | 649 | 26 | 월 선택 버튼 |
| `app/(modals)/add-card.tsx` | 361, 527 | 40 | 색상 선택, 결제일 선택 |
| `src/components/PremiumGate.tsx` | 165 | 40 | CTA 버튼 |

---

## 5. 바텀시트 (Critical)

**`@gorhom/bottom-sheet`가 전혀 사용되지 않음.** 모든 모달이 React Native 기본 `<Modal>` 컴포넌트 사용.

발견된 `<Modal>` 사용처 (총 31개):

| File | Lines | Modal 용도 |
|------|-------|-----------|
| `app/(tabs)/settings.tsx` | 1052, 1103, 1160, 1219 | 자동잠금, 알림시간, 언어, 지역 선택 |
| `app/(modals)/edit-record.tsx` | 748, 796 | 할부 기간, 자산 선택 |
| `app/(modals)/asset-detail.tsx` | 550 | 이자율 편집 |
| `app/(modals)/subscription.tsx` | 523 | 결제 모달 |
| `app/(modals)/add-income.tsx` | 429 | 자산 선택 |
| `app/(modals)/add-loan.tsx` | 485, 538, 618, 704, 755, 834 | 유형, 기간, 은행, 날짜, 상환일, 자산 선택 |
| `app/(modals)/add-expense.tsx` | 755 | 자산 선택 |
| `app/(modals)/add-installment.tsx` | 399, 455, 536 | 카드, 개월, 날짜 선택 |
| `app/(modals)/installment-detail.tsx` | 611+ | 카드, 개월, 날짜 선택 |
| `app/(modals)/loan-detail.tsx` | 다수 | 기간, 은행, 날짜, 상환일 선택 |
| `app/(modals)/add-card.tsx` | 507+ | 결제일 선택 |

> **권장:** 22개 모달을 `@gorhom/bottom-sheet`로 교체하고 `enableDynamicSizing`, `maxDynamicContentSize` 설정 필요.

---

## 6. 다국어 (Critical)

### 6-1. 번역 키 불일치

**ko.json에 19개 키가 존재하나 en/es/ja에 누락:**

```
asset.autoCalcLabel
asset.currentRate
asset.detailInfo
asset.editEstimatedInterest
asset.editEstimatedInterestHint
asset.editTitle
asset.estimatedInterestLabel
asset.lastUpdate
asset.rateBasedOn
asset.registrationDate
asset.revertToAutoCalc
asset.saveFailed
installment.annualRateValue
installment.conditions
installment.detailInfo
installment.editTitle
installment.progressStatus
installment.remainingAmount
installment.startEndDate
```

### 6-2. 하드코딩된 텍스트

대부분 통화 기호(₩, ₿, ⚡)와 이모지만 하드코딩. 한국어 텍스트 하드코딩은 **발견되지 않음** ✅.

---

## 7. 터치 영역 (Major)

`hitSlop` 속성이 **전혀 사용되지 않음**. 536개 TouchableOpacity/Pressable 중 터치 영역 보장 없음.

특히 문제되는 곳:

| File | Line | Issue |
|------|------|-------|
| `app/(modals)/add-installment.tsx` | 437 | height: 26 — 44pt 미만 |
| `app/(modals)/installment-detail.tsx` | 649 | height: 26 — 44pt 미만 |
| `app/(tabs)/debts.tsx` | 281 | height: 36 — 44pt 미만 |
| `app/(modals)/subscription.tsx` | 324 | height: 32 — 44pt 미만 |

> **권장:** 최소 `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}` 적용하거나 `minHeight: 44` 설정.

---

## 8. ScrollView keyboardShouldPersistTaps (Major)

입력 폼의 메인 ScrollView에는 적용되어 있으나, **모달 내부 ScrollView 25개에 누락:**

| File | Lines | Context |
|------|-------|---------|
| `app/(tabs)/settings.tsx` | 276 | 설정 메인 스크롤 |
| `app/(tabs)/index.tsx` | 72 | 대시보드 |
| `app/(tabs)/records.tsx` | 118 | 기록 목록 |
| `app/(tabs)/debts.tsx` | 309 | 부채 목록 |
| `app/(tabs)/assets.tsx` | 100 | 자산 목록 |
| `app/(modals)/edit-record.tsx` | 757, 816 | 모달 내부 선택 목록 |
| `app/(modals)/asset-detail.tsx` | 190 | 자산 상세 (비편집 모드) |
| `app/(modals)/subscription.tsx` | 259 | 구독 화면 |
| `app/(modals)/add-income.tsx` | 447 | 자산 선택 모달 |
| `app/(modals)/add-loan.tsx` | 636, 797, 884 | 각종 선택 모달 |
| `app/(modals)/add-expense.tsx` | 716, 775 | 자산/할부 선택 모달 |
| `app/(modals)/add-installment.tsx` | 417 | 카드 선택 모달 |
| `app/(modals)/installment-detail.tsx` | 198, 629 | 상세 보기, 카드 선택 |
| `app/(modals)/card-list.tsx` | 74 | 카드 목록 |
| `app/(modals)/loan-detail.tsx` | 234, 451, 872, 1157, 1244 | 상세, 각종 선택 |
| `app/(modals)/add-card.tsx` | 507 | 결제일 선택 |

> **영향:** 텍스트 입력 중 다른 요소 터치 시 키보드가 먼저 닫히고 두 번 탭 필요.

---

## 9. 색상 일관성 — 비트코인 오렌지 외 오렌지 사용 (Major)

| Color | File | Line | Issue |
|-------|------|------|-------|
| `#F5A623` | `app/(tabs)/settings.tsx` | 823 | 별도 오렌지 — `theme.primary`(#F7931A) 아님 |
| `#F59E0B` (amber) | `app/(modals)/asset-detail.tsx` | 262, 280, 577, 618 | warning 색상을 강조색으로 사용 → `theme.warning` 사용 필요 |
| `#F59E0B` | `app/(modals)/payment.tsx` | 212, 213 | warning 아이콘/텍스트 → `theme.warning` |
| `#F59E0B` | `app/(modals)/subscription.tsx` | 615 | warning 아이콘 → `theme.warning` |
| `#F59E0B` | `app/(modals)/add-card.tsx` | 34 | 카드 색상 배열 — 의도적일 수 있음 |
| `#FFB347` | `theme.ts` (primaryLight) | — | theme에 정의됨 ✅ |
| `#FBBF24` | `theme.ts` (darkTheme warning) | — | theme에 정의됨 ✅ |
| `#FDE68A` | `app/(modals)/add-income.tsx` | 515 | 비트코인 자산 배지 배경 — theme 토큰 없음 |
| `#FDE68A` | `app/(modals)/add-expense.tsx` | 797 | 비트코인 결제 배지 — theme 토큰 없음 |

---

## 우선순위별 액션 아이템

### Critical (즉시 수정)
1. **다크모드 하드코딩 색상 147개** — `theme` 토큰으로 교체
2. **번역 키 19개 누락** — en/es/ja에 추가
3. **바텀시트 미적용** — `@gorhom/bottom-sheet` 도입 또는 현재 Modal 유지 결정

### Major (이번 스프린트)
4. **`scaledFontSize()` 전체 미적용** — 접근성 대응 필요
5. **`height` 고정 컨테이너 12곳** → `minHeight`로 변경
6. **터치 영역 44pt 미만** 4곳 + hitSlop 전역 미적용
7. **ScrollView `keyboardShouldPersistTaps` 누락** 25곳
8. **색상 일관성** — `#F5A623`, `#F59E0B` 직접 사용 → theme 토큰

### Minor (개선)
9. **차트 색상 rgba 하드코딩** — theme 토큰 추가 고려
10. **ErrorBoundary** isDark 삼항 → theme 토큰
11. **`#FFFFFF` 버튼 텍스트** — 대부분 선택된 상태의 흰색 텍스트로, 다크모드에서도 흰색이 맞을 수 있으나 `theme.textInverse`로 통일 권장
