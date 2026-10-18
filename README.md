# (주)성원 RAG기반 AI

`dataset` 문서를 바탕으로 답하고, 최신 정보가 필요한 질문은 Tavily MCP로 검색하는 RAG 챗봇입니다. Next.js, Upstage Solar/Embedding, Supabase Auth·Postgres·pgvector로 구성되어 있습니다.

## 주요 기능

- Google OAuth 로그인, 프로필 표시, 로그아웃
- 사용자별 채팅방과 질문·답변·생성 시간 저장
- Upstage `solar-embedding-2`와 Supabase pgvector를 이용한 문서 검색
- 답변에 참고한 문서명·PDF 페이지·내용 표시
- 최신 정보 질문에 Tavily 원격 MCP 웹 검색
- 사용자별 채팅 RLS와 읽기 전용 문서 RLS

## 로컬 실행

Node.js 22.18 이상이 필요합니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다. `.env.local`에는 다음 네 개의 런타임 환경변수를 설정합니다.

```dotenv
UPSTAGE_API_KEY=...
TAVILY_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

API 키는 브라우저 코드에 노출되지 않도록 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

## Supabase 설정

현재 연결된 Supabase 프로젝트에는 `supabase/migrations`의 스키마와 검색 함수가 적용되어 있습니다. 다른 프로젝트에서 실행할 때는 파일명 순서대로 SQL migration을 적용합니다.

Supabase Dashboard의 **Authentication → URL Configuration**에 다음 Redirect URL을 등록합니다.

```text
http://127.0.0.1:3000/auth/callback
http://localhost:3000/auth/callback
https://YOUR_VERCEL_DOMAIN/auth/callback
```

Google Cloud OAuth Client의 승인된 리디렉션 URI에는 아래 Supabase 콜백을 등록합니다.

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

## 문서 가져오기

`dataset` 아래의 PDF, TXT, MD 파일을 페이지 단위로 읽고 청크로 나눈 뒤 Upstage passage embedding을 생성합니다. `SUPABASE_SECRET_KEY`는 이 로컬 관리자 작업에만 사용하며 Vercel에는 등록하지 않습니다.

```bash
# .env.local에 SUPABASE_SECRET_KEY를 임시로 추가한 뒤
npm run ingest
```

가져온 원문 텍스트와 임베딩은 Supabase에 저장됩니다. 텍스트가 없는 스캔 PDF는 먼저 OCR이 필요합니다. `dataset`과 로컬 임베딩 캐시는 Git에 포함되지 않습니다.

## Vercel 배포

GitHub 저장소를 Vercel에 연결한 뒤 Project Settings → Environment Variables에 아래 네 값을 Production, Preview, Development 환경에 등록하고 재배포합니다.

```text
UPSTAGE_API_KEY
TAVILY_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

배포 도메인의 `/auth/callback`도 위 Supabase Redirect URL 목록에 추가해야 합니다. 환경변수를 바꾼 뒤에는 기존 배포가 아니라 새 배포를 실행해야 반영됩니다.

## 검증

```bash
npm test
npm run lint
npm run build
```
