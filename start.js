const setupEvents = require('./installers/setupEvents')
 if (setupEvents.handleSquirrelEvent()) {
    return;
 }

const {app, BrowserWindow, ipcMain, screen} = require('electron');
const path = require('path')
const remoteMain = require('@electron/remote/main');
const Store = require('electron-store');

// Initialize electron-store with IPC support for renderer processes (v8 API)
Store.initRenderer();

let mainWindow
let splashWindow
let server;

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile('splash.html');

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  var primaryDisplay = screen.getPrimaryDisplay();
  var screenDimensions = primaryDisplay.workAreaSize;
  mainWindow = new BrowserWindow({
    width: screenDimensions.width,
    height: screenDimensions.height,
    frame: false,
    minWidth: 1200,
    minHeight: 750,
    show: false,
    backgroundColor: '#dddddd',

    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false
    },
  });

  remoteMain.enable(mainWindow.webContents);

  mainWindow.loadURL(
    `file://${path.join(__dirname, 'index.html')}`
  )

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
      }
      mainWindow.maximize();
      mainWindow.show();
    }, 500);
  })

  // Open DevTools with F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}


app.on('ready', () => {
  server = require('./server');
  remoteMain.initialize();
  createSplash();
  setTimeout(() => {
    createWindow();
  }, 100);
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})



ipcMain.on('app-quit', (evt, arg) => {
  app.quit()
})


ipcMain.on('app-reload', (event, arg) => {
  if (mainWindow) {
    mainWindow.reload();
    // Ensure window is visible after reload
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  }
});
