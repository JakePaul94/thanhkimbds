import { Langfuse } from "langfuse";

const lf = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl:   process.env.LANGFUSE_HOST,
});

export const tracer = {
  newTrace(p: { name: string; metadata?: Record<string, unknown> }) {
    return lf.trace(p);
  },
};
