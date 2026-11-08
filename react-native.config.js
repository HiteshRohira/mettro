// Each platform links only the map library it uses: MapKit (react-native-maps) on iOS,
// MapLibre on Android (Google Maps would need an API key).
module.exports = {
  dependencies: {
    'react-native-maps': { platforms: { android: null } },
    '@maplibre/maplibre-react-native': { platforms: { ios: null } },
  },
};
