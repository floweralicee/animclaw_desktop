import { NextResponse } from "next/server";
import { createGateway, streamText, generateText, type ModelMessage } from "ai";
import { authenticateGatewayRequest } from "@/lib/gateway-auth";
import { resolveModel } from "@/lib/gateway-models";

export const runtime = "nodejs";
export const maxDuration = 120;

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

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

  const { provider, modelId } = resolved;
  const stream = body.stream !== false;

  try {
    const model = gateway(`${provider}/${modelId}`);

    if (stream) {
      const result = streamText({
        model,
        messages: messages as ModelMessage[],
        temperature: body.temperature as number | undefined,
        maxOutputTokens: (body.max_tokens ?? body.max_completion_tokens) as number | undefined,
        topP: body.top_p as number | undefined,
      });

      return result.toTextStreamResponse();
    }

    const result = await generateText({
      model,
      messages: messages as ModelMessage[],
      temperature: body.temperature as number | undefined,
      maxOutputTokens: (body.max_tokens ?? body.max_completion_tokens) as number | undefined,
      topP: body.top_p as number | undefined,
    });

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
        prompt_tokens: result.usage.inputTokens ?? 0,
        completion_tokens: result.usage.outputTokens ?? 0,
        total_tokens:
          result.usage.totalTokens ??
          (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
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
