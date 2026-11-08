import { passwordSchema } from "lib/validations/password";
import { userNameSchema } from "lib/validations/user-name";
import { z } from "zod";

import { getSession } from "auth/server";
import { UserEntity } from "lib/db/pg/schema.pg";

export type UserPreferences = {
  displayName?: string;
  profession?: string; // User's job or profession
  responseStyleExample?: string; // Example of preferred response style
  botName?: string; // Name of the bot
  savedNotes?: SavedNote[];
  skills?: UserSkill[];
  notifications?: {
    backgroundChatAlerts?: boolean;
    chatAlertsOnlyWhenAway?: boolean;
  };
  onboarding?: OnboardingPreference;
};

export const OnboardingStepSchema = z.enum([
  "automation_overview",
  "connect_tools",
  "done",
  // Read legacy progress written by the older Rube-backed wizard.
  "connect_rube",
]);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const OnboardingPreferenceSchema = z
  .object({
    step: OnboardingStepSchema,
    completedAt: z.string().datetime().optional(),
  })
  .strict();
export type OnboardingPreference = z.infer<typeof OnboardingPreferenceSchema>;

export type SavedNoteCitation = {
  id: number;
  title: string;
  url: string;
};

export type SavedNote = {
  id: string;
  title: string;
  markdown: string;
  citations: SavedNoteCitation[];
  createdAt: string;
  updatedAt: string;
};

export type UserSkill = {
  id: string;
  name: string;
  markdown: string;
  description?: string;
  source?: string;
  slug?: string;
  license?: string;
  licenseNotice?: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
};

// user without password
export interface User extends Omit<UserEntity, "password"> {
  preferences: UserPreferences | null;
  lastLogin?: Date | null;
}

export type BasicUser = Omit<
  User,
  | "password"
  | "preferences"
  | "image"
  | "role"
  | "tier"
  | "banned"
  | "banReason"
  | "banExpires"
  | "createdIp"
  | "lastIp"
> & {
  image?: string | null;
  role?: string | null;
  tier?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
  createdIp?: string | null;
  lastIp?: string | null;
};

export interface BasicUserWithLastLogin extends BasicUser {
  lastLogin: Date | null;
}

export type UserSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type UserSessionUser = UserSession["user"];

export type UserRepository = {
  existsByEmail: (email: string) => Promise<boolean>;
  updateUserDetails: (data: {
    userId: string;
    name?: string;
    email?: string;
    image?: string;
  }) => Promise<User>;

  updatePreferences: (
    userId: string,
    preferences: UserPreferences,
  ) => Promise<User>;
  updateOnboardingPreference: (
    userId: string,
    onboarding: OnboardingPreference,
  ) => Promise<User>;
  getPreferences: (userId: string) => Promise<UserPreferences | null>;
  getUserById: (userId: string) => Promise<BasicUserWithLastLogin | null>;
  getUserCount: () => Promise<number>;
  getUserStats: (userId: string) => Promise<{
    threadCount: number;
    messageCount: number;
    modelStats: Array<{
      model: string;
      messageCount: number;
      totalTokens: number;
    }>;
    totalTokens: number;
    generatedImageCount: number;
    period: string;
  }>;
  getUserAuthMethods: (userId: string) => Promise<{
    hasPassword: boolean;
    oauthProviders: string[];
  }>;
};

export const UserZodSchema = z.object({
  name: userNameSchema,
  email: z.string().email(),
  password: passwordSchema,
});

export const UserPreferencesZodSchema = z.object({
  displayName: z.string().optional(),
  profession: z.string().optional(),
  responseStyleExample: z.string().optional(),
  botName: z.string().optional(),
  notifications: z
    .object({
      backgroundChatAlerts: z.boolean().optional(),
      chatAlertsOnlyWhenAway: z.boolean().optional(),
    })
    .optional(),
  onboarding: OnboardingPreferenceSchema.optional(),
});
