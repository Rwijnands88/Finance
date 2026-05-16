/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const waitOn = require("wait-on");

const port = process.env.PORT || "3000";
const appUrl = process.env.ELECTRON_START_URL || `http://localhost:${port}`;
const useExternalServer = process.env.ELECTRON_USE_EXTERNAL_SERVER === "true";

let mainWindow = null;
let nextProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#09090B",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopNextServer();
    app.quit();
  });

  mainWindow.loadURL(appUrl);
}

function startNextServer() {
  if (useExternalServer) {
    return;
  }

  const cwd = app.getAppPath();
  const isPackaged = app.isPackaged;
  const command = isPackaged ? process.execPath : "npm";
  const args = isPackaged
    ? [
        path.join(cwd, "node_modules", "next", "dist", "bin", "next"),
        "start",
        "-p",
        port,
        "-H",
        "127.0.0.1",
      ]
    : ["run", "dev", "--", "--port", port, "--hostname", "127.0.0.1"];

  nextProcess = spawn(command, args, {
    cwd,
    detached: true,
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: "127.0.0.1",
      NODE_ENV: isPackaged ? "production" : "development",
      ...(isPackaged ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    stdio: "inherit",
  });

  nextProcess.on("exit", () => {
    nextProcess = null;
  });
}

function stopNextServer() {
  if (!nextProcess?.pid) {
    return;
  }

  try {
    process.kill(-nextProcess.pid);
  } catch {
    try {
      nextProcess.kill();
    } catch {
      // The server may already have stopped while the window was closing.
    }
  } finally {
    nextProcess = null;
  }
}

async function boot() {
  startNextServer();

  try {
    await waitOn({
      resources: [appUrl],
      timeout: 60_000,
      interval: 250,
    });

    createWindow();
  } catch (error) {
    stopNextServer();
    dialog.showErrorBox(
      "Finance kon niet starten",
      error instanceof Error
        ? error.message
        : "De lokale Next.js server werd niet bereikbaar.",
    );
    app.quit();
  }
}

app.whenReady().then(boot);

app.on("before-quit", stopNextServer);

app.on("window-all-closed", () => {
  stopNextServer();
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow) {
    createWindow();
  }
});
