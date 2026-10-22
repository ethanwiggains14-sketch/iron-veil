/* Bundle the existing source into a portable single-file game. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, 'dist');
const target = path.resolve(process.argv[2] || path.join(__dirname, '../../outputs/IRON-VEIL.html'));
let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(source, 'style.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>' + css + '</style>');
const favicon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(source, 'favicon.svg')).toString('base64');
html = html.replace('href="favicon.svg"', () => 'href="' + favicon + '"');
for (const name of ['data.js', 'engine.js', 'renderer.js', 'online.js', 'app.js']) {
  const code = fs.readFileSync(path.join(source, name), 'utf8');
  html = html.replace('<script src="' + name + '"></script>', () => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>');
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, html);
console.log('Portable game exported: ' + target);
