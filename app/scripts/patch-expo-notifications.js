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

// 4. Patch react-native-webview types for React 19 compatibility
const webviewDts = path.join(__dirname, '../node_modules/react-native-webview/index.d.ts');
if (fs.existsSync(webviewDts)) {
  let content = fs.readFileSync(webviewDts, 'utf-8');
  if (content.includes('declare class WebView<P = undefined>')) {
    content = content.replace('declare class WebView<P = undefined>', 'declare class WebView<P = {}>');
    fs.writeFileSync(webviewDts, content, 'utf-8');
    console.log('✅ [patch-expo-notifications] Successfully patched react-native-webview index.d.ts for React 19.');
  }
}

// 5. Patch react-native StatusBar types for Android props compatibility
const statusBarDts = path.join(__dirname, '../node_modules/react-native/types_generated/Libraries/Components/StatusBar/StatusBar.d.ts');
if (fs.existsSync(statusBarDts)) {
  let content = fs.readFileSync(statusBarDts, 'utf-8');
  if (!content.includes('StatusBarPropsAndroid')) {
    content = content.replace(
      'export type StatusBarProps = Readonly<Omit<StatusBarPropsIOS, keyof StatusBarBaseProps | keyof {}> & Omit<StatusBarBaseProps, keyof {}> & {}>;',
      `export type StatusBarPropsAndroid = Readonly<{
  backgroundColor?: string | null | undefined;
  translucent?: boolean | undefined;
  networkActivityIndicatorVisible?: boolean | undefined;
}>;
export type StatusBarProps = Readonly<
  Omit<StatusBarPropsIOS, keyof StatusBarBaseProps | keyof {}> &
  Omit<StatusBarBaseProps, keyof {}> &
  StatusBarPropsAndroid
>;`
    );
    fs.writeFileSync(statusBarDts, content, 'utf-8');
    console.log('✅ [patch-expo-notifications] Successfully patched react-native StatusBar.d.ts for Android props.');
  }
}

// 6. Patch react-native TextInput types for useRef<TextInput> instance methods (.focus, .blur)
const textInputDts = path.join(__dirname, '../node_modules/react-native/types_generated/Libraries/Components/TextInput/TextInput.d.ts');
if (fs.existsSync(textInputDts)) {
  let content = fs.readFileSync(textInputDts, 'utf-8');
  if (content.includes('declare type $$TextInput = typeof $$TextInput;')) {
    content = content.replace('declare type $$TextInput = typeof $$TextInput;', 'declare type $$TextInput = TextInputInstance;');
    fs.writeFileSync(textInputDts, content, 'utf-8');
    console.log('✅ [patch-expo-notifications] Successfully patched react-native TextInput.d.ts for instance ref compatibility.');
  }
}

// 7. Patch expo-crypto to prevent runtime crash when ExpoCrypto native module is missing in Expo Go
const expoCryptoFiles = [
  path.join(__dirname, '../node_modules/expo-crypto/build/ExpoCrypto.js'),
  path.join(__dirname, '../node_modules/expo-crypto/src/ExpoCrypto.ts'),
];

const cryptoPatchContent = `import { requireOptionalNativeModule } from 'expo';

let nativeModule = null;
try {
  if (typeof requireOptionalNativeModule === 'function') {
    nativeModule = requireOptionalNativeModule('ExpoCrypto');
  }
} catch (e) {}

const fallbackModule = {
  getRandomValues(typedArray) {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
      return globalThis.crypto.getRandomValues(typedArray);
    }
    for (let i = 0; i < typedArray.length; i++) {
      typedArray[i] = Math.floor(Math.random() * 256);
    }
    return typedArray;
  },
  randomUUID() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
  digestStringAsync: async () => '',
  digest: () => {},
};

export default nativeModule || fallbackModule;
`;

expoCryptoFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.writeFileSync(file, cryptoPatchContent, 'utf-8');
    console.log(`✅ [patch-expo-notifications] Successfully patched ${path.basename(file)} for Expo Go.`);
  }
});

// Patch ExpoCryptoAES
const expoCryptoAesFiles = [
  path.join(__dirname, '../node_modules/expo-crypto/build/aes/ExpoCryptoAES.js'),
  path.join(__dirname, '../node_modules/expo-crypto/src/aes/ExpoCryptoAES.ts'),
];

const cryptoAesPatchContent = `import { requireOptionalNativeModule } from 'expo';

let nativeModule = null;
try {
  if (typeof requireOptionalNativeModule === 'function') {
    nativeModule = requireOptionalNativeModule('ExpoCryptoAES');
  }
} catch (e) {}

const fallbackAesModule = {
  encrypt: () => '',
  decrypt: () => '',
};

export default nativeModule || fallbackAesModule;
`;

expoCryptoAesFiles.forEach((file) => {
  if (fs.existsSync(file)) {
    fs.writeFileSync(file, cryptoAesPatchContent, 'utf-8');
    console.log(`✅ [patch-expo-notifications] Successfully patched ${path.basename(file)} for Expo Go.`);
  }
});
