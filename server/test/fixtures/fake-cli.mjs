// Stand-in for an AI CLI in tests: reacts to simple line commands on stdin.
//   ask     -> prints a (y/n) prompt and waits
//   spam    -> prints continuously for ~1.5s
//   exit N  -> exits with code N
import readline from 'node:readline';

process.stdout.write('fake-cli ready\r\n');

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const [command, arg] = line.trim().split(/\s+/);
  if (command === 'ask') {
    process.stdout.write('Continue? (y/n) ');
  } else if (command === 'spam') {
    const timer = setInterval(() => process.stdout.write('working...\r\n'), 50);
    setTimeout(() => {
      clearInterval(timer);
      process.stdout.write('done\r\n');
    }, 1500);
  } else if (command === 'exit') {
    process.exit(Number(arg ?? 0));
  } else {
    process.stdout.write(`echo:${line}\r\n`);
  }
});
