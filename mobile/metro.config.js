const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
// Web and mobile are separate npm projects rather than npm workspaces. Expose
// their shared pure helpers without changing either app's React resolution.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../src/lib')];

module.exports = config;
