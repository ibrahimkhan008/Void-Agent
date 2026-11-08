export type ImageMaskMessagePart = {
  type: "data-image-mask";
  data: {
    sourceFileId: string;
    maskFileId: string;
    sourceUrl: string;
    maskUrl: string;
  };
};

/** Persist an explicit source/mask pair in the user message history. */
export function createImageMaskMessagePart(args: {
  sourceFileId: string;
  maskFileId: string;
  sourceUrl: string;
  maskUrl: string;
}): ImageMaskMessagePart {
  if (
    !args.sourceFileId ||
    !args.maskFileId ||
    args.sourceFileId === args.maskFileId ||
    !args.sourceUrl ||
    !args.maskUrl
  ) {
    throw new Error(
      "An image mask must be paired with its exact source image.",
    );
  }
  return { type: "data-image-mask", data: { ...args } };
}
