const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const path = require('path');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // Wrap Babel loader's include function to normalize paths on Windows
  const babelRule = config.module.rules
    .find(rule => rule.oneOf)
    ?.oneOf.find(rule => rule.use && typeof rule.use === 'object' && rule.use.loader && rule.use.loader.includes('babel-loader'));

  if (babelRule && typeof babelRule.include === 'function') {
    const originalInclude = babelRule.include;
    babelRule.include = function (inputPath) {
      // Normalize to resolve forward slash vs backslash issues on Windows
      const normalizedPath = path.normalize(inputPath);
      return originalInclude(normalizedPath) || originalInclude(inputPath);
    };
  }

  // Resolve deep imports from Stripe to react-native-web
  config.resolve.alias['react-native/Libraries/Components/TextInput/TextInputState'] =
    'react-native-web/dist/modules/TextInputState/index.js';

  // Mock Stripe React Native on the web as it lacks native web modules
  config.resolve.alias['@stripe/stripe-react-native'] = 
    path.resolve(__dirname, 'src/mocks/stripe-mock.js');

<<<<<<< HEAD
  // Mock react-native-maps on the web
  config.resolve.alias['react-native-maps'] = 
    path.resolve(__dirname, 'src/mocks/react-native-maps-mock.js');

=======
>>>>>>> d74cc15965da6815edf7abdf37c172020b892227
  // Ensure cross-workspace modules (like react-native-web) can be resolved from the hoisted node_modules
  config.resolve.modules = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, '../node_modules'),
    'node_modules'
  ];

  return config;
};
