# SYBA 코드 품질 감사 리포트

**감사일:** 2026-02-14  
**범위:** `src/` 전체 + `app/` 전체 (~22,500 lines, ~90 files)  
**감사자:** Claude Code (subagent:audit-code)

---

## 요약

| Severity | 건수 |
|----------|------|
| 🔴 Critical | 5 |
| 🟠 Major | 12 |
| 🟡 Minor | 15 |

---

## 🔴 Critical

### C-1. 중복 타입 정의로 인한 타입 불일치 — `types/debt.ts` vs `types/loan.ts` vs `types/installment.ts` ✅ 수정완료 (2026-02-25)

**파일:** `src/types/debt.ts`, `src/types/loan.ts`, `src/types/installment.ts`

`debt.ts`에서 `RepaymentType = 'bullet' | 'equalPrincipalAndInterest' | 'equalPrincipal'`로 정의하고, `loan.ts`에서 `RepaymentType = 'bullet' | 'equal_principal_interest' | 'equal_principal'`로 **다른 값**으로 재정의함. `installment.ts`도 `Installment` 타입을 `debt.ts`와 중복 정의 (필드 구조가 다름).

- `src/types/loan.ts:1` — `RepaymentType`이 snake_case (`equal_principal_interest`)
- `src/types/debt.ts:60` — `RepaymentType`이 camelCase (`equalPrincipalAndInterest`)
- `src/types/installment.ts:1-19` — `Installment` 인터페이스가 `debt.ts`와 완전히 다른 구조
- `src/types/index.ts:4` — `export * from './installment'` + `export * from './loan'`이 `debt.ts`의 동명 export와 충돌 가능

**영향:** 잘못된 타입이 import되면 런타임에 상환방식 매칭 실패. `calculations.ts`는 `loan.ts`의 `RepaymentType`을 사용하고, `debtCalculator.ts`와 `debtStore.ts`는 `debt.ts`의 것을 사용 → 혼용 시 타입 에러 없이 로직 오류 발생.

**권장:** `types/loan.ts`와 `types/installment.ts`는 레거시로 보임. 제거하거나 `@deprecated` 표기 후 `debt.ts`로 통일.

---

### C-2. Race Condition — `processAllAutoDeductions`에서 병렬 실행 ✅ 이전 버전에서 수정완료

**파일:** `src/services/autoDeductionService.ts:269-273`

```typescript
const [cardResult, loanResult, installmentResult] = await Promise.all([
  processCardPayments(),
  processLoanRepayments(),
  processInstallmentPayments(),
]);
```

세 함수 모두 같은 Zustand 스토어(`ledgerStore`, `assetStore`, `debtStore`)를 동시에 읽고 쓴다. 특히:
- `processLoanRepayments`가 `addExpense`를 호출하고
- `processInstallmentPayments`도 `addExpense`를 호출하며
- 둘 다 `adjustAssetBalance`를 호출함

**영향:** 동시에 같은 자산의 잔액을 읽고 차감하면 잔액 계산이 꼬일 수 있음 (lost update). 파일 저장도 동시에 일어나 데이터 손실 가능.

**권장:** `Promise.all` → 순차 실행 (`for...of` 또는 체이닝).

---

### C-3. 암호화 키가 메모리에 평문으로 저장 ✅ 수정완료 (2026-02-25)

**파일:** `src/stores/authStore.ts:15`, `src/stores/authStore.ts:115`

```typescript
encryptionKey: string | null;
// ...
set({ encryptionKey: key });
```

`encryptionKey`가 Zustand 스토어의 일반 state로 저장되어 메모리 덤프, React DevTools, 또는 디버거에서 노출 가능. `setupPassword`에서 `[DEBUG]` 로그로 키 존재 여부를 출력하는 것도 위험.

**영향:** 보안 취약점. 암호화 키 유출 시 모든 로컬 데이터 복호화 가능.

**권장:** 키를 state에 저장하지 말고 SecureStore에서 필요할 때만 읽거나, 최소한 `[DEBUG]` 로그 제거. 프로덕션에서는 메모리에 노출 시간 최소화.

---

### C-4. `addExpense`에서 state 저장 후 자산 차감 — 비원자적 연산 ✅ 수정완료 (2026-02-25)

**파일:** `src/stores/ledgerStore.ts:109-145`

```typescript
set(state => ({ records: [...state.records, expense] }));
await get().saveRecords(); // 1. 지출 기록 저장
// ... 자산 차감 ...
await useAssetStore.getState().adjustAssetBalance(...); // 2. 자산 차감
```

1번은 성공하고 2번에서 실패하면, 지출은 기록되었지만 자산은 안 차감된 상태. 반대 케이스도 마찬가지.

**영향:** 데이터 불일치. 네트워크 에러, 파일 I/O 에러, 앱 강제종료 시 발생 가능.

**권장:** 최소한 2번 실패 시 1번을 롤백하는 로직 추가. 또는 두 연산을 하나의 트랜잭션으로 묶기.

---

### C-5. `blink.ts` — 레거시 파일에 API 키 빈 문자열로 남아있음 ⏳ Jin 로컬에서 파일 삭제 예정

**파일:** `src/services/blink.ts:11`

```typescript
API_KEY: '', // 더 이상 사용하지 않음
```

파일 상단에 `@deprecated` 주석이 있지만, `export`된 함수들이 그대로 남아있어 실수로 import 가능. WebSocket 재연결 로직에서 무한 재연결 시도할 수 있음.

**영향:** 잘못된 import 시 빈 API 키로 요청 → 에러 루프. WebSocket `onclose`에서 `isCleanedUp`이 아니면 3초마다 재연결 무한 시도.

**권장:** 파일 삭제하거나 모든 export를 제거.

---

## 🟠 Major

### M-1. `console.log/error/warn` 234건 — `__DEV__` 미적용

**파일:** src/ 전체, app/ 전체 (234건)

대부분의 `console.log`가 `__DEV__` 가드 없이 프로덕션에서도 실행됨. 특히:
- `src/stores/authStore.ts` — `[DEBUG]` 로그에 암호화 관련 정보 노출
- `src/stores/ledgerStore.ts` — `[DEBUG]` 로그에 저장 경로, 키 존재 여부 노출
- `src/stores/cardStore.ts` — `[DEBUG]` 로그
- `src/utils/storage.ts` — `FileSystem.documentDirectory` 경로 노출

**권장:** `if (__DEV__)` 래퍼 추가 또는 커스텀 logger 유틸 사용.

---

### M-2. `any` 타입 6건

| 파일 | 라인 | 내용 |
|------|------|------|
| `src/services/api/upbitWebSocket.ts` | 56 | `let data: any` |
| `app/(tabs)/index.tsx` | 18 | `record: any` |
| `app/(tabs)/records.tsx` | 14 | `record: any` |
| `app/(modals)/edit-record.tsx` | 168 | `event: any` |
| `app/(modals)/add-income.tsx` | 88 | `event: any` |
| `app/(modals)/add-expense.tsx` | 131 | `event: any` |

**권장:** 
- `record: any` → `record: LedgerRecord`
- `event: any` → `DateTimePickerEvent` (from `@react-native-community/datetimepicker`)
- `data: any` → WebSocket 메시지 타입 정의

---

### M-3. WebSocket 메모리 누수 — `upbitWebSocket.ts`

**파일:** `src/services/api/upbitWebSocket.ts:85-88`

```typescript
ws.onclose = (event) => {
  ws = null;
  if (!isManualDisconnect) {
    scheduleReconnect();
  }
};
```

`priceCallback`이 모듈 스코프 변수로 유지됨. `cleanupConnection()`에서 `priceCallback = null`로 설정하지만, `scheduleReconnect()`에서 `priceCallback`을 다시 참조. 컴포넌트가 언마운트되어도 콜백이 살아있을 수 있음.

또한 `disconnectWebSocket()`에서 `priceCallback = null`을 설정하지만 재연결 timeout이 이미 스케줄된 경우:
```typescript
// scheduleReconnect 내부
if (!isManualDisconnect && priceCallback) {
  connectWebSocket(priceCallback); // priceCallback이 이미 null이면 실행 안됨 — OK
}
```
이 부분은 `priceCallback` null 체크가 있어 안전하지만, race condition 가능성 있음.

**권장:** WeakRef 또는 구독자 ID 패턴 사용.

---

### M-4. `subscribeRealTimePrice` — set 전에 isWebSocketConnected 설정

**파일:** `src/stores/priceStore.ts:95-101`

```typescript
connectWebSocket((price: number) => {
  set({ btcKrw: price, ... isWebSocketConnected: true });
});
set({ isWebSocketConnected: true }); // WebSocket 아직 연결 안됨
```

`connectWebSocket` 호출 직후 `isWebSocketConnected: true`를 설정하지만, 실제 WebSocket은 아직 연결 중(`CONNECTING` 상태). 연결 실패 시에도 `true`로 남음.

**권장:** `set({ isWebSocketConnected: true })` 제거, 콜백 내에서만 설정.

---

### M-5. `debtAutoRecord.ts` — `LedgerRecord` import 미사용

**파일:** `src/services/debtAutoRecord.ts:3`

```typescript
import { LedgerRecord } from '../types/ledger';
```

파일 어디서도 `LedgerRecord`를 사용하지 않음.

---

### M-6. `Clipboard` deprecated API 사용

**파일:** `app/(modals)/payment.tsx:7`, `app/(modals)/subscription.tsx` 

```typescript
import { Clipboard } from 'react-native'; // deprecated
```

React Native의 `Clipboard`는 deprecated. `settings.tsx`에서는 올바르게 `expo-clipboard`를 사용하지만 `payment.tsx`에서는 RN 내장 deprecated API 사용.

**권장:** `expo-clipboard`로 통일.

---

### M-7. `calculations.ts`와 `debtCalculator.ts` 기능 중복

**파일:** `src/utils/calculations.ts`, `src/utils/debtCalculator.ts`

`calculations.ts`에 `calculateMonthlyPayment`, `calculateRemainingBalance` 등이 있고, `debtCalculator.ts`에도 `calculateLoanPayment`, `calculateInstallmentPayment`이 있음. 유사한 계산을 다른 방식으로 구현. `RepaymentType` 값도 다름 (C-1 참조).

**권장:** 하나로 통합.

---

### M-8. `addExpense` — `overrideBtcKrw` 파라미터 시그니처 불일치

**파일:** `src/stores/ledgerStore.ts:59`

```typescript
addExpense: async (expenseData, overrideBtcKrw) => {
```

인터페이스 `LedgerActions`에서 `addExpense`는 `overrideBtcKrw` 파라미터를 정의하지 않음. 실제 구현에서만 받고 있어 타입 시그니처와 불일치.

**영향:** TypeScript가 잡지 못하는 런타임 파라미터 누락 가능.

**권장:** 인터페이스에 `overrideBtcKrw?: number | null` 추가.

---

### M-9. `processAllAutoDeductions` 에러가 삼켜짐

**파일:** `src/services/autoDeductionService.ts`

각 `process*` 함수 내부에서 에러를 catch하고 `result.errors`에 추가하지만, 호출자(`_layout.tsx`)에서 이 에러를 무시함:

```typescript
// app/(tabs)/_layout.tsx
processAllAutoDeductions(); // fire-and-forget, 에러 처리 없음
```

**권장:** 에러 로깅 최소한 추가.

---

### M-10. `snapshotStore` — 이전 달 보완 저장 미구현

**파일:** `src/stores/snapshotStore.ts:105-108`

```typescript
// 이전 달 데이터로 스냅샷 생성은 어려우므로 현재 상태로 대체 저장
// (정확하지 않지만 없는 것보다 나음)
console.log(`[SnapshotStore] ${prevMonth} 스냅샷 누락됨, 현재 상태로 보완 저장`);
```

코멘트만 있고 실제 저장 로직이 없음. 로그만 찍고 넘어감.

---

### M-11. `payment.tsx` — `Clipboard` import from `react-native` deprecated

**파일:** `app/(modals)/payment.tsx:7`

이미 M-6에서 언급했지만, 추가로 `Clipboard.setString`은 iOS에서 동작하지 않을 수 있음.

---

### M-12. `index.ts` barrel exports에서 store 누락

**파일:** `src/stores/index.ts`

```typescript
export { useAuthStore } from './authStore';
export { useLedgerStore } from './ledgerStore';
export { usePriceStore } from './priceStore';
export { useSettingsStore } from './settingsStore';
export { useCardStore } from './cardStore';
```

`useDebtStore`, `useAssetStore`, `useSnapshotStore`, `useSubscriptionStore`가 barrel export에 빠져있음. 직접 경로로 import하고 있어 동작에 문제는 없지만 일관성 부족.

---

## 🟡 Minor

### m-1. `getTodayString` import 미사용
**파일:** `app/(modals)/add-expense.tsx:22` — `getTodayString` import했지만 사용 안함.

### m-2. `formatDateWithDay` import 미사용  
**파일:** `app/(tabs)/index.tsx` — 상단에 import하지만 사용 여부 확인 필요 (코드 잘림으로 미확정).

### m-3. `DEFAULT_EXPENSE_CATEGORIES`에서 한국어 하드코딩
**파일:** `src/constants/categories.ts` — `name` 필드가 한국어로 고정 (`'식비'`, `'교통'` 등). i18n key는 별도 존재하지만 `name` 필드가 레거시 코드에서 직접 사용될 수 있음.

### m-4. `REPAYMENT_TYPE_LABELS` 한국어 하드코딩
**파일:** `src/types/debt.ts:108-112` — i18n 키(`REPAYMENT_TYPE_LABEL_KEYS`)가 있지만 별도로 한국어 하드코딩된 `REPAYMENT_TYPE_LABELS`도 존재. `loan-detail.tsx`에서 하드코딩 버전 사용중.

### m-5. `colors.ts` 미사용
**파일:** `src/constants/colors.ts` — `theme.ts`에서 테마 시스템을 사용하므로 `colors.ts`는 거의 사용되지 않음.

### m-6. `fontScale.ts` — `fixedFontSize` 아이덴티티 함수
**파일:** `src/utils/fontScale.ts:16-18` — `return size`만 하는 함수. 의도적이지만 불필요한 추상화.

### m-7. `BANKS` 레거시 배열 미사용
**파일:** `src/constants/banks.ts:4-23` — `getCurrentRegion().banks`로 대체되었으나 레거시 배열이 남아있음.

### m-8. `CARD_COMPANIES` 레거시 배열 미사용
**파일:** `src/constants/cardCompanies.ts:5-19` — 동일하게 region 시스템으로 대체됨.

### m-9. `PAYMENT_DAY_OPTIONS` 미사용
**파일:** `src/types/card.ts:41` — `getPaymentDayOptions()` 함수가 대체.

### m-10. `DAILY_REMINDER_MESSAGES` 레거시 export
**파일:** `src/constants/messages.ts:9-12` — 함수 버전 `getDailyReminderMessages()`가 있으므로 불필요.

### m-11. `SUBSCRIPTION_MESSAGES` 레거시 export
**파일:** `src/constants/messages.ts:23-35` — 동일.

### m-12. `deriveKeySync` 미사용
**파일:** `src/utils/encryption.ts:34` — `deriveKey` async 버전만 사용됨.

### m-13. `isPasswordSet` 미사용
**파일:** `src/utils/encryption.ts:98` — 호출하는 곳 없음.

### m-14. `getDefaultBillingPeriod` 레거시 함수
**파일:** `src/types/card.ts:59-64` — `getBillingPeriodForCard`로 대체됨.

### m-15. `getCardsWithPaymentDay` 미사용
**파일:** `src/utils/cardPaymentCalculator.ts:174` — export되지만 호출하는 곳 없음.

---

## 종합 평가

전체적으로 코드 구조가 깔끔하고, 타입 시스템을 적극 활용하고 있음. 주요 문제점:

1. **타입 중복 정의 (C-1)** — 가장 시급. `types/loan.ts`와 `types/installment.ts`가 레거시로 남아있어 혼란 유발.
2. **Race condition (C-2, C-4)** — 병렬 자산 차감, 비원자적 연산이 데이터 불일치를 유발할 수 있음.
3. **보안 (C-3, M-1)** — 암호화 키 메모리 노출 + 234건의 프로덕션 console.log.
4. **레거시 코드 정리 (C-5, m-7~m-15)** — deprecated 파일/함수가 남아있어 실수 유발 가능.

**우선순위:** C-1 → C-2 → M-1 → C-3 → C-4 → C-5 순으로 수정 권장.
