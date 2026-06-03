const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // Resolve deep imports from Stripe to react-native-web
  config.resolve.alias['react-native/Libraries/Components/TextInput/TextInputState'] =
    'react-native-web/dist/modules/TextInputState/index.js';

  // Mock Stripe React Native on the web as it lacks native web modules
  config.resolve.alias['@stripe/stripe-react-native'] = 
    require('path').resolve(__dirname, 'src/mocks/stripe-mock.js');

  return config;
};
