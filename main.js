const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'icons', 'Vilo_Icon.icns'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('renderer/index.html');
}

const dataDir = app.getPath('userData');
const boardsFile = path.join(dataDir, 'boards.json');

ipcMain.handle('load-boards', async() => {
    if(fs.existsSync(boardsFile)) {
        return JSON.parse(fs.readFileSync(boardsFile));
    }
    return [];
});

ipcMain.handle('save-boards', async(event, boards) => {
    fs.writeFileSync(boardsFile, JSON.stringify(boards, null, 2));
})

app.whenReady().then(createWindow);