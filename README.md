# 모두의 AI

Upstage Solar Pro 4와 Tavily 원격 MCP 검색을 사용하는 간단한 Next.js 챗봇입니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local에 Upstage와 Tavily API 키 입력
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Vercel 배포

프로젝트를 Vercel에 연결하고 `UPSTAGE_API_KEY`, `TAVILY_API_KEY` 두 환경변수를 등록한 뒤 배포합니다. API 키는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

## 동작 방식

- 일반 질문: Upstage Solar Pro 4가 바로 답변합니다.
- 최신 정보가 필요한 질문: 모델의 도구 호출을 받아 서버가 Tavily 원격 MCP의 검색 도구를 실행하고, 검색 결과를 Solar에 다시 전달합니다.
- 모든 API 키와 외부 API 호출은 Next.js 서버 라우트 안에서만 사용됩니다.
