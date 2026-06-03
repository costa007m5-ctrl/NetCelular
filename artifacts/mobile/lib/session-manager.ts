import { db } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";

export const PLANS = {
  trial:   { name: "Período de Teste", screens: 1, price: 0,     priceStr: "Grátis",    days: 3  },
  basic:   { name: "Plano Básico",     screens: 1, price: 7.50,  priceStr: "R$ 7,50",   days: 30 },
  normal:  { name: "Plano Normal",     screens: 2, price: 12.90, priceStr: "R$ 12,90",  days: 30 },
  premium: { name: "Plano Premium",    screens: 4, price: 19.90, priceStr: "R$ 19,90",  days: 30 },
} as const;

export type PlanKey = keyof typeof PLANS;
export type SessionCheckResult = "ok" | "trial_expired" | "plan_expired" | "limit_exceeded";

const WHATSAPP_NUMBER = "5596991718167";

export function getWhatsAppLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

let _currentToken: string | null = null;

export function getCurrentSessionToken() { return _currentToken; }

export async function checkAndStartSession(userId: string): Promise<SessionCheckResult> {
  try {
    let sub = await db.subscriptions.get(userId);

    if (!sub) {
      await db.subscriptions.create(userId, "trial");
      sub = await db.subscriptions.get(userId);
    }

    if (!sub) return "ok";

    if (sub.plan === "trial" && sub.trial_started_at) {
      const trialEnd = new Date(sub.trial_started_at).getTime() + 3 * 24 * 60 * 60 * 1000;
      if (Date.now() > trialEnd) return "trial_expired";
    }

    if (sub.plan !== "trial" && sub.plan_expires_at) {
      if (new Date(sub.plan_expires_at) < new Date()) return "plan_expired";
    }

    const screenLimit = PLANS[sub.plan as PlanKey]?.screens ?? 1;
    const deviceId = await getDeviceId();
    const result = await db.sessions.start(userId, deviceId, screenLimit);
    if (!result.allowed) return "limit_exceeded";
    _currentToken = result.token;
    return "ok";
  } catch {
    return "ok";
  }
}

export async function heartbeatSession() {
  if (!_currentToken) return;
  try { await db.sessions.heartbeat(_currentToken); } catch {}
}

export async function endSession() {
  if (!_currentToken) return;
  try { await db.sessions.end(_currentToken); } catch {}
  _currentToken = null;
}

export function getTrialDaysLeft(trialStartedAt: string | null | undefined): number {
  if (!trialStartedAt) return 3;
  const start = new Date(trialStartedAt).getTime();
  const end = start + 3 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function getPlanDisplayName(plan: string): string {
  return PLANS[plan as PlanKey]?.name ?? plan;
}
