#!/usr/bin/env node
import { runCli } from "./cli-run.js";

// Exit quietly when the consumer closes the pipe early (e.g. `| head`).
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") {
    process.exit(0);
  }

  throw err;
});

runCli(process.argv.slice(2), {
  stdout: (s) => void process.stdout.write(s),
  stderr: (s) => void process.stderr.write(s),
  readStdin: async () => {
    let data = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      data += chunk;
    }

    return data;
  },
  isTTY: process.stdout.isTTY ?? false,
}).then((code) => {
  process.exitCode = code;
});
