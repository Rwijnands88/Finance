/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const { createServer } = require("http");
const path = require("path");
const waitOn = require("wait-on");

const port = process.env.PORT || "3000";
const appUrl = process.env.ELECTRON_START_URL || `http://localhost:${port}`;
const useExternalServer = process.env.ELECTRON_USE_EXTERNAL_SERVER === "true";

let mainWindow = null;
let nextProcess = null;
let nextServer = null;

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

async function startNextServer() {
  if (useExternalServer) {
    return;
  }

  const cwd = app.getAppPath();
  const isPackaged = app.isPackaged;

  if (isPackaged) {
    await startEmbeddedNextServer(cwd);
    return;
  }

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev", "--", "--port", port, "--hostname", "127.0.0.1"];

  nextProcess = spawn(command, args, {
    cwd,
    detached: false,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "development",
    },
    stdio: "ignore",
  });

  nextProcess.on("exit", () => {
    nextProcess = null;
  });
  nextProcess.unref();
}

async function startEmbeddedNextServer(cwd) {
  process.env.PORT = port;
  process.env.HOSTNAME = "127.0.0.1";
  process.env.NODE_ENV = "production";

  const next = require("next");
  const nextApp = next({
    dev: false,
    dir: cwd,
    hostname: "127.0.0.1",
    port: Number(port),
    quiet: true,
  });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  await new Promise((resolve, reject) => {
    nextServer = createServer((request, response) => {
      handle(request, response);
    });

    nextServer.once("error", reject);
    nextServer.listen(Number(port), "127.0.0.1", resolve);
  });
}

function stopNextServer() {
  if (nextServer) {
    try {
      nextServer.close();
    } catch {
      // The embedded server may already have stopped while the app was closing.
    } finally {
      nextServer = null;
    }
  }

  if (!nextProcess?.pid) {
    return;
  }

  try {
    nextProcess.kill();
  } catch {
    // The server may already have stopped while the window was closing.
  } finally {
    nextProcess = null;
  }
}

async function boot() {
  try {
    await startNextServer();
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
