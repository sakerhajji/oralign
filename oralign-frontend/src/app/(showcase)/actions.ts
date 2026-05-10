"use server";

import { z } from "zod";

const ContactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  organization: z.string().max(200).optional(),
  message: z.string().min(1).max(2000),
});

export type ContactInput = z.infer<typeof ContactSchema>;

export async function submitContact(input: ContactInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }
  return { ok: true };
}
