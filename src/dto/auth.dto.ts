import * as z from "zod";

export type SignInDto = z.infer<typeof signInDto>;
export type RegisterDto = z.infer<typeof registerDto>;

export const signInDto = z.object({
  login: z.string().trim(),
  password: z.string().trim(),
});

export const registerDto = z.object({
  name: z.string().trim(),
  password: z.string().trim(),
  email: z.string().email().trim(),
});