// Lets anyone sideload under their own bundle identifier:
//   METTRO_BUNDLE_ID=com.yourname.mettro npx expo prebuild -p ios --clean
module.exports = ({ config }) => {
  const id = process.env.METTRO_BUNDLE_ID;
  if (!id) return config;
  return {
    ...config,
    ios: { ...config.ios, bundleIdentifier: id },
    android: { ...config.android, package: id },
  };
};
