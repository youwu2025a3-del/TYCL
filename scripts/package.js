'use strict';

const path = require('path');

const root = path.join(__dirname, '..');

(async () => {
  try {
    const { packager } = await import('@electron/packager');
    const appPaths = await packager({
      dir: root,
      name: 'TYCL',
      executableName: 'TYCL',
      platform: 'win32',
      arch: 'x64',
      out: path.join(root, 'dist'),
      overwrite: true,
      prune: true,
      asar: true,
      icon: path.join(root, 'src', 'assets', 'icon.ico'),
      appVersion: require(path.join(root, 'package.json')).version,
      buildVersion: require(path.join(root, 'package.json')).version,
      appCopyright: 'Copyright © 2026 A3Y8',
      win32metadata: {
        CompanyName: 'A3Y8',
        FileDescription: 'TYCL Minecraft Launcher',
        ProductName: 'TYCL',
        InternalName: 'TYCL',
        OriginalFilename: 'TYCL.exe',
      },
      ignore: [
        /^\/dist($|\/)/,
        /^\/screenshots($|\/)/,
        /^\/server($|\/)/,
        /^\..+/,
        /^\/_[^/]+$/,
        /^\/启动TYCL\.bat$/,
        /^\/README\.md$/,
        /^\/LICENSE$/,
        /^\/update\.example\.json$/,
      ],
    });
    console.log('PACKAGED', appPaths.join(', '));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
