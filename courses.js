(function() {
  'use strict';

  // GitHub loading disabled - using UNIVERSITY_DB instead
  window.GO_TVET_COURSES = {};
  if (!window.ALL_TVET_COLLEGES) window.ALL_TVET_COLLEGES = [];
  console.log('[GoTVET] GitHub loading skipped - using UNIVERSITY_DB');

  document.dispatchEvent(new CustomEvent('go-tvet-courses-loaded', { detail: {} }));
})();
