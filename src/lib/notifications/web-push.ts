import "server-only";

import { notificationRepository } from "lib/db/repository";
import { assertPublicWebhookUrl } from "lib/webhooks/url-guard";
import webpush from "web-push";

const vapid = () => ({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT });
export const isWebPushConfigured = () => {
  const config = vapid();
  return Boolean(config.publicKey && config.privateKey && config.subject);
};

export const getVapidPublicKey = () => vapid().publicKey ?? null;

export const sendPushToUser = async (userId: string, payload: { title: string; body: string; href?: string | null }) => {
  if (!isWebPushConfigured()) return { sent: 0, skipped: true };
  const config = vapid();
  webpush.setVapidDetails(config.subject!, config.publicKey!, config.privateKey!);
  const subscriptions = await notificationRepository.listPushSubscriptions(userId);
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      // Push endpoints are user-controlled server egress targets. Repeat the
      // DNS/public-address validation immediately before every send.
      await assertPublicWebhookUrl(subscription.endpoint);
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: payload.title.slice(0, 160), body: payload.body.slice(0, 500), href: payload.href ?? "/" }), { TTL: 60 * 60 });
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) await notificationRepository.deletePushSubscription(userId, subscription.endpoint);
    }
  }
  return { sent, skipped: false };
};
