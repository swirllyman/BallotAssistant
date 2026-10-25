// Site configuration. The Civic API key is a browser key: restrict it in Google
// Cloud Console to this site's URL (HTTP referrer) and to the Civic Information
// API only, since anyone can read it in the page source.
window.BALLOT_CONFIG = {
  civicApiKey: '',
  // Next statewide election this guide is preparing voters for.
  upcomingElection: { name: '2026 U.S. General Election', date: '2026-11-03' }
};
