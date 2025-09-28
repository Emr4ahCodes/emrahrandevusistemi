// Firebase initialization helper using modular SDK
// Doldurmanız gereken: window.FIREBASE_CONFIG (index.html içinde tanımlı)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, linkWithPopup } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let app, auth, db;

export function initFirebase() {
  if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
    throw new Error("Firebase config (window.FIREBASE_CONFIG) eksik. Lütfen index.html içindeki alanı doldurun.");
  }
  if (!getApps().length) {
    app = initializeApp(window.FIREBASE_CONFIG);
  }
  auth = getAuth();
  db = getFirestore();
  return { app, auth, db };
}

export function onAuthReady(callback){
  const a = getAuth();
  onAuthStateChanged(a, (user) => callback(user));
}

export { db };

// Google ile giriş
export async function signInWithGoogle(){
  const a = getAuth();
  const provider = new GoogleAuthProvider();
  try{
    // Eğer mevcut anonim kullanıcı varsa linkle; yoksa direkt giriş
    if (a.currentUser && a.currentUser.isAnonymous) {
      await linkWithPopup(a.currentUser, provider);
    } else {
      await signInWithPopup(a, provider);
    }
  }catch(err){
    if (err && err.code === 'auth/unauthorized-domain'){
      const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '<localhost>';
      const help = `Bu alan adı Firebase Authentication > Settings > Authorized domains listesinde değil.\n\nEkleyin: ${host}\nAyrıca localhost kullanıyorsanız: localhost\n\nKonsol: Firebase Console > Authentication > Settings > Authorized domains > Add domain`;
      alert(help);
      throw err;
    }
    // Eğer zaten başka bir hesapla ilişkilendirilmişse, normal girişe düş
    if (err && err.code === 'auth/credential-already-in-use'){
      await signInWithPopup(a, provider);
    } else {
      throw err;
    }
  }
}

export async function signOutUser(){
  const a = getAuth();
  await signOut(a);
  // Login sayfasına yönlendir
  const ret = encodeURIComponent(window.location.pathname);
  window.location.href = `./login.html?return=${ret}`;
}

// Sayfayı koruma: giriş yoksa login'e yönlendirir
export function requireAuth(){
  return new Promise((resolve) => {
    const a = getAuth();
    onAuthStateChanged(a, (user) => {
      if (user && !user.isAnonymous) {
        resolve(user);
      } else {
        const ret = encodeURIComponent(window.location.pathname);
        window.location.href = `./login.html?return=${ret}`;
      }
    });
  });
}
