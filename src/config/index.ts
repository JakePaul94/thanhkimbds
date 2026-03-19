export const config = {
  port:      Number(process.env.PORT ?? 3000),
  wsPort:    Number(process.env.WS_PORT ?? 3001),
  nodeEnv:   process.env.NODE_ENV ?? "development",
  qdrant:    { url: process.env.QDRANT_URL!, collection: process.env.QDRANT_COLLECTION! },
  redis:     { url: process.env.REDIS_URL! },
  kling:     { apiKey: process.env.KLING_API_KEY! },
  runway:    { apiKey: process.env.RUNWAY_API_KEY! },
  facebook:  { profile: process.env.FACEBOOK_CHROME_PROFILE! },
  zalo:      { profile: process.env.ZALO_CHROME_PROFILE! },
  gemini: { apiKey: process.env.GEMINI_API_KEY! },
};
