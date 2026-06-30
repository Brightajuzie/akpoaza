const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = __dirname;
const localPackagePath = path.join(projectRoot, 'node_modules', '@react-native', 'gradle-plugin');
const hoistedPackagePath = path.join(projectRoot, '..', 'node_modules', '@react-native', 'gradle-plugin');

if (fs.existsSync(localPackagePath)) {
  console.log('Applying patch to local node_modules...');
  execSync('npx patch-package', { stdio: 'inherit', cwd: projectRoot });
} else if (fs.existsSync(hoistedPackagePath)) {
  console.log('Applying patch to hoisted node_modules in workspace root...');
  // Run patch-package from workspace root, specifying our frontend/patches directory
  const workspaceRoot = path.join(projectRoot, '..');
  const patchDir = path.relative(workspaceRoot, path.join(projectRoot, 'patches')).replace(/\\/g, '/');
  execSync(`npx patch-package --patch-dir ${patchDir}`, { stdio: 'inherit', cwd: workspaceRoot });
} else {
  console.log('@react-native/gradle-plugin not found, skipping patch.');
}
