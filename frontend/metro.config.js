const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Spread standard defaults and append workspace roots
config.watchFolders = [...(config.watchFolders || []), workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Mock Stripe React Native and react-native-maps on the web since they lack native web support in Metro
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === '@stripe/stripe-react-native') {
      return {
        filePath: path.resolve(projectRoot, 'src/mocks/stripe-mock.js'),
        type: 'sourceFile',
      };
    }
    if (moduleName === 'react-native-maps') {
      return {
        filePath: path.resolve(projectRoot, 'src/mocks/react-native-maps-mock.js'),
        type: 'sourceFile',
      };
    }
  }
  // Chain to default resolver
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;