#!/usr/bin/env node

/**
 * AeroJS Command-Line Interface Executable
 */

async function main() {
  let AeroCLI;
  try {
    const mod = await import('../dist/cli/runner.js');
    AeroCLI = mod.AeroCLI;
  } catch {
    const mod = await import('../src/cli/runner.js');
    AeroCLI = mod.AeroCLI;
  }

  const exitCode = await AeroCLI.run(process.argv.slice(2));
  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
