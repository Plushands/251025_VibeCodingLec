# Peppa Playground v1.1 정리

## 1. 프로젝트 개요
- **목적**: Peppa Pig 영상을 활용해 부모와 4살 아이가 함께 즐겁게 영어 표현을 익힐 수 있는 놀이형 학습 환경 제공.
- **구성**: Node.js(Express) 백엔드, React/Vite 컨트롤러(iPad UI), TV 전용 IFrame 플레이어.
- **AI 연동**: OpenAI Chat Completions(대본 분석), Whisper STT(음성 인식), YouTube Data API(영상 메타/길이 조회).

## 2. 폴더 구조
```
peppa-play/
├─ apps/
│  ├─ server/
│  │  ├─ src/index.ts             # 라우터 등록 및 서버 실행
│  │  ├─ src/routes/              # analyze, stt, feedback, suggestions
│  │  ├─ src/services/            # youtube, llm, whisper, heuristics
│  │  ├─ src/types/               # EpisodeAnalysis 타입
│  │  └─ src/utils/               # WebVTT 파서
│  └─ controller/
│     ├─ src/App.tsx              # Whisper 로그/추천/재생 UI
│     ├─ src/main.tsx
│     └─ index.html               # 탭 제목 등 메타
└─ 기타 문서 및 보조 스크립트
```

## 3. 실행 방법
1. **의존성 설치**
   ```bash
   pnpm install
   ```
2. **환경 변수 설정**
   ```bash
   cd apps/server
   cp .env.example .env         # OPENAI_API_KEY, YOUTUBE_API_KEY 입력
   ```
3. **개발 서버 실행**
   ```bash
   pnpm --filter server dev      # http://localhost:4000
   pnpm --filter controller dev  # http://localhost:5173
   ```
4. **TV 화면 확인**
   - `apps/tv/public/index.html`을 정적 서버로 띄우거나 파일로 열어 IFrame 플레이어 동작 점검.

## 4. 주요 기능
- `GET /suggestions`: Peppa Pig 공식 채널에서 **10~16분(600~960초)** 영상 8개를 추천. 우선적으로 자막이 있는 영상을 `videoCaption=closedCaption` 조건으로 가져오고, 부족 시 일반 영상으로 보충하며, API 오류 시 fallback 목록 사용.
- `GET /analyze`: YouTube WebVTT 자막이 존재하면 즉시 파싱해서 heuristics/LLM 분석 결과를 반환, 자막이 없으면 Whisper 수집 안내 메시지를 응답.
- `POST /analyze`: Whisper로 수집한 `{ text, ts }[]`를 LLM 또는 휴리스틱에 전달해 하이라이트 10개를 생성. Transcript에 없는 문장을 생성하지 않도록 JSON 스키마 기반 프롬프트 사용.
- `POST /stt`: Whisper API를 통해 음성(webm/mp4 등 지원 가능한 형식) → 텍스트 변환. Safari 호환을 위해 MediaRecorder 옵션을 런타임에 판별.
- `POST /feedback`: 간단한 단어 일치율 기반 칭찬/발음 팁 반환.

## 5. 컨트롤러 UX 흐름
1. 상단 카드(2×4)에 추천 영상을 표시. 클릭 또는 URL 입력 후 `Start`를 누르면 자동으로 Whisper 수집 시작.
2. Whisper 로그 패널에서 인식된 문장을 실시간 확인·수정·삭제할 수 있으며, 로그가 비어 있을 때는 안내 문구 표기.
3. `Stop & Analyze` 또는 `Analyze Again`을 누르면 GPT가 추천 표현 10개를 생성하고, 클릭 시 해당 타임스탬프로 즉시 이동.
4. 플레이어는 IFrame API를 사용해 재생/일시정지/시크를 제어하며, `getCurrentTime()`으로 Whisper 타임스탬프를 기록.
5. 브라우저 탭 제목은 **Peppa Play with Papa**로 설정.

## 6. Whisper 수집 팁
- 영상 소리가 마이크에 충분히 입력되도록 스피커 볼륨을 높이거나 스테레오 믹스를 활용. iPhone/Continuity Camera 또는 블루투스 이어폰도 입력 장치로 사용 가능.
- Whisper 로그가 비어 있으면 “No Whisper transcripts yet” 메시지로 재생을 독려.
- 마이크 권한 오류, 기기 미검출, Safari 포맷 미지원 등 상황별로 안내 메시지를 표시.

## 7. 향후 개선 아이디어
1. 추천 영상 캐시 & API 실패 대비 회복 로직 강화.
2. Whisper 실시간 캡션 미리보기, 무성(no-speech) 필터 도입.
3. 부모 가이드(한국어)와 아이용 미션(영어)을 동시에 제공하는 듀얼 카드 구성.
4. 컨트롤러 ↔ TV 간 WebSocket 동기화 및 연습 진행도 표시.
5. Docker/Render 등 배포 스크립트 정리, 테스트 자동화 도입.
6. fallback 목록의 영상 길이를 주기적으로 검증하거나 자동 갱신 로직 추가.

---
- 문서 버전: 2025-10-28  
- 최근 변경: pnpm 워크스페이스/Vite 세팅, YouTube 자막 기반 선제 분석 및 자막 우선 추천, MediaRecorder 호환성 개선, API 베이스 URL 환경 설정 옵션 추가.
