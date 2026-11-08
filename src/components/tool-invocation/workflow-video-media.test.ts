import { describe, expect, it } from "vitest";
import {
  createSafeHlsRequest,
  extractWorkflowVideoMedia,
  getWorkflowVideoPlaybackMode,
  isAllowedHlsResourceUrl,
  isSameOriginWorkflowVideo,
  safeWorkflowVideoUrl,
} from "./workflow-video-media";

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

  it("chooses direct, HLS.js, native-HLS, or unsupported playback safely", () => {
    expect(
      getWorkflowVideoPlaybackMode("https://cdn.example/clip.mp4", {
        nativeHls: false,
        hlsJs: false,
      }),
    ).toBe("direct");
    expect(
      getWorkflowVideoPlaybackMode("https://cdn.example/clip.m3u8", {
        nativeHls: false,
        hlsJs: true,
      }),
    ).toBe("hlsjs");
    expect(
      getWorkflowVideoPlaybackMode("https://cdn.example/clip.m3u8", {
        nativeHls: true,
        hlsJs: false,
      }),
    ).toBe("native-hls");
    expect(
      getWorkflowVideoPlaybackMode("https://cdn.example/clip.m3u8", {
        nativeHls: false,
        hlsJs: false,
      }),
    ).toBe("unsupported");
    expect(
      getWorkflowVideoPlaybackMode("https://127.0.0.1/clip.m3u8", {
        nativeHls: true,
        hlsJs: true,
      }),
    ).toBe("invalid");
  });

  it("rejects local, IP-literal, credentialed, non-HTTPS, and nonstandard-port media URLs", () => {
    for (const url of [
      "http://cdn.example/clip.mp4",
      "https://user:pass@cdn.example/clip.mp4",
      "https://127.0.0.1/clip.mp4",
      "https://2130706433/clip.mp4",
      "https://[::1]/clip.mp4",
      "https://router.local./clip.mp4",
      "https://service.internal/clip.mp4",
      "https://cdn.example:8443/clip.mp4",
    ]) {
      expect(safeWorkflowVideoUrl(url)).toBeUndefined();
    }
  });

  it("allows HLS child resources only from the validated manifest origin", () => {
    const manifest = "https://cdn.example/media/index.m3u8";
    expect(
      isAllowedHlsResourceUrl(
        "https://cdn.example/media/segment-1.ts",
        manifest,
      ),
    ).toBe(true);
    expect(isAllowedHlsResourceUrl("/media/segment-1.ts", manifest)).toBe(
      false,
    );
    expect(
      isAllowedHlsResourceUrl("https://other.example/segment-1.ts", manifest),
    ).toBe(false);
    expect(
      isAllowedHlsResourceUrl("https://127.0.0.1/segment-1.ts", manifest),
    ).toBe(false);
  });

  it("blocks redirects/credentials and limits native HLS to the app origin", () => {
    const manifest = "https://cdn.example/media/index.m3u8";
    const request = createSafeHlsRequest(
      "https://cdn.example/media/segment-1.ts",
      manifest,
      { method: "GET" },
    );
    expect(request.credentials).toBe("omit");
    expect(request.redirect).toBe("error");
    expect(request.referrerPolicy).toBe("no-referrer");
    expect(() =>
      createSafeHlsRequest("https://other.example/segment.ts", manifest, {}),
    ).toThrow("Blocked HLS resource");
    expect(isSameOriginWorkflowVideo(manifest, "https://app.example")).toBe(
      false,
    );
    expect(
      isSameOriginWorkflowVideo(
        "https://app.example/media/index.m3u8",
        "https://app.example",
      ),
    ).toBe(true);
  });
});
