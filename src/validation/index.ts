import { z } from "zod";
import { validateAndParseXPostUrl } from "../utils/url";

export const CreateJobSchema = z.object({
  reply: z
    .string()
    .min(1, "Reply message cannot be empty")
    .max(280, "Reply message cannot exceed 280 characters")
    .transform((val) => val.trim()),
  urls: z
    .array(z.string())
    .min(1, "At least one X post URL is required")
    .max(20, "Maximum 20 post URLs allowed per job")
    .refine(
      (urls) => {
        return urls.every((url) => validateAndParseXPostUrl(url).valid);
      },
      { message: "One or more URLs are invalid X post URLs" }
    ),
  confirmationMode: z.enum(["per-post", "batch"]).default("per-post"),
  type: z.enum(["post_reply", "comment_reply"]).optional().default("post_reply"),
  excludedUsernames: z.array(z.string()).optional(),
});

export type CreateJobSchemaType = z.infer<typeof CreateJobSchema>;

export * from "./comments";

