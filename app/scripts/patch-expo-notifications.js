const fs = require('fs');
const path = require('path');

// 1. Patch expo-notifications for Expo Go
const targetFile = path.join(__dirname, '../node_modules/expo-notifications/build/TopicSubscriptionModule.android.js');
if (fs.existsSync(targetFile)) {
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
}

// 2. Patch expo-notifications tsconfig.json to prevent IDE red errors
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

// 3. Patch React Native 0.88 StatusBarProps to include backgroundColor & translucent
const statusBarTypesFile = path.join(__dirname, '../node_modules/react-native/types_generated/Libraries/Components/StatusBar/StatusBar.d.ts');
if (fs.existsSync(statusBarTypesFile)) {
  let content = fs.readFileSync(statusBarTypesFile, 'utf-8');
  if (!content.includes('backgroundColor?: string')) {
    content = content.replace(
      'export type StatusBarProps = Readonly<Omit<StatusBarPropsIOS, keyof StatusBarBaseProps | keyof {}> & Omit<StatusBarBaseProps, keyof {}> & {}>;',
      'export type StatusBarProps = Readonly<Omit<StatusBarPropsIOS, keyof StatusBarBaseProps | keyof {}> & Omit<StatusBarBaseProps, keyof {}> & { backgroundColor?: string; translucent?: boolean }>;'
    );
    fs.writeFileSync(statusBarTypesFile, content, 'utf-8');
    console.log('✅ [patch] Successfully patched react-native StatusBarProps for backgroundColor and translucent.');
  }
}

// 4. Patch React Native 0.88 TextInput type so useRef<TextInput> resolves to TextInputInstance (with focus, blur methods)
const textInputTypesFile = path.join(__dirname, '../node_modules/react-native/types_generated/Libraries/Components/TextInput/TextInput.d.ts');
if (fs.existsSync(textInputTypesFile)) {
  let content = fs.readFileSync(textInputTypesFile, 'utf-8');
  if (content.includes('declare type $$TextInput = typeof $$TextInput;')) {
    content = content.replace(
      'declare type $$TextInput = typeof $$TextInput;',
      'declare type $$TextInput = TextInputInstance;'
    );
    fs.writeFileSync(textInputTypesFile, content, 'utf-8');
    console.log('✅ [patch] Successfully patched react-native TextInput type to TextInputInstance.');
  }
}

// 5. Patch react-native-webview index.d.ts generic parameter (<P = undefined> -> <P = {}>)
const webViewTypesFile = path.join(__dirname, '../node_modules/react-native-webview/index.d.ts');
if (fs.existsSync(webViewTypesFile)) {
  let content = fs.readFileSync(webViewTypesFile, 'utf-8');
  if (content.includes('<P = undefined>')) {
    content = content.replace('<P = undefined>', '<P = {}>');
    fs.writeFileSync(webViewTypesFile, content, 'utf-8');
    console.log('✅ [patch] Successfully patched react-native-webview generic parameter for React 19.');
  }
}
