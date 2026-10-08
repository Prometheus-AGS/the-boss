/** Configure environment and explicitly register this file before use. No SMTP daemon required. */
export default async function run(event, { signal, idempotencyKey, env }) {
  const { CADENCE_EMAIL_API_URL: endpoint, CADENCE_EMAIL_API_TOKEN: token, CADENCE_EMAIL_FROM: from, CADENCE_EMAIL_TO: to } = env;
  if (!endpoint || !token || !from || !to) return { status: 'failed', effects: 'none' };
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') return { status: 'failed', effects: 'none' };
  const response = await fetch(url, {
    method: 'POST', signal,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ from, to: to.split(',').map(value => value.trim()), subject: `Delivery ${event.type}: ${event.outcome}`, text: `Run ${event.runId}; iteration ${event.iterationIndex}.\nOutcome: ${event.outcome}.\nEvent: ${event.id}` }),
  });
  // Customize the request body for your provider. Never return its response body or credentials.
  if (!response.ok) throw new Error('Email provider did not confirm acceptance.');
  return { status: 'succeeded' };
}
