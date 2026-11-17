import { handleRequest, cleanup } from './api.mjs';

export default {
  fetch: handleRequest,
  scheduled(event, env, ctx) { ctx.waitUntil(cleanup(env)); }
};
