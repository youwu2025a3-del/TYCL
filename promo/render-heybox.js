const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 1440,
    show: false,
    frame: false,
    transparent: false,
    webPreferences: { offscreen: false },
  });
  await win.loadFile(path.join(__dirname, 'heybox-1.4.1.html'));
  await new Promise((resolve) => setTimeout(resolve, 800));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'TYCL-heybox-1.4.1.png'), image.toPNG());
  win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.quit();
});
