# SYBA - Start Your Bitcoin Adoption

비트코인 기반 개인 재무 관리 앱

## 소개

SYBA는 비트코인 관점에서 개인 재무를 관리할 수 있는 가계부 앱입니다. 모든 수입과 지출을 원화(KRW)와 사토시(sats) 단위로 동시에 기록하고, 자산의 비트코인 구매력을 추적합니다.

### 핵심 철학

- **로컬 데이터 주권**: 모든 데이터는 암호화되어 기기에만 저장됩니다
- **최소 기록, 최대 가시성**: 한 번의 기록으로 자산/부채/지출이 자동 연동됩니다
- **비트코인 기준 사고**: 원화 자산을 sats로 환산하여 실제 구매력을 파악합니다

## 주요 기능

### 📊 가계부
- 수입/지출 기록 (KRW + sats 동시 기록)
- 카테고리별 분류
- 월별 통계 및 차트

### 💰 자산 관리
- 법정화폐 계좌 (일반/마이너스 통장)
- 비트코인 지갑 (온체인/라이트닝)
- 실시간 BTC 시세 반영 (Upbit WebSocket)

### 💳 부채 관리
- 대출 (원금균등/원리금균등/만기일시)
- 할부
- 신용카드 결제 예정액

### 📈 차트
- 카테고리별 지출 파이차트
- 수입 vs 지출 흐름 (막대/꺾은선)
- 월별 지출 흐름

### 🔐 보안
- 비밀번호/생체인증 잠금
- AES-256 암호화 저장
- LNURL-auth 로그인 (선택)

## 기술 스택

- **Framework**: React Native (Expo SDK 54)
- **Language**: TypeScript
- **Styling**: NativeWind v4 (Tailwind CSS)
- **State**: Zustand
- **Backend**: Supabase (인증/구독 관리)
- **Price API**: Upbit (REST + WebSocket)
- **Payment**: Blink API (Lightning)

## 설치 및 실행

### 요구사항

- Node.js 18+
- npm 또는 yarn
- Expo CLI
- EAS CLI (빌드용)

### 로컬 개발

```bash
# 저장소 클론
git clone https://github.com/AsadoConKimchi/SYBA_start_your_bitcoin_adoption.git
cd SYBA_start_your_bitcoin_adoption

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

### APK 빌드

```bash
# EAS 로그인
npx eas-cli login

# Preview 빌드 (APK)
npx eas-cli build --platform android --profile preview

# Production 빌드 (AAB)
npx eas-cli build --platform android --profile production
```

## 프로젝트 구조

```
app/
├── app/                    # Expo Router 페이지
│   ├── (auth)/            # 인증 화면
│   ├── (tabs)/            # 메인 탭 화면
│   └── (modals)/          # 모달 화면
├── src/
│   ├── components/        # 재사용 컴포넌트
│   │   └── charts/        # 차트 컴포넌트
│   ├── constants/         # 상수 정의
│   ├── services/          # 외부 서비스 연동
│   │   └── api/           # API 클라이언트
│   ├── stores/            # Zustand 스토어
│   ├── types/             # TypeScript 타입
│   └── utils/             # 유틸리티 함수
└── assets/                # 이미지, 폰트
```

## 라이선스

MIT License

## 기여

이슈와 PR을 환영합니다!

---

**SYBA** - 비트코인으로 재무적 자유를 시작하세요 🟠
