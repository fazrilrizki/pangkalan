// Stand-in for an AI CLI in tests: reacts to simple line commands on stdin.
//   ask     -> prints a (y/n) prompt and waits
//   spam    -> prints continuously for ~1.5s
//   exit N  -> exits with code N
//   write F T -> writes text T to file F in the working directory
//   serve URL -> prints URL the way Vite announces its dev server
// Bracketed-paste markers are ignored, so a pasted prompt runs like a typed line.
// With --menu it opens on a choice menu (like Claude's folder-trust dialog); the first line
// answers the menu instead of running as a command.
import fs from 'node:fs';
import readline from 'node:readline';

let menuOpen = process.argv.includes('--menu');
process.stdout.write(
  menuOpen ? '❯ No, exit\r\n  Yes, I trust this folder\r\nEnter to confirm' : 'fake-cli ready\r\n',
);

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (menuOpen) {
    menuOpen = false;
    process.stdout.write('\r\ntrusted\r\nfake-cli ready\r\n');
    return;
  }
  run(line);
});

// --run <command> runs one command at start, like a CLI given its first prompt as an argument.
const runIndex = process.argv.indexOf('--run');
if (runIndex !== -1) run(process.argv[runIndex + 1] ?? '');

function run(line) {
  const [command, arg, ...rest] = line
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[20[01]~/g, '')
    .trim()
    .split(/\s+/);
  if (command === 'ask') {
    process.stdout.write('Continue? (y/n) ');
  } else if (command === 'spam') {
    const timer = setInterval(() => process.stdout.write('working...\r\n'), 50);
    setTimeout(() => {
      clearInterval(timer);
      process.stdout.write('done\r\n');
    }, 1500);
  } else if (command === 'write') {
    fs.writeFileSync(arg, `${rest.join(' ')}\n`);
    process.stdout.write(`wrote ${arg}\r\n`);
  } else if (command === 'serve') {
    process.stdout.write(`  [32m➜[39m  [1mLocal[22m:   [36m${arg}[39m
`);
  } else if (command === 'exit') {
    process.exit(Number(arg ?? 0));
  } else {
    process.stdout.write(`echo:${line}\r\n`);
  }
}
