/**
 * Server-side SSE event encoder + client-side parser. Used by the M12
 * planning chatbot route + the M12 ChatPanel client component, and reused
 * by M13/M14/M16/M18 chat flows.
 *
 * Wire format (one event per `data:` line, JSON payload):
 *   data: {"type":"text_delta","text":"hello"}\n\n
 *   data: {"type":"tool_use_start","id":"toolu_01","name":"set_week_focus","input":{...}}\n\n
 *   data: {"type":"tool_result","id":"toolu_01","ok":true,"payload":{...}}\n\n
 *   data: {"type":"message_done","usage":{"input_tokens":120,"output_tokens":85,"total_usd":0.0008}}\n\n
 *   data: {"type":"signal_done"}\n\n
 *   data: {"type":"cost_blocked","reason":"Daily cap exceeded"}\n\n
 *   data: {"type":"lock_busy","try_again_in_ms":5000}\n\n
 *   data: {"type":"error","code":"...","message":"..."}\n\n
 */

export type SseEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; ok: boolean; payload?: unknown; reason?: string }
  | {
      type: 'message_done';
      usage: { input_tokens: number; output_tokens: number; total_usd: number };
    }
  | { type: 'signal_done' }
  | {
      type: 'cost_blocked';
      reason: string;
      todayUsd: number;
      monthUsd: number;
      dailyCapUsd: number;
      monthlyCapUsd: number;
    }
  | { type: 'lock_busy'; try_again_in_ms: number }
  | { type: 'error'; code: string; message: string };

/** Encode an SSE event as a Uint8Array ready to push into a ReadableStream. */
export function encodeSseEvent(event: SseEvent): Uint8Array {
  const json = JSON.stringify(event);
  return new TextEncoder().encode(`data: ${json}\n\n`);
}

/** SSE response headers. */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Disable Nginx/Vercel buffering so events flush as they're written.
  'X-Accel-Buffering': 'no',
} as const;

/**
 * Client-side parser. Iterates a `ReadableStream<Uint8Array>` (e.g. from
 * `fetch().body`) and yields parsed SseEvent objects. Handles partial
 * frames across chunk boundaries.
 */
export async function* parseSseEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let frameEnd = buffer.indexOf('\n\n');
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      const dataLine = frame
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice('data: '.length);
      if (dataLine) {
        try {
          yield JSON.parse(dataLine) as SseEvent;
        } catch {
          // Malformed event; skip.
        }
      }
      frameEnd = buffer.indexOf('\n\n');
    }
  }
}
