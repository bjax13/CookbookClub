#!/usr/bin/env node
import { createCookbookWebServer } from "./web/server.js";

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    port: 4173,
    host: "127.0.0.1",
    data: null,
    storage: "json"
  };

  while (args.length) {
    const token = args.shift();
    if (token === "--port") {
      const value = Number(args.shift());
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Invalid --port value.");
      }
      options.port = value;
      continue;
    }
    if (token === "--host") {
      const value = args.shift();
      if (!value) throw new Error("Missing --host value.");
      options.host = value;
      continue;
    }
    if (token === "--data") {
      const value = args.shift();
      if (!value) throw new Error("Missing --data value.");
      options.data = value;
      continue;
    }
    if (token === "--storage") {
      const value = args.shift();
      if (!value) throw new Error("Missing --storage value.");
      options.storage = value;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { server, filePath, storage } = createCookbookWebServer({
    dataPath: options.data,
    storage: options.storage
  });

  server.listen(options.port, options.host, () => {
    process.stdout.write(
      `Cookbook Club web running at http://${options.host}:${options.port} (storage=${storage}, data=${filePath})\n`
    );
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
