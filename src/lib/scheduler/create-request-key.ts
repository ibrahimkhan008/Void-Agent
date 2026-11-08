export type ScheduleCreateRequestKey = {
  payload: string;
  key: string;
};

/** Reuse an idempotency key only for an identical create payload. */
export function getScheduleCreateRequestKey(
  current: ScheduleCreateRequestKey | null,
  payload: string,
  createKey: () => string,
): ScheduleCreateRequestKey {
  if (current?.payload === payload) return current;
  return { payload, key: createKey() };
}
