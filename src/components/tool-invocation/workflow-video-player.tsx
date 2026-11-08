"use client";

import { useEffect, useRef, useState } from "react";
import {
  type WorkflowVideoMedia,
  createSafeHlsRequest,
  getWorkflowVideoPlaybackMode,
  isSameOriginWorkflowVideo,
  safeWorkflowVideoUrl,
} from "./workflow-video-media";

const HLS_MIME = "application/vnd.apple.mpegurl";

export function WorkflowVideoPlayer({ media }: { media: WorkflowVideoMedia }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const source = safeWorkflowVideoUrl(media.url);
    if (!video || !source) {
      setError("This workflow video URL is not allowed.");
      setIsLoading(false);
      return;
    }

    let disposed = false;
    video.setAttribute("referrerpolicy", "no-referrer");
    const cleanVideo = () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };

    setIsLoading(true);
    setError(null);

    const mode = getWorkflowVideoPlaybackMode(source, {
      nativeHls:
        Boolean(video.canPlayType(HLS_MIME)) &&
        isSameOriginWorkflowVideo(source, window.location.origin),
      hlsJs: false,
    });

    if (mode === "invalid") {
      setError("This workflow video URL is not allowed.");
      setIsLoading(false);
      return cleanVideo;
    }

    if (mode === "direct") {
      video.src = source;
      video.load();
      return cleanVideo;
    }

    // Prefer hls.js where supported, but fail closed if the manifest or any
    // child playlist/segment attempts to leave the validated HTTPS origin.
    void import("hls.js")
      .then(({ default: Hls, FetchLoader }) => {
        if (disposed) return;
        const playbackMode = getWorkflowVideoPlaybackMode(source, {
          nativeHls:
            Boolean(video.canPlayType(HLS_MIME)) &&
            isSameOriginWorkflowVideo(source, window.location.origin),
          hlsJs: Hls.isSupported(),
        });
        if (playbackMode === "hlsjs") {
          const hls = new Hls({
            loader: FetchLoader,
            enableWorker: true,
            lowLatencyMode: false,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferSize: 30 * 1024 * 1024,
            backBufferLength: 30,
            manifestLoadingMaxRetry: 2,
            fragLoadingMaxRetry: 2,
            xhrSetup: (xhr, url) => {
              if (!isSameOriginWorkflowVideo(url, new URL(source).origin)) {
                throw new Error("Blocked HLS resource outside manifest origin");
              }
              xhr.withCredentials = false;
            },
            fetchSetup: (context, init) =>
              createSafeHlsRequest(context.url, source, init),
          });
          hlsRef.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!disposed) setIsLoading(false);
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (disposed || !data.fatal) return;
            setError("This workflow video could not be played.");
            setIsLoading(false);
            hls.destroy();
            if (hlsRef.current === hls) hlsRef.current = null;
          });
          hls.loadSource(source);
          hls.attachMedia(video);
          return;
        }

        if (playbackMode === "native-hls") {
          video.src = source;
          video.load();
          setIsLoading(false);
          return;
        }
        setError("HLS video playback is not supported in this browser.");
        setIsLoading(false);
      })
      .catch(() => {
        if (!disposed) {
          setError("This workflow video could not be played.");
          setIsLoading(false);
        }
      });

    return () => {
      disposed = true;
      cleanVideo();
    };
  }, [media.url]);

  return (
    <div className="relative w-full">
      {isLoading && media.poster ? (
        <img
          className="absolute inset-0 h-full max-h-[480px] w-full rounded-lg object-cover"
          src={media.poster}
          alt="Workflow video preview"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg border p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : (
        <video
          ref={videoRef}
          className="max-h-[480px] w-full rounded-lg border bg-black"
          controls
          preload="metadata"
          playsInline
          poster={safeWorkflowVideoUrl(media.poster)}
          aria-label="Workflow generated video"
          onLoadedData={() => setIsLoading(false)}
          onError={() => {
            setError("This workflow video could not be played.");
            setIsLoading(false);
          }}
        />
      )}
    </div>
  );
}
