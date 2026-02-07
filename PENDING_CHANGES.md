# 다음 빌드 대기 중인 변경사항

**현재 배포 버전:** v0.1.2
**다음 예정 버전:** v0.1.3

---

## 코드 변경 완료 (빌드 대기)

- [x] LNURL 도메인 변경: `syba-citadel.vercel.app` (Lightning 지갑에 표시되는 도메인)
- [x] 프리미엄 가격 동적 로딩: `PremiumGate.tsx`, `subscription.tsx`, `payment.tsx` (하드코딩 → Supabase에서 가격 조회)
- [x] TextInput 색상 명시적 지정 (Android 호환성): 7개 파일의 TextInput에 `color: '#1A1A1A'`, `placeholderTextColor="#9CA3AF"` 추가
  - `add-expense.tsx`, `add-income.tsx`, `login.tsx`, `setup.tsx`, `add-card.tsx`, `change-password.tsx`, `edit-record.tsx`
  - (나머지 6개 파일은 이미 color 지정됨)
- [x] 탭바 Android 네비게이션바 오버랩 수정: `_layout.tsx`에 `useSafeAreaInsets()` 적용 (Platform.OS === 'android' 조건부)

---

## 테스터 피드백

| 날짜 | 테스터 | 피드백 내용 | 상태 |
|------|--------|-------------|------|
| | | | |

---

## 버그 리포트

| 날짜 | 증상 | 재현 방법 | 상태 |
|------|------|----------|------|
| | | | |

---

## 기능 요청

| 날짜 | 요청 내용 | 우선순위 | 상태 |
|------|----------|----------|------|
| | | | |

---

## 빌드 체크리스트

빌드 전 확인:
- [ ] 모든 코드 변경 완료
- [ ] 테스트 완료
- [ ] 버전 번호 업데이트 (app.json)
- [ ] 커밋 & 푸시
- [ ] GitHub Release 생성
