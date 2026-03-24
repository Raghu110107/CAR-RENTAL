function resolveApiServerUrl() {
  if (window.API_SERVER_URL_OVERRIDE) {
    return window.API_SERVER_URL_OVERRIDE.replace(/\/$/, '');
  }

  var storedOverride = window.localStorage && window.localStorage.getItem('API_SERVER_URL');
  if (storedOverride) {
    return storedOverride.replace(/\/$/, '');
  }

  var isLiveServerPort = window.location.port === '5500' || window.location.port === '5501';
  if (isLiveServerPort) {
    return window.location.protocol + '//' + window.location.hostname + ':5000';
  }

  return window.location.origin;
}

window.API_SERVER_URL = resolveApiServerUrl();
window.API_BASE_URL = window.API_SERVER_URL + '/api';

window.apiUrl = function apiUrl(path) {
  return window.API_BASE_URL + path;
};

window.apiAssetUrl = function apiAssetUrl(path) {
  if (!path) {
    return 'images/ui.jpg';
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('uploads/')) {
    return window.API_SERVER_URL + '/' + path;
  }

  return path;
};
