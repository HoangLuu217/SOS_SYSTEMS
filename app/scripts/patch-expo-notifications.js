const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../node_modules/expo-notifications/build/TopicSubscriptionModule.android.js');

if (!fs.existsSync(targetFile)) {
  console.log('[patch-expo-notifications] Target file not found, skipping patch.');
  process.exit(0);
}

const patchContent = `import { requireOptionalNativeModule } from 'expo-modules-core';

let nativeModule = null;
try {
  if (typeof requireOptionalNativeModule === 'function') {
    nativeModule = requireOptionalNativeModule('ExpoTopicSubscriptionModule');
  }
} catch (e) {
  // Graceful fallback for Expo Go where native topic subscription module is unavailable
}

const fallbackModule = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};

export default nativeModule || fallbackModule;
`;

fs.writeFileSync(targetFile, patchContent, 'utf-8');
console.log('✅ [patch-expo-notifications] Successfully patched TopicSubscriptionModule.android.js for Expo Go.');

// 2. Patch tsconfig.json to prevent IDE red errors
const tsconfigFile = path.join(__dirname, '../node_modules/expo-notifications/tsconfig.json');
if (fs.existsSync(tsconfigFile)) {
  const cleanTsconfig = `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./build"
  },
  "include": ["./src"],
  "exclude": ["**/__mocks__/*", "**/__tests__/*", "**/__rsc_tests__/*"]
}
`;
  fs.writeFileSync(tsconfigFile, cleanTsconfig, 'utf-8');
  console.log('✅ [patch-expo-notifications] Successfully patched tsconfig.json to remove IDE error.');
}
