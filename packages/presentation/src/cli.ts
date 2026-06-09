#!/usr/bin/env node
import { runMusicPptCli } from "./cli/music-ppt-cli.ts";

const exitCode = await runMusicPptCli(process.argv.slice(2));
process.exitCode = exitCode;
