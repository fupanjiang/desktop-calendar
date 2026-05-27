// Helper to start Electron with ELECTRON_RUN_AS_NODE removed.
// The user's system has this env var set, which forces Electron into Node.js mode.
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], { env, stdio: 'inherit', windowsHide: false });
child.on('close', (code) => process.exit(code));
