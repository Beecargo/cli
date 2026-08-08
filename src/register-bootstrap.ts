import { callApi, type ApiResult } from "./api-client.js";
import { solveAgentRegisterPow } from "./agent-register-pow.js";

const REGISTER_ATTEMPTS = 3;

type RegisterBody = {
  key?: string;
  key_prefix?: string;
  tier?: string;
  note?: string;
  error_code?: string;
};

function isRetryablePowFailure(status: number, body: unknown): boolean {
  if (status === 429) return false;
  if (status !== 400) return false;
  if (!body || typeof body !== "object") return true;
  const code = (body as { error_code?: unknown }).error_code;
  if (typeof code !== "string") return true;
  return (
    code === "pow_required" ||
    code === "invalid_challenge" ||
    code === "expired_challenge" ||
    code === "insufficient_work" ||
    code === "pow_reused" ||
    code === "ip_mismatch"
  );
}

/** Challenge + easy PoW + register, with a few fresh-challenge retries. */
export async function registerBootstrapAgent(
  label: string,
): Promise<ApiResult<RegisterBody>> {
  let last: ApiResult<RegisterBody> = {
    ok: false,
    status: 500,
    body: { error_code: "register_failed" } as RegisterBody,
  };

  for (let attempt = 0; attempt < REGISTER_ATTEMPTS; attempt += 1) {
    const challenge = await callApi<{
      challenge_id?: string;
      difficulty?: number;
    }>({
      apiKey: null,
      method: "POST",
      path: "/agent/register/challenge",
    });
    if (
      !challenge.ok ||
      !challenge.body.challenge_id ||
      typeof challenge.body.difficulty !== "number"
    ) {
      last = {
        ok: false,
        status: challenge.status,
        body: challenge.body as RegisterBody,
      };
      if (challenge.status === 429) return last;
      continue;
    }

    let nonce: string;
    try {
      nonce = solveAgentRegisterPow(
        challenge.body.challenge_id,
        challenge.body.difficulty,
      );
    } catch {
      continue;
    }

    const result = await callApi<RegisterBody>({
      apiKey: null,
      method: "POST",
      path: "/agent/register",
      body: {
        label,
        challenge_id: challenge.body.challenge_id,
        nonce,
      },
    });
    last = result;
    if (result.ok) return result;
    if (!isRetryablePowFailure(result.status, result.body)) return result;
  }

  return last;
}
