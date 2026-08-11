export default defineNuxtPlugin(() => {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
});
