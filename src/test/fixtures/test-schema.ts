import { createHttpSchema, z } from '../../shared';
import { errorUtil } from 'zod/lib/helpers/errorUtil';
import toString = errorUtil.toString;

export const testSchema = createHttpSchema({
  'GET /random-numbers': {
    responseBody: z.array(z.number()),
  },
  'POST /sum': {
    requestBody: z.array(z.number()),
    responseBody: z.number(),
  },
  'POST /product': {
    requestBody: z.array(z.number()),
    responseBody: z.number(),
  },
  'GET *': {
    requestBody: z.object({
      name: z.string(),
    }),
    responseBody: z.unknown(),
  },
  'GET /404': {
    responseBody: z.object({ error: z.string() }),
  },
  'PUT /multiply': {
    requestBody: z.object({ first: z.number(), second: z.number() }),
    responseBody: z.number(),
  },
  'POST /sum/negative': {
    requestBody: z.array(z.number().int().negative()),
    responseBody: z.number().negative().int(),
  },
  'POST /sum/negative-broken': {
    requestBody: z.array(z.number().int().negative()),
    responseBody: z.number().negative().int(),
  },
  'POST /sum/transform-string': {
    requestBody: z.array(z.string().transform((s) => parseInt(s, 10))),
    responseBody: z.number().int(),
  },
  'POST /sum/transform-response': {
    requestBody: z.array(z.number().int()),
    responseBody: z
      .number()
      .int()
      .transform((s) => s.toString()),
  },
  'POST /sum/with-query-param': {
    requestBody: z.array(z.number().int()),
    responseBody: z
      .number()
      .int(),
  },
});

// Used for testing get request without json body parser
export const testGetOnlySchema = createHttpSchema({
  'GET /random-numbers': {
    responseBody: z.array(z.number()),
  },
});
