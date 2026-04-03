import { NextResponse } from "next/server";
import { createGateway, streamText, generateText, type ModelMessage } from "ai";
import { authenticateGatewayRequest } from "@/lib/gateway-auth";
import { resolveModel } from "@/lib/gateway-models";
import { logUsage } from "@/lib/usage";
import { checkUserCredit } from "@/lib/credits";
import { buildAutoRouteCandidates } from "@/lib/router/tier-models";
import { isAutoModel, scoreRequest } from "@/lib/router/scorer";

export const runtime = "nodejs";
export const maxDuration = 120;

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

const ROUTE_HEADERS = {
  tier: "X-Animclaw-Tier",
  model: "X-Animclaw-Model",
  confidence: "X-Animclaw-Confidence",
} as const;

function isRetryableGatewayError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /502|503|504|timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg) ||
    /rate limit|overloaded/i.test(msg)
  );
}

export async function POST(req: Request) {
  const authResult = await authenticateGatewayRequest(req);
  if (!authResult.ok) return authResult.response;

  const { userId, apiKeyId } = authResult;

  const creditCheck = await checkUserCredit(userId);
  if (!creditCheck.allowed) {
    return NextResponse.json(
      { error: { message: creditCheck.reason, type: "insufficient_credits" } },
      { status: 402 },
    );
  }

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
  if (!messages || !Array.isArray(messages) || !messages.length) {
    return NextResponse.json(
      { error: { message: "Missing required field: messages", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const stream = body.stream !== false;
  const maxTokens = (body.max_tokens ?? body.max_completion_tokens) as number | undefined;

  let routingTier: string | null = null;
  let routingConfidence: number | null = null;
  let autoRouted = false;
  let candidateModelIds: string[] = [];

  if (isAutoModel(modelParam)) {
    autoRouted = true;
    const scored = scoreRequest({
      messages,
      tools: body.tools,
      maxTokens,
    });
    routingTier = scored.tier;
    routingConfidence = scored.confidence;
    candidateModelIds = buildAutoRouteCandidates(scored.tier);
  } else {
    try {
      const r = resolveModel(modelParam);
      candidateModelIds = [r.modelId];
    } catch (err) {
      return NextResponse.json(
        {
          error: {
            message: err instanceof Error ? err.message : String(err),
            type: "invalid_request_error",
          },
        },
        { status: 400 },
      );
    }
  }

  const commonHeaders: Record<string, string> = {};
  if (autoRouted && routingTier !== null) {
    commonHeaders[ROUTE_HEADERS.tier] = routingTier;
    if (routingConfidence !== null) {
      commonHeaders[ROUTE_HEADERS.confidence] = routingConfidence.toFixed(3);
    }
  }

  if (stream) {
    return handleStreaming({
      userId,
      apiKeyId,
      messages: messages as ModelMessage[],
      body,
      candidateModelIds,
      autoRouted,
      routingTier,
      routingConfidence,
      commonHeaders,
    });
  }

  return handleNonStreaming({
    userId,
    apiKeyId,
    messages: messages as ModelMessage[],
    body,
    candidateModelIds,
    autoRouted,
    routingTier,
    routingConfidence,
    commonHeaders,
  });
}

async function handleNonStreaming(params: {
  userId: string;
  apiKeyId: string;
  messages: ModelMessage[];
  body: Record<string, unknown>;
  candidateModelIds: string[];
  autoRouted: boolean;
  routingTier: string | null;
  routingConfidence: number | null;
  commonHeaders: Record<string, string>;
}): Promise<Response> {
  const {
    userId,
    apiKeyId,
    messages,
    body,
    candidateModelIds,
    autoRouted,
    routingTier,
    routingConfidence,
    commonHeaders,
  } = params;

  let lastErr: unknown;
  for (const modelId of candidateModelIds) {
    let resolved: ReturnType<typeof resolveModel>;
    try {
      resolved = resolveModel(modelId);
    } catch {
      continue;
    }
    const { provider, modelId: id, pricing } = resolved;
    const model = gateway(`${provider}/${id}`);

    try {
      const result = await generateText({
        model,
        messages,
        temperature: body.temperature as number | undefined,
        maxOutputTokens: (body.max_tokens ?? body.max_completion_tokens) as number | undefined,
        topP: body.top_p as number | undefined,
        maxRetries: 0,
      });

      const promptTokens = result.usage.inputTokens ?? 0;
      const completionTokens = result.usage.outputTokens ?? 0;

      logUsage({
        userId,
        apiKeyId,
        model: id,
        provider,
        promptTokens,
        completionTokens,
        pricing,
        tier: autoRouted ? routingTier : null,
        autoRouted,
      }).catch((err) => console.error("[gateway] Usage logging failed:", err));

      const headers = {
        ...commonHeaders,
        [ROUTE_HEADERS.model]: id,
        ...(routingConfidence !== null
          ? { [ROUTE_HEADERS.confidence]: routingConfidence.toFixed(3) }
          : {}),
      };

      return NextResponse.json(
        {
          id: `chatcmpl-${crypto.randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: id,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: result.text },
              finish_reason: result.finishReason === "stop" ? "stop" : result.finishReason,
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens:
              result.usage.totalTokens ?? promptTokens + completionTokens,
          },
        },
        { headers },
      );
    } catch (err) {
      lastErr = err;
      if (autoRouted && isRetryableGatewayError(err)) {
        console.warn(`[gateway] Model ${id} failed, trying next candidate:`, err);
        continue;
      }
      if (autoRouted) {
        continue;
      }
      break;
    }
  }

  console.error("[gateway] Provider error:", lastErr);
  const message =
    lastErr instanceof Error ? lastErr.message : "Upstream provider error";
  return NextResponse.json(
    { error: { message, type: "api_error" } },
    { status: 502 },
  );
}

async function handleStreaming(params: {
  userId: string;
  apiKeyId: string;
  messages: ModelMessage[];
  body: Record<string, unknown>;
  candidateModelIds: string[];
  autoRouted: boolean;
  routingTier: string | null;
  routingConfidence: number | null;
  commonHeaders: Record<string, string>;
}): Promise<Response> {
  const {
    userId,
    apiKeyId,
    messages,
    body,
    candidateModelIds,
    autoRouted,
    routingTier,
    routingConfidence,
    commonHeaders,
  } = params;

  let lastErr: unknown;
  for (const modelId of candidateModelIds) {
    let resolved: ReturnType<typeof resolveModel>;
    try {
      resolved = resolveModel(modelId);
    } catch {
      continue;
    }
    const { provider, modelId: id, pricing } = resolved;
    const model = gateway(`${provider}/${id}`);

    try {
      const result = streamText({
        model,
        messages,
        temperature: body.temperature as number | undefined,
        maxOutputTokens: (body.max_tokens ?? body.max_completion_tokens) as number | undefined,
        topP: body.top_p as number | undefined,
        maxRetries: 0,
        onFinish({ usage }) {
          logUsage({
            userId,
            apiKeyId,
            model: id,
            provider,
            promptTokens: usage.inputTokens ?? 0,
            completionTokens: usage.outputTokens ?? 0,
            pricing,
            tier: autoRouted ? routingTier : null,
            autoRouted,
          }).catch((err) => console.error("[gateway] Usage logging failed:", err));
        },
      });

      const headers: Record<string, string> = {
        ...commonHeaders,
        [ROUTE_HEADERS.model]: id,
        ...(routingConfidence !== null
          ? { [ROUTE_HEADERS.confidence]: routingConfidence.toFixed(3) }
          : {}),
      };

      return result.toTextStreamResponse({ headers });
    } catch (err) {
      lastErr = err;
      if (autoRouted && isRetryableGatewayError(err)) {
        console.warn(`[gateway] Stream start failed for ${id}, trying next:`, err);
        continue;
      }
      if (autoRouted) {
        continue;
      }
      break;
    }
  }

  console.error("[gateway] Provider error:", lastErr);
  const message =
    lastErr instanceof Error ? lastErr.message : "Upstream provider error";
  return NextResponse.json(
    { error: { message, type: "api_error" } },
    { status: 502 },
  );
}
