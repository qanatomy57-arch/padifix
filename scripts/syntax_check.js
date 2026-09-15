const fs = require('fs');
const path = require('path');
const vm = require('vm');

let count = 0;
const ignoreDirs = new Set(['node_modules', '.git', '.vercel', '.gemini', 'dist', 'build', '.agent']);

function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!ignoreDirs.has(e.name)) {
        checkDir(path.join(dir, e.name));
      }
    } else if (e.isFile() && e.name.endsWith('.js')) {
      const full = path.join(dir, e.name);
      const code = fs.readFileSync(full, 'utf8');
      try {
        new vm.Script(code, { filename: full });
        count++;
      } catch (err) {
        console.error(`❌ Syntax error in ${full}: ${err.message}`);
        process.exit(1);
      }
    }
  }
}

checkDir('.');
console.log(`✅ All ${count} JavaScript files passed syntax check.`);

