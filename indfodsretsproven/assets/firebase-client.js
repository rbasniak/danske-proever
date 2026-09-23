'use strict';

(function () {
  if (!window.firebase) {
    throw new Error('Firebase SDK was not loaded.');
  }

  const config = {
    apiKey: 'AIzaSyAmrttzr16EMpmmaNx8D7NUiwYjqo4996M',
    authDomain: 'ov-dansk.firebaseapp.com',
    projectId: 'ov-dansk',
    storageBucket: 'ov-dansk.firebasestorage.app',
    messagingSenderId: '749643252913',
    appId: '1:749643252913:web:63f7c2f46815a35dfe0e90',
  };

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
  const auth = app.auth();
  const db = app.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();

  window.studyFirebase = {
    app,
    auth,
    db,
    provider,
    user: null,
    signIn() {
      return auth.signInWithPopup(provider);
    },
    signOut() {
      return auth.signOut();
    },
  };
})();
