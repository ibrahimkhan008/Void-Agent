import { z } from "zod";

export const createDevicePairingSchema = z
  .object({
    deviceType: z
      .literal("m5stack_atom_echo_s3r")
      .default("m5stack_atom_echo_s3r"),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const redeemDevicePairingSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    deviceType: z.literal("m5stack_atom_echo_s3r"),
    displayName: z.string().trim().min(1).max(80),
    firmwareVersion: z.string().trim().max(40).optional(),
  })
  .strict();

export const claimOtaRegistrationSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    displayName: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const completeOtaRegistrationSchema = z
  .object({
    registrationId: z.string().uuid(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    bootstrapSecret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
