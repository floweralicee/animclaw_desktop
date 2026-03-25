/**
 * Stripe manages trial lifecycle automatically — when a trial ends it
 * transitions the subscription to "active" (or "past_due" / "canceled").
 * We only need to check the status string here.
 */
export function isSubscriptionActive(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "trialing";
}
