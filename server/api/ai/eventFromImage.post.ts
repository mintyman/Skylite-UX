import { useRuntimeConfig } from "#imports";
import { extractEventFromImage } from "~~/server/utils/aiEventFromImage";
import { createError, defineEventHandler, readMultipartFormData } from "h3";

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  if (!config.ai?.apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "AI is not configured on the server",
    });
  }

  const formData = await readMultipartFormData(event);
  const file = formData?.find(
    part => part.name === "image" && part.data && part.data.length > 0,
  );
  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: "No image file provided. Send multipart form data with an 'image' field.",
    });
  }

  if (file.data.length > MAX_IMAGE_SIZE) {
    throw createError({
      statusCode: 413,
      statusMessage: "Image is too large. Maximum size is 15MB.",
    });
  }

  const mimeType = file.type?.startsWith("image/") ? file.type : "image/jpeg";

  try {
    const extracted = await extractEventFromImage({
      imageData: file.data,
      mimeType,
      apiKey: config.ai.apiKey,
      model: config.ai.model || "gemini-flash-latest",
    });
    return { event: extracted };
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `AI extraction failed: ${(error as Error).message}`,
    });
  }
});
