const path = require('path');
const os = require('os');
const fs = require('fs');

// Cross-platform app data path
const getAppDataPath = () => {
    const platform = process.platform;
    if (platform === 'win32') {
        return process.env.APPDATA;
    } else if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support');
    } else {
        return path.join(os.homedir(), '.config');
    }
};

const appDataPath = getAppDataPath();
const uploadsPath = path.join(appDataPath, 'POS', 'uploads');
const dbPath = path.join(appDataPath, 'POS', 'server', 'databases');

// Ensure directories exist
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
}

module.exports = {
    appDataPath,
    uploadsPath,
    dbPath
};
