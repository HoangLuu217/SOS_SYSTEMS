const fs = require('fs');
const path = require('path');

// 1. Patch expo-notifications TopicSubscriptionModule for Expo Go
const targetFile = path.join(__dirname, '../node_modules/expo-notifications/build/TopicSubscriptionModule.android.js');
const targetTsFile = path.join(__dirname, '../node_modules/expo-notifications/src/TopicSubscriptionModule.android.ts');

const notificationPatchContent = `import { requireOptionalNativeModule } from 'expo-modules-core';

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

if (fs.existsSync(targetFile)) {
  fs.writeFileSync(targetFile, notificationPatchContent, 'utf-8');
  console.log('✅ [patch-expo-notifications] Successfully patched TopicSubscriptionModule.android.js for Expo Go.');
}

if (fs.existsSync(targetTsFile)) {
  fs.writeFileSync(targetTsFile, notificationPatchContent, 'utf-8');
  console.log('✅ [patch-expo-notifications] Successfully patched TopicSubscriptionModule.android.ts.');
}

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

// 3. Patch expo-asset to prevent runtime crash when ExpoAsset native module is missing in Expo Go
const expoAssetFiles = [
  path.join(__dirname, '../node_modules/expo/node_modules/expo-asset/build/ExpoAsset.js'),
  path.join(__dirname, '../node_modules/expo/node_modules/expo-asset/src/ExpoAsset.ts'),
  path.join(__dirname, '../node_modules/expo-asset/build/ExpoAsset.js'),
  path.join(__dirname, '../node_modules/expo-asset/src/ExpoAsset.ts'),
];

const assetPatchContent = `import { requireOptionalNativeModule } from 'expo-modules-core';

let AssetModule = null;
try {
  if (typeof requireOptionalNativeModule === 'function') {
    AssetModule = requireOptionalNativeModule('ExpoAsset');
  }
} catch (e) {
  // Graceful fallback for Expo Go where native ExpoAsset module is unavailable
}

export async function downloadAsync(url, md5Hash, type) {
  if (AssetModule && typeof AssetModule.downloadAsync === 'function') {
    return AssetModule.downloadAsync(url, md5Hash, type);
  }
  return url;
}
`;

expoAssetFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.writeFileSync(file, assetPatchContent, 'utf-8');
    console.log(`✅ [patch-expo-notifications] Successfully patched ${path.basename(file)} for Expo Go.`);
  }
});
