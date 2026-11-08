"use client";

import { prepareMcpToolResult } from "lib/ai/mcp/mcp-result-media";
import React from "react";
import JsonView from "ui/json-view";
import { MorphikImagePreviewCard } from "./morphik-image-preview";

export function McpToolResult({ result }: { result: unknown }) {
  const {
    displayResult,
    imagePreviews,
    audioPreviews,
    resourceLinks,
    morphikPreviews,
    isError,
  } = prepareMcpToolResult(result);

  return (
    <div className="space-y-3">
      {isError && (
        <p role="status" className="text-destructive">
          The MCP server reported that this tool call failed. Review its
          response below.
        </p>
      )}
      {imagePreviews.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="MCP image results">
          {imagePreviews.map((image, index) => (
            // Inline data is restricted to bounded raster image types by the
            // result adapter; server-provided URLs are never fetched here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${image.mimeType}-${index}`}
              src={image.src}
              alt={`Image result ${index + 1}`}
              loading="lazy"
              className="max-h-72 max-w-full rounded-md border object-contain"
            />
          ))}
        </div>
      )}
      {audioPreviews.length > 0 && (
        <div className="space-y-2" aria-label="MCP audio results">
          {audioPreviews.map((audio, index) => (
            <audio
              key={`${audio.mimeType}-${index}`}
              controls
              preload="none"
              aria-label={`Audio result ${index + 1}`}
              className="max-w-full"
            >
              <source src={audio.src} type={audio.mimeType} />
            </audio>
          ))}
        </div>
      )}
      {resourceLinks.length > 0 && (
        <ul aria-label="MCP resource links" className="space-y-2">
          {resourceLinks.map((resource, index) => (
            <li key={`${resource.href}-${index}`}>
              <a
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm font-medium text-primary underline underline-offset-4"
              >
                {resource.label}
              </a>
              <span className="ml-2 text-xs text-muted-foreground">
                ({resource.host})
              </span>
              {resource.description && (
                <p className="text-xs text-muted-foreground">
                  {resource.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {morphikPreviews.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Morphik image results"
        >
          {morphikPreviews.map((preview, index) => (
            <MorphikImagePreviewCard
              key={`${preview.previewRef ?? preview.url ?? "image"}-${index}`}
              preview={preview}
            />
          ))}
        </div>
      )}
      <JsonView data={displayResult} />
    </div>
  );
}
