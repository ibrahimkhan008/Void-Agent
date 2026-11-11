import { passwordSchema } from "lib/validations/password";
import { z } from "zod";

import { getSession } from "auth/server";
import { UserEntity } from "lib/db/pg/schema.pg";

export type OnboardingStep =
  | "automation_overview"
  | "connect_rube"
  | "connect_tools"
  | "done";

export type UserPreferences = {
  displayName?: string;
  profession?: string; // User's job or profession
  responseStyleExample?: string; // Example of preferred response style
  botName?: string; // Name of the bot

  // Local models configuration (Ollama / LM Studio / OpenAI-compatible)
  localModels?: {
    enabled: boolean;
    type: "ollama" | "lmstudio" | "openai_compatible";
    baseUrl: string; // e.g., "http://localhost:11434"
    apiKey?: string; // Required for openai_compatible (e.g. Xinity), stored server-side only
    models: Array<{
      id: string;
      name: string;
      size?: number;
      details?: any;
    }>;
    lastSync: string; // ISO timestamp
  };

  // Onboarding flow state
  onboarding?: {
    step: OnboardingStep;
    rubeServerId?: string; // mcp_server.id for the Rube entry
    completedAt?: string; // ISO timestamp when onboarding finished
  };

  notifications?: {
    desktopEnabled: boolean;
    onlyWhenAway: boolean;
    hideTaskDetails: boolean;
    weeklyEngagementEnabled: boolean;
  };

  /** Private assistant responses saved by this user. */
  savedNotes?: SavedNote[];
};

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
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
});

export const UserPreferencesZodSchema = z.object({
  displayName: z.string().optional(),
  profession: z.string().optional(),
  responseStyleExample: z.string().optional(),
  botName: z.string().optional(),
  localModels: z
    .object({
      enabled: z.boolean(),
      type: z.enum(["ollama", "lmstudio", "openai_compatible"]),
      baseUrl: z.string(),
      apiKey: z.string().optional(),
      models: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          size: z.number().optional(),
          details: z.any().optional(),
        }),
      ),
      lastSync: z.string(),
    })
    .optional(),
  onboarding: z
    .object({
      step: z.enum([
        "automation_overview",
        "connect_rube",
        "connect_tools",
        "done",
      ]),
      rubeServerId: z.string().optional(),
      completedAt: z.string().optional(),
    })
    .optional(),
  notifications: z
    .object({
      desktopEnabled: z.boolean().default(true),
      onlyWhenAway: z.boolean().default(true),
      hideTaskDetails: z.boolean().default(false),
      weeklyEngagementEnabled: z.boolean().default(true),
    })
    .optional(),
  savedNotes: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        title: z.string().min(1).max(160),
        markdown: z.string().min(1).max(50_000),
        citations: z
          .array(
            z.object({
              id: z.number().int().positive(),
              title: z.string().max(500),
              url: z.string().url().max(2_048),
            }),
          )
          .max(50),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(100)
    .optional(),
});
