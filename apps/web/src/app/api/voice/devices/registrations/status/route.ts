import { getSession } from "auth/server";
import { voiceDeviceCustomRepository } from "lib/db/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 });
  const registrationId = new URL(request.url).searchParams.get(
    "registrationId",
  );
  if (!registrationId || !/^[0-9a-f-]{36}$/i.test(registrationId))
    return new Response("Invalid registration", { status: 400 });
  try {
    const registration =
      await voiceDeviceCustomRepository.getOtaRegistrationForUser(
        registrationId,
        session.user.id,
      );
    if (!registration) return new Response("Not found", { status: 404 });
    return Response.json(
      {
        registrationId: registration.id,
        status:
          registration.expiresAt <= new Date() &&
          registration.status === "pending"
            ? "expired"
            : registration.status,
        deviceId: registration.deviceId,
        displayName: registration.displayName,
        expiresAt: registration.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not load registration status" },
      { status: 503 },
    );
  }
}
