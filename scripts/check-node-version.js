#!/usr/bin/env node

const major = Number(process.versions.node.split(".")[0]);
if (Number.isNaN(major) || major < 24) {
  process.stderr.write(
    `Error: Node.js 24+ is required for this project (current: ${process.versions.node}).\n`
  );
  process.exit(1);
}
