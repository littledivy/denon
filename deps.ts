// provide better logging, see src/log.ts
export * as log from "https://deno.land/std@0.51.0/log/mod.ts";
export { LogRecord } from "https://deno.land/std@0.51.0/log/logger.ts";
export { LevelName as LogLevelName } from "https://deno.land/std@0.51.0/log/levels.ts";

export {
  setColorEnabled,
  green,
  red,
  yellow,
  reset,
} from "https://deno.land/std@v0.51.0/fmt/mod.ts";

export { parse as parseFlags } from "https://deno.land/std@v0.51.0/flags/mod.ts";

export {
  exists,
  readFileStr,
} from "https://deno.land/std@v0.51.0/fs/mod.ts";

export {
  JSON_SCHEMA,
  parse as parseYaml,
} from "https://deno.land/std@0.51.0/encoding/yaml.ts";

export {
  dirname,
  extname,
  globToRegExp,
  resolve,
} from "https://deno.land/std@v0.51.0/path/mod.ts";

export { deferred } from "https://deno.land/std@v0.51.0/async/mod.ts";

export {
  grant,
} from "https://deno.land/std@v0.51.0/permissions/mod.ts";
