// Scripts for Firebase v9 compat libraries
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker with the provided config
const firebaseConfig = {
    apiKey: "AIzaSyA5Sx51eRgYOVO8GiJmTfi3c_j0SxuDS6k",
    authDomain: "pusheagle2.firebaseapp.com",
    projectId: "pusheagle2",
    storageBucket: "pusheagle2.appspot.com",
    messagingSenderId: "928516629371",
    appId: "1:928516629371:web:0267cb4fcaa24683a413de",
    measurementId: "G-QWNC9DK8N6"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
