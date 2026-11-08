/** Upper bounds for copying a conversation prefix into a fork. */
export const MAX_FORK_MESSAGES = 200;
export const MAX_FORK_CONTENT_BYTES = 5 * 1024 * 1024;

export type ForkSnapshotLimits = {
  messageCount: number;
  contentBytes: number;
};

export class ForkSnapshotLimitError extends Error {
  constructor() {
    super(
      `Fork prefix exceeds limits (${MAX_FORK_MESSAGES} messages or ${MAX_FORK_CONTENT_BYTES} bytes)`,
    );
    this.name = "ForkSnapshotLimitError";
  }
}

export function exceedsForkSnapshotLimits({
  messageCount,
  contentBytes,
}: ForkSnapshotLimits): boolean {
  return (
    messageCount > MAX_FORK_MESSAGES || contentBytes > MAX_FORK_CONTENT_BYTES
  );
}
