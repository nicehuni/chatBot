import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Source = { title: string; url: string };
type UpstageMessage = {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_web",
    description: "현재 시점의 정보, 최신 뉴스, 날씨, 가격, 일정, 인물의 현직 여부 등 최신 웹 정보가 필요할 때 검색합니다.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색 엔진에 전달할 구체적인 검색어" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const FRESHNESS_PATTERN = /(오늘|현재|지금|최신|최근|이번 주|이번 달|뉴스|날씨|기온|가격|주가|환율|경기 결과|일정|개봉|출시|업데이트|대통령|대표이사|CEO|today|current|latest|recent|news|weather|price|stock|schedule|release)/i;

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function callUpstage(messages: UpstageMessage[], forceSearch = false) {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) throw new Error("UPSTAGE_API_KEY가 설정되지 않았습니다.");

  const response = await fetch("https://api.upstage.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "solar-pro4",
      messages,
      tools: [WEB_SEARCH_TOOL],
      tool_choice: forceSearch ? "required" : "auto",
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Upstage API error", response.status, detail.slice(0, 500));
    throw new Error("AI 답변을 생성하지 못했습니다.");
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message as UpstageMessage | undefined;
  if (!message) throw new Error("AI 응답 형식을 확인하지 못했습니다.");
  return message;
}

function textFromMcpResult(result: unknown) {
  if (!result || typeof result !== "object" || !("content" in result)) return JSON.stringify(result);
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  return content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n") || "검색 결과가 없습니다.";
}

function sourcesFromSearchResult(text: string): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = value as Record<string, unknown>;
    if (typeof item.url === "string" && /^https?:\/\//.test(item.url) && !seen.has(item.url)) {
      seen.add(item.url);
      sources.push({
        url: item.url,
        title: typeof item.title === "string" && item.title.trim() ? item.title : new URL(item.url).hostname,
      });
    }
    Object.values(item).forEach(visit);
  }

  try {
    visit(JSON.parse(text));
  } catch {
    const urlPattern = /https?:\/\/[^\s)\]"']+/g;
    for (const url of text.match(urlPattern) ?? []) {
      if (!seen.has(url)) {
        seen.add(url);
        sources.push({ url, title: new URL(url).hostname });
      }
    }
  }
  return sources.slice(0, 5);
}

async function searchWithTavily(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY가 설정되지 않았습니다.");

  const client = new Client({ name: "modu-ai", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://mcp.tavily.com/mcp/"), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });

  try {
    await client.connect(transport);
    const availableTools = await client.listTools();
    const searchTool = availableTools.tools.find((tool) => /tavily[-_]search/i.test(tool.name));
    if (!searchTool) throw new Error("Tavily 검색 도구를 찾지 못했습니다.");

    const result = await client.callTool({
      name: searchTool.name,
      arguments: {
        query,
        topic: "general",
        search_depth: "basic",
        max_results: 5,
      },
    });
    const text = textFromMcpResult(result);
    return { text, sources: sourcesFromSearchResult(text) };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = body.messages as ChatMessage[];
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "메시지를 입력해 주세요." }, { status: 400 });
    }
    if (messages.some((message) => !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || message.content.length > 4000)) {
      return NextResponse.json({ error: "올바르지 않은 메시지입니다." }, { status: 400 });
    }

    const recentMessages = messages.slice(-16);
    const lastQuestion = [...recentMessages].reverse().find((message) => message.role === "user")?.content ?? "";
    const systemMessage: UpstageMessage = {
      role: "system",
      content: `당신은 '모두의 AI'라는 친절하고 정확한 한국어 AI 어시스턴트입니다. 오늘 날짜는 ${todayInSeoul()} (대한민국 시간)입니다. 사용자의 언어로 자연스럽고 이해하기 쉽게 답하세요. 현재 시점에 따라 바뀌는 사실은 반드시 search_web을 먼저 사용하세요. 검색 결과를 사용했다면 그 결과에 근거해 답하고, 핵심 주장 뒤에 [1], [2]처럼 출처 번호를 표시하세요. 검색 결과에 없는 사실은 추측하지 마세요. 화면에는 일반 텍스트로 표시되므로 마크다운 제목이나 굵게 문법은 쓰지 말고, 목록이 필요하면 • 기호를 사용하세요.`,
    };

    const conversation: UpstageMessage[] = [systemMessage, ...recentMessages];
    const firstResponse = await callUpstage(conversation, FRESHNESS_PATTERN.test(lastQuestion));
    const toolCalls = firstResponse.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return NextResponse.json({ answer: firstResponse.content || "답변을 만들지 못했어요.", sources: [], searched: false });
    }

    const toolMessages: UpstageMessage[] = [];
    const sources: Source[] = [];
    for (const toolCall of toolCalls.slice(0, 2)) {
      let query = lastQuestion;
      try {
        const args = JSON.parse(toolCall.function.arguments);
        if (typeof args.query === "string" && args.query.trim()) query = args.query;
      } catch {
        // Use the user's original question when tool arguments are malformed.
      }
      const searchResult = await searchWithTavily(query);
      searchResult.sources.forEach((source) => {
        if (!sources.some((item) => item.url === source.url)) sources.push(source);
      });
      toolMessages.push({
        role: "tool",
        name: toolCall.function.name,
        tool_call_id: toolCall.id,
        content: searchResult.text,
      });
    }

    const finalResponse = await callUpstage([
      ...conversation,
      firstResponse,
      ...toolMessages,
      {
        role: "system",
        content: "웹 검색 결과를 바탕으로 최종 답변을 작성하세요. 아래에 별도 출처 목록은 만들지 말고, 제공된 웹 자료 순서에 맞춰 본문에 [1], [2] 형식으로 표시하세요.",
      },
    ]);

    return NextResponse.json({
      answer: finalResponse.content || "검색 결과를 바탕으로 답변을 만들지 못했어요.",
      sources: sources.slice(0, 5),
      searched: true,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
