import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, generateText } from "ai";
import { authenticateGatewayRequest } from "@/lib/gateway-auth";
import { resolveModel } from "@/lib/gateway-models";
import { logUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = createOpenAI({ apiKey: process.env.GATEWAY_OPENAI_API_KEY });
const anthropic = createAnthropic({ apiKey: process.env.GATEWAY_ANTHROPIC_API_KEY });

function getProvider(provider: string, modelId: string) {
  switch (provider) {
    case "openai":
      return openai(modelId);
    case "anthropic":
      return anthropic(modelId);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function POST(req: Request) {
  const authResult = await authenticateGatewayRequest(req);
  if (!authResult.ok) return authResult.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const modelParam = body.model as string | undefined;
  if (!modelParam) {
    return NextResponse.json(
      { error: { message: "Missing required field: model", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const messages = body.messages as Array<{ role: string; content: string }> | undefined;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: { message: "Missing required field: messages", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  let resolved: ReturnType<typeof resolveModel>;
  try {
    resolved = resolveModel(modelParam);
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : String(err), type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const { provider, modelId, pricing } = resolved;
  const stream = body.stream !== false;

  try {
    const model = getProvider(provider, modelId);

    if (stream) {
      const result = streamText({
        model,
        messages: messages as Parameters<typeof streamText>[0]["messages"],
        temperature: body.temperature as number | undefined,
        maxTokens: (body.max_tokens ?? body.max_completion_tokens) as number | undefined,
        topP: body.top_p as number | undefined,
      });

      const response = result.toDataStreamResponse();

      result.then(async (final) => {
        const usage = await final.usage;
        await logUsage({
          userId: authResult.userId,
          apiKeyId: authResult.apiKeyId,
          model: modelId,
          provider,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          pricing,
        }).catch((err) => console.error("[gateway] usage logging failed:", err));
      });

      return response;
    }

    const result = await generateText({
      model,
      messages: messages as Parameters<typeof generateText>[0]["messages"],
      temperature: body.temperature as number | undefined,
      maxTokens: (body.max_tokens ?? body.max_completion_tokens) as number | undefined,
      topP: body.top_p as number | undefined,
    });

    logUsage({
      userId: authResult.userId,
      apiKeyId: authResult.apiKeyId,
      model: modelId,
      provider,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      pricing,
    }).catch((err) => console.error("[gateway] usage logging failed:", err));

    return NextResponse.json({
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text },
          finish_reason: result.finishReason === "stop" ? "stop" : result.finishReason,
        },
      ],
      usage: {
        prompt_tokens: result.usage.promptTokens,
        completion_tokens: result.usage.completionTokens,
        total_tokens: result.usage.promptTokens + result.usage.completionTokens,
      },
    });
  } catch (err) {
    console.error("[gateway] Provider error:", err);
    const message = err instanceof Error ? err.message : "Upstream provider error";
    return NextResponse.json(
      { error: { message, type: "api_error" } },
      { status: 502 },
    );
  }
}
