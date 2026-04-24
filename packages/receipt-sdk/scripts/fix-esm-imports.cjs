const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

const distDir = path.join(__dirname, '..', 'dist');
for (const file of walk(distDir)) {
  let content = fs.readFileSync(file, 'utf8');
  const updated = content.replace(
    /from '(\.\.?\/[^']+?)(?<!\.js)'/g,
    "from '$1.js'"
  );
  if (updated !== content) {
    fs.writeFileSync(file, updated);
  }
}
