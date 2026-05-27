// Helper to run electron-builder with ELECTRON_RUN_AS_NODE removed
const { spawn } = require('child_process');
const path = require('path');

const builderPath = path.join(__dirname, 'node_modules', '.bin', 'electron-builder.cmd');
const args = process.argv.slice(2);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(builderPath, args, { env, stdio: 'inherit', windowsHide: false, shell: true });
child.on('close', (code) => process.exit(code));
