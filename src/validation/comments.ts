import { z } from "zod";
import { validateAndParseXPostUrl } from "../utils/url";

export const DiscoverCommentsSchema = z.object({
  postUrl: z
    .string()
    .min(1, "Post URL is required")
    .refine((url) => validateAndParseXPostUrl(url).valid, {
      message: "Must be a valid X post URL (e.g. https://x.com/user/status/123456)",
    }),
  maxComments: z
    .number()
    .int()
    .positive()
    .max(500, "Maximum 500 comments per discovery run allowed")
    .default(300),
  maxScrolls: z
    .number()
    .int()
    .positive()
    .max(200)
    .default(120),
  excludedUsernames: z.array(z.string()).optional(),
});

export type DiscoverCommentsSchemaType = z.infer<typeof DiscoverCommentsSchema>;

export const ReplyCommentsSchema = z.object({
  postUrl: z.string().url("Must be a valid URL"),
  comments: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        authorUsername: z.string(),
        authorDisplayName: z.string().optional(),
        text: z.string(),
        parentPostId: z.string(),
        isSelected: z.boolean().default(true),
      })
    )
    .min(1, "At least one selected comment is required")
    .max(500, "Maximum 500 comments allowed per job"),
  reply: z
    .string()
    .min(1, "Reply message cannot be empty")
    .max(280, "Reply message cannot exceed 280 characters")
    .transform((v) => v.trim()),
  confirmationMode: z.enum(["per-comment", "batch"]).default("batch"),
  excludedUsernames: z.array(z.string()).optional(),
});

export type ReplyCommentsSchemaType = z.infer<typeof ReplyCommentsSchema>;

