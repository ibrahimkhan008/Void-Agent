import { createHash, randomBytes } from "node:crypto";

export const normalizeInvitationEmail = (email: string) =>
  email.trim().toLowerCase();

export const createTeamInvitationToken = () =>
  randomBytes(32).toString("base64url");

export const hashTeamInvitationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const hashTeamInvitationEmail = (email: string) =>
  createHash("sha256").update(normalizeInvitationEmail(email)).digest("hex");

export const TEAM_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
