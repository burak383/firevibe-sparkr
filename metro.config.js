// Metro (the mobile bundler) walks the whole project folder by default. Since
// `backend/` is a separate, unrelated Node.js project that happens to live
// inside this same folder (not a package this app imports), Metro should
// never try to resolve, watch, or bundle anything under it - if it ever does
// (e.g. because something requests that path from the dev server, or a stray
// import), Metro would fail trying to bundle Node-only modules like `fs`/
// `http` for the phone, exactly like:
//   "You attempted to import the Node standard library module 'fs' ..."
// Excluding the folder outright makes that class of error impossible.
const { getDefaultConfig } = require('expo/metro-config');
 
const config = getDefaultConfig(__dirname);
 
config.resolver.blockList = [
  // Matches ".../backend/..." on both Windows ("\") and POSIX ("/") paths.
  /[\\/]backend[\\/].*/,
];
 
module.exports = config;