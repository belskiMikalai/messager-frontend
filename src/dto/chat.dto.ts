import * as z from "zod";

export type ChatDto = z.infer<typeof chatDto>;

export const chatDto = z.object({
  name: z.string().trim(),
  users: z.array(z.number().int()),
});