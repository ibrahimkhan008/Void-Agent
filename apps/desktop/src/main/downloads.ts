import { Notification, type Session, app } from "electron";
import {
  downloadDefaultPath,
  safeDownloadUrlLabel,
  sanitizeDownloadFilename,
} from "./download-paths.js";
import { isAppDownloadUrl } from "./external-links.js";

/** Give every native Electron download a Save As prompt and prevent error JSON from being saved as a file. */
export function registerDesktopDownloads(
  targetSession: Session,
  appOrigin: string,
) {
  targetSession.on("will-download", (_event, item) => {
    const url = item.getURL();
    const filename = sanitizeDownloadFilename(item.getFilename());
    if (
      item.getMimeType().toLowerCase().startsWith("application/json") &&
      isAppDownloadUrl(url, appOrigin)
    ) {
      item.cancel();
      showDownloadNotification(filename, false);
      return;
    }

    item.setSaveDialogOptions({
      defaultPath: downloadDefaultPath(app.getPath("downloads"), filename),
    });
    const safeUrl = safeDownloadUrlLabel(url);
    item.once("done", (_doneEvent, state) => {
      if (state === "completed") showDownloadNotification(filename, true);
      else if (state === "interrupted") {
        console.warn(`[desktop] download interrupted: ${safeUrl}`);
        showDownloadNotification(filename, false);
      }
    });
  });
}

function showDownloadNotification(filename: string, completed: boolean) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: completed ? "Download complete" : "Download failed",
    body: completed
      ? `${filename} was saved.`
      : `${filename} could not be downloaded.`,
  });
  notification.show();
}
