import { UserPreferencesZodSchema } from "app-types/user";
import { withAuth } from "auth/route-guard";
import { userRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, session) => {
  try {
    const preferences = await userRepository.getPreferences(session.user.id);
    return NextResponse.json(preferences ?? {});
  } catch (error) {
    console.error("Failed to get preferences:", error);
    return NextResponse.json(
      { error: "Failed to get preferences" },
      { status: 500 },
    );
  }
});

export const PUT = withAuth(async (request: Request, session) => {
  try {
    const json = await request.json();
    const parsedPreferences = UserPreferencesZodSchema.safeParse(json);
    if (!parsedPreferences.success) {
      return Response.json({ error: "Invalid preferences" }, { status: 400 });
    }
    const existingPreferences =
      (await userRepository.getPreferences(session.user.id)) ?? {};
    const updatedUser = await userRepository.updatePreferences(
      session.user.id,
      { ...existingPreferences, ...parsedPreferences.data },
    );
    return NextResponse.json({
      success: true,
      preferences: updatedUser.preferences,
    });
  } catch (error) {
    console.error("Failed to update preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 },
    );
  }
});
