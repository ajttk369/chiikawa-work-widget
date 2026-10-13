const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const output = path.join(ROOT, 'dist');
const files = [
  'index.html', 'schedule.js',
  'web/host.js', 'web/web.css',
  'renderer/index.html', 'renderer/widget.js', 'renderer/widget.css',
  'renderer/settings.html', 'renderer/settings.js', 'renderer/settings.css', 'renderer/web-bridge.js',
  'assets/meadow-atlas.png', 'assets/characters-atlas-v2.png', 'assets/food-atlas.png'
];
for (const file of files) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (file.endsWith('.html')) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8')
      .replaceAll('node_modules/lucide/dist/umd/lucide.min.js', 'vendor/lucide.min.js');
    fs.writeFileSync(target, html);
  } else fs.copyFileSync(path.join(ROOT, file), target);
}
fs.mkdirSync(path.join(output, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'node_modules/lucide/dist/umd/lucide.min.js'), path.join(output, 'vendor/lucide.min.js'));
console.log('Web files prepared in dist. Electron and local settings are not included.');
