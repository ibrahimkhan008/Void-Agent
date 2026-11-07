import { describe, expect, it } from "vitest";
import { extractWorkflowVideoMedia } from "./workflow-video-media";

describe("extractWorkflowVideoMedia", () => {
  it("renders reference legacy, n8n HLS, and direct video outputs", () => {
    expect(
      extractWorkflowVideoMedia({
        data: [
          {
            video_id: "v1",
            thumbnail_url: "https://cdn.example/poster.jpg",
            video_url: "https://cdn.example/a.mp4",
          },
          { body: { hls: { video_url: "https://cdn.example/b.m3u8" } } },
          { url: "https://cdn.example/c.webm" },
        ],
      }),
    ).toEqual([
      {
        url: "https://cdn.example/a.mp4",
        poster: "https://cdn.example/poster.jpg",
      },
      { url: "https://cdn.example/b.m3u8" },
      { url: "https://cdn.example/c.webm" },
    ]);
  });

  it("rejects insecure, credentialed, local, duplicate, and malformed media URLs", () => {
    expect(
      extractWorkflowVideoMedia({
        videos: [
          { video_url: "http://cdn.example/a.mp4" },
          { video_url: "https://user:pass@cdn.example/a.mp4" },
          { video_url: "https://localhost/a.mp4" },
          { video_url: "https://cdn.example/a.mp4" },
          { video_url: "https://cdn.example/a.mp4" },
          { video_url: "javascript:alert(1)" },
        ],
      }),
    ).toEqual([{ url: "https://cdn.example/a.mp4" }]);
  });

  it("bounds traversal and number of results", () => {
    const videos = Array.from({ length: 50 }, (_, index) => ({
      video_url: `https://cdn.example/${index}.mp4`,
    }));
    expect(extractWorkflowVideoMedia(videos)).toHaveLength(12);
    expect(extractWorkflowVideoMedia("https://cdn.example/a.mp4")).toEqual([]);
  });
});
