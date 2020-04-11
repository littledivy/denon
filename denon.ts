import {
  dirname,
  exists,
  extname,
  parse,
  resolve,
} from "./deps.ts";
import { DenonConfig, DenonConfigDefaults, readConfig } from "./denonrc.ts";
import { debug, log, fail, setConfig } from "./log.ts";
import Watcher from "./watcher.ts";

export let config: DenonConfig = DenonConfigDefaults;
setConfig(config);

function help() {
  console.log(`
Usage:
    denon [OPTIONS] [DENO_ARGS] [SCRIPT] [-- <SCRIPT_ARGS>]

OPTIONS:
    -c, --config <file>     A path to a config file, defaults to [default: .denonrc | .denonrc.json]
    -d, --debug             Debugging mode for more verbose logging
    -e, --extensions        List of extensions to look for separated by commas
    -f, --fullscreen        Clears the screen each reload
    -h, --help              Prints this
    -i, --interval <ms>     The number of milliseconds between each check
    -m, --match <glob>      Glob pattern for all the files to match
    -q, --quiet             Turns off all logging
    -s, --skip <glob>       Glob pattern for ignoring specific files or directories
    -w, --watch             List of paths to watch separated by commas

DENO_ARGS: Arguments passed to Deno to run SCRIPT (like permisssions)
`);
}

export interface Args {
  config?: string;
  extensions?: string;
  interval?: string;
  match?: string;
  skip?: string;
  watch?: string;
  debug?: boolean;
  fullscreen?: boolean;
  help?: boolean;
  quiet?: boolean;
  runnerFlags: string[];
  deno_args: string[];
  files: string[];
}

export function parseArgs(args: string[]): Args {
  if (args[0] === "--") {
    args = args.slice(1);
  }

  let deno_args: string[] = [];

  const flags = parse(args, {
    string: ["config", "extensions", "interval", "match", "skip", "watch"],
    boolean: ["debug", "fullscreen", "help", "quiet"],
    alias: {
      config: "c",
      debug: "d",
      extensions: "e",
      fullscreen: "f",
      help: "h",
      interval: "i",
      match: "m",
      quiet: "q",
      skip: "s",
      watch: "w",
    },
    "--": true,
    unknown: (arg: string, k?: string, v?: unknown) => {
      deno_args.push(arg);
      if (v && !arg.endsWith(String(v)) && typeof (v) !== "boolean") {
        deno_args.push(String(v));
      }
      return false;
    },
  });

  const files: string[] = [];
  const script = deno_args[deno_args.length - 1];
  if (script && !script.startsWith("-")) {
    files.push(script);
    deno_args = deno_args.slice(0, -1);
  }

  return {
    config: flags.config,
    debug: flags.debug,
    extensions: flags.extensions,
    fullscreen: flags.fullscreen,
    help: flags.help,
    interval: flags.interval,
    match: flags.match,
    quiet: flags.quiet,
    skip: flags.skip,
    watch: flags.watch,
    runnerFlags: flags["--"],
    files,
    deno_args,
  };
}

if (import.meta.main) {
  const flags = parseArgs(Deno.args);

  if (flags.debug) {
    config.debug = flags.debug;
  }

  if (flags.config) {
    debug(`Reading config from ${flags.config}`);
    config = await readConfig(flags.config);
  } else {
    debug(`Reading config from .denonrc | .denonrc.json`);
    config = await readConfig();
  }

  setConfig(config);

  debug(`Args: ${Deno.args}`);
  debug(`Flags: ${JSON.stringify(flags)}`);

  if (flags.help) {
    debug("Printing help...");
    help();
    Deno.exit(0);
  }

  debug(`Config: ${JSON.stringify(config)}`);

  if (flags.extensions) {
    config.extensions = flags.extensions.split(",");
  }

  if (flags.fullscreen) {
    config.fullscreen = flags.fullscreen;
  }

  if (flags.interval) {
    config.interval = parseInt(flags.interval, 10);
  }

  if (flags.match) {
    config.match = [flags.match];
  }

  if (flags.watch) {
    config.watch = flags.watch.split(",");
  }

  if (flags.quiet) {
    config.quiet = flags.quiet;
  }

  if (flags.skip) {
    config.skip = [flags.skip];
  }

  if (flags.deno_args.length) {
    config.deno_args = flags.deno_args;
  }

  if (config.files.length < 1 && flags.files.length < 1) {
    fail(
      "Could not start denon because no file was provided, use -h for help",
    );
  }

  for (const file of flags.files) {
    if (!(await exists(file))) {
      fail(`Could not start denon because file "${file}" does not exist`);
    }

    const filePath = resolve(file);
    config.files.push(filePath);
    if (!config.watch.length) {
      config.watch.push(dirname(filePath));
    }
  }

  const tmpFiles = [...config.files];
  config.files = [];

  for (const file of tmpFiles) {
    if (!(await exists(file))) {
      fail(`Could not start denon because file "${file}" does not exist`);
    }
    const filepath = resolve(file);
    const fileInfo = await Deno.lstat(filepath);
    if (fileInfo.isDirectory()) {
      fail(`Could not start denon because "${file}" is a directory`);
    }

    config.files.push(filepath);
  }

  // Remove duplicates
  config.files = [...new Set(config.files)];
  debug(`Files: ${config.files}`);

  const tmpWatch = [...config.watch];
  config.watch = [];

  for (const path of tmpWatch) {
    if (!(await exists(path))) {
      fail(`Could not start denon because path "${path}" does not exist`);
    }

    config.watch.push(resolve(path));
  }

  // Remove duplicates
  config.watch = [...new Set(config.watch)];
  debug(`Paths: ${config.watch}`);

  const executors: (() => void)[] = [];
  const execute = (...args: string[]) => {
    let proc: Deno.Process | undefined;

    return () => {
      if (proc) {
        proc.close();
      }

      debug(`Running "${args.join(" ")}"`);
      proc = Deno.run({
        cmd: args,
      });
    };
  };

  for (const file of config.files) {
    const extension = extname(file);
    const cmds = config.execute[extension] as string[] | undefined;

    if (cmds) {
      const binary = cmds[0];

      const executor = execute(
        ...cmds,
        ...(binary === "deno" ? flags.deno_args : []),
        file,
        ...flags.runnerFlags,
      );

      executors.push(executor);

      if (config.fullscreen) {
        console.clear();
      }

      executor();
    } else {
      fail(`Can not run ${file}. No config for "${extension}" found`);
    }
  }

  debug("Creating watchers");
  for (const path of config.watch) {
    if (!(await exists(path))) {
      fail(`Can not watch directory ${path} because it does not exist`);
    }
  }

  debug(`Creating watcher for paths "${config.watch}"`);
  const watcher = new Watcher(config.watch, {
    interval: config.interval,
    exts: config.extensions,
    match: config.match,
    skip: config.skip,
  });

  log(`Watching ${config.watch.join(", ")}`);
  for await (const changes of watcher) {
    if (config.fullscreen) {
      debug("Clearing screen");
      console.clear();
    }

    log(
      `Detected ${changes.length} change${changes.length > 1
        ? "s"
        : ""}. Rerunning...`,
    );

    for (const change of changes) {
      debug(`File "${change.path}" was ${change.event}`);
    }

    executors.forEach((ex) => ex());
  }
}
