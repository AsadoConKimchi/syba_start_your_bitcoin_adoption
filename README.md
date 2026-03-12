# SYBA - Start Your Bitcoin Adoption

> v1.2.1 | 비트코인 기반 개인 재무 관리 앱

<!-- 향후 Play Store 출시 시 배지 추가
[![Google Play](https://img.shields.io/badge/Google_Play-다운로드-green?logo=google-play)](https://play.google.com/store/apps/details?id=com.syba.finance)
-->

## 왜 SYBA인가?

**당신의 재무 데이터는 당신만의 것입니다.**

SYBA는 모든 금융 데이터를 기기 안에서만 암호화하여 보관합니다. 서버에 업로드하지 않고, 계정을 만들지 않아도 됩니다. 수입과 지출을 기록하면 자산, 부채, 카드 잔액이 자동으로 연동되며, 모든 자산을 비트코인(sats) 기준으로 환산하여 실제 구매력을 파악할 수 있습니다.

- **로컬 데이터 주권** — 모든 데이터는 AES-256으로 암호화되어 기기에만 저장됩니다. 외부 서버로 전송되지 않습니다.
- **한 번 기록, 자동 연동** — 지출을 기록하면 연결된 계좌 잔액, 카드 결제 예정액, 대출 잔액이 자동으로 반영됩니다.
- **비트코인 기준 사고** — 원화 자산을 사토시(sats)로 환산하여 법정화폐 인플레이션에 가려진 실제 구매력을 보여줍니다.

---

## 주요 기능

### 가계부
- 수입/지출을 원화와 사토시 단위로 동시에 기록
- 카테고리별 분류 (직접 카테고리 그룹 생성 가능)
- 월별 통계와 차트
- CSV 파일로 기록 일괄 가져오기

### 자산 관리
- 은행 계좌 (일반 계좌, 마이너스 통장)
- 비트코인 지갑 (온체인, 라이트닝)
- 실시간 비트코인 시세 반영
- 계좌 간 이체, 선불카드 충전

### 부채 관리
- 대출 관리 (원금균등, 원리금균등, 만기일시 상환)
- 할부 관리
- 신용카드 결제 예정액 자동 계산
- 월별 자동 차감 스케줄링

### 차트
- 카테고리별 지출 비율 (파이차트)
- 수입 vs 지출 흐름 (막대/꺾은선 그래프)
- 월별 지출 추이
- 순자산 변화 추이

### 다국어 / 다지역
- 한국어, English, Español (AR), 日本語
- 지역별 은행/카드사 목록 자동 적용
- 지역별 시세 API 자동 선택 (한국: Upbit, 미국: Coinbase, 아르헨티나/일본: OKX)

---

## 프라이버시 & 보안

SYBA는 **"데이터가 기기를 떠나지 않는다"**는 원칙으로 설계되었습니다.

### 데이터 저장 구조

| 데이터 | 저장 위치 | 암호화 |
|---|---|---|
| 모든 금융 기록 (가계부, 카드, 대출, 할부, 자산, 카테고리, 고정비용, 순자산 스냅샷) | 기기 내부 저장소 (`.enc` 파일) | AES-256-CBC, 저장 시마다 새로운 IV |
| 암호화 키, 비밀번호 해시, 솔트 | iOS Keychain / Android Keystore | OS 레벨 보호 (Secure Enclave) |
| 생체인증 설정 | iOS Keychain / Android Keystore | OS 레벨 보호 |
| 자동차감 타임스탬프 | AsyncStorage | 비암호화 (금융 데이터 아님) |
| 구독 상태 | Supabase (서버) | 익명 ID만 사용 — 이메일, 이름, 전화번호 없음 |

**서버로 전송되는 금융 데이터는 없습니다.**

### 암호화 방식

```
알고리즘:    AES-256-CBC
키 크기:     256비트 (32바이트)
모드:        CBC (Cipher Block Chaining)
패딩:        PKCS7
IV:          128비트, 매 저장 시 OS 네이티브 CSPRNG으로 새로 생성
```

**키 도출 (Key Derivation):**

```
알고리즘:    PBKDF2-HMAC-SHA1
반복 횟수:   100,000회
솔트:        256비트, 비밀번호 설정 시 OS CSPRNG으로 생성
출력 키:     256비트 AES 키
```

사용자가 설정한 비밀번호로부터 PBKDF2 100,000회 반복을 통해 암호화 키를 도출합니다. 무차별 대입 공격 시 비밀번호 1개 시도에 100,000회의 해시 연산이 필요합니다.

### 키 관리

- 도출된 암호화 키는 **iOS Keychain** 또는 **Android Keystore**에 보관됩니다
- 앱 실행 중에는 메모리의 클로저 변수에만 보유합니다 (상태 관리 라이브러리나 디버깅 도구에서 접근 불가)
- 앱 잠금 시 메모리에서 키가 즉시 삭제됩니다
- 비밀번호 변경 시 새 솔트를 생성하고, 모든 데이터 파일을 새 키로 재암호화합니다

### 인증

- **비밀번호**: SHA-256 해시로 검증 (원본 비밀번호는 저장하지 않음)
- **생체인증 (Face ID / 지문)**: OS 레벨에서 인증 후 Keychain에서 암호화 키를 직접 로드
- **잠금**: 5회 연속 실패 시 5분간 잠금
- **자동 잠금**: 설정 가능 (즉시, 1분, 5분, 15분, 30분)

### 백업 파일 보안

백업 파일은 AES-256-CBC로 암호화됩니다. 비밀번호 없이는 복호화할 수 없습니다.

```
파일 형식:   SYBA_BACKUP:<솔트>\n<IV>:<암호문>
암호화:      AES-256-CBC (본문 전체)
복호화 조건:  사용자 비밀번호 필요 (PBKDF2 100,000회로 키 도출)
```

솔트는 파일 헤더에 평문으로 포함되지만, 이는 복원 시 키를 도출하기 위해 필요한 것이며, 솔트만으로는 데이터를 복호화할 수 없습니다.

### 네트워크 요청

SYBA가 외부와 통신하는 모든 경우를 투명하게 공개합니다:

| 대상 | 목적 | 전송하는 데이터 |
|---|---|---|
| Upbit / OKX / Coinbase API | 비트코인/법정화폐 시세 조회 | 없음 (GET 요청만) |
| 환율 API | USD/KRW 환율 조회 | 없음 (GET 요청만) |
| Supabase | 구독 관리 | 익명 linking_key만 (이메일, 이름, 전화번호 없음) |
| Blink 프록시 서버 | Lightning 결제 (구독 결제 시) | 결제 금액, 인보이스 (금융 데이터 아님) |
| Sentry | 크래시/에러 자동 보고 | 에러 스택트레이스, 기기 정보 (금융 데이터 미포함) |
| Supabase (분석) | 앱 사용 분석 (5개 이벤트만) | 익명 이벤트 카운트 (PII 미포함) |

- **분석/추적**: 최소 분석만 수집 (5개 익명 이벤트). 설정에서 비활성화 가능
- **광고 SDK**: 없음
- **Lightning API 키**: 앱에 포함되지 않음 (서버에만 보관)

자세한 내용은 [개인정보 처리방침](./docs/PRIVACY_POLICY.md)을 참고하세요.

---

## 다운로드

현재 비공개 테스트 진행 중입니다.

<!-- 향후 Play Store 출시 시 링크 추가
[Google Play Store에서 다운로드](https://play.google.com/store/apps/details?id=com.syba.finance)
-->

---

## 문서

- [사용 가이드](./docs/GUIDE.md) — 앱의 모든 기능을 단계별로 설명합니다
- [변경 이력](./docs/CHANGELOG.md) — 버전별 변경사항을 확인할 수 있습니다
- [개인정보 처리방침](./docs/PRIVACY_POLICY.md)

## 라이선스

[Business Source License 1.1](./LICENSE)

- **Change Date**: 2031-03-03
- **Change License**: Apache License, Version 2.0

개인 비상업적 용도의 사용은 허용됩니다. 상업적 사용에 대해서는 [라이선스 파일](./LICENSE)을 확인하세요.

---

<details>
<summary><strong>개발자 정보</strong></summary>

### 기술 스택

- **Framework**: React Native (Expo SDK 54)
- **Language**: TypeScript
- **Styling**: NativeWind v4 (Tailwind CSS)
- **State**: Zustand
- **Backend**: Supabase (구독/CS 관리)
- **Price API**: Upbit, OKX, Coinbase (지역별 자동 선택)
- **Payment**: Blink API (Lightning Network)

### 로컬 개발

```bash
# 저장소 클론
git clone https://github.com/AsadoConKimchi/syba_start_your_bitcoin_adoption.git
cd syba_start_your_bitcoin_adoption

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일에 API 키 입력

# 개발 서버 실행
npx expo start
```

### 환경 변수

`.env.example`을 `.env`로 복사하고 값을 입력하세요:

```env
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
EXPO_PUBLIC_BLINK_API_URL=https://api.blink.sv/graphql
EXPO_PUBLIC_BLINK_API_KEY=your-blink-api-key
```

### 로컬 빌드

```bash
# Android native 프로젝트 생성
npx expo prebuild --platform android --clean

# APK 빌드 (디버그)
cd android && ./gradlew assembleDebug

# AAB 빌드 (릴리스 — Play Store 업로드용)
cd android && ./gradlew bundleRelease
```

### 프로젝트 구조

```
├── app/                    # Expo Router 페이지
│   ├── (auth)/            # 인증 화면
│   ├── (tabs)/            # 메인 탭 화면 (홈/기록/부채/자산/설정)
│   └── (modals)/          # 모달 화면 (20개)
├── src/
│   ├── components/        # 재사용 컴포넌트
│   │   └── charts/        # 차트 컴포넌트
│   ├── constants/         # 상수 정의
│   ├── hooks/             # 커스텀 훅
│   ├── i18n/              # 다국어 리소스 (ko/en/es/ja)
│   ├── regions/           # 지역별 설정 (kr/us/ar/jp)
│   ├── services/          # 외부 서비스 연동
│   │   └── api/           # 시세 API 클라이언트
│   ├── stores/            # Zustand 스토어
│   ├── types/             # TypeScript 타입
│   └── utils/             # 유틸리티 함수
└── assets/                # 이미지, 폰트
```

</details>

---

**SYBA** — 비트코인으로 재무적 자유를 시작하세요 🟠
