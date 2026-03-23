window.API_SERVER_URL = window.location.origin;
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
