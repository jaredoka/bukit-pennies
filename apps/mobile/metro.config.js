// Metro config.
//
// React Native 0.88 reads some behaviour switches from a JS-only feature-flag
// module that is not part of its public export map (`src/private/**` is not
// listed in package.json `exports`). We need one of them to evaluate a
// performance regression, so expose that single module under a private alias
// rather than disabling package exports for the whole app.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const RN_FLAGS_ALIAS = 'rn-internal-feature-flags';
const rnFlagsPath = path.join(
  __dirname,
  'node_modules/react-native/src/private/featureflags/ReactNativeFeatureFlags.js',
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === RN_FLAGS_ALIAS) {
    return { type: 'sourceFile', filePath: rnFlagsPath };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
