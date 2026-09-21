// Loads Google reCAPTCHA v3 (invisible — no challenge UI) once, and exposes
// a helper to fetch a fresh token right before submitting a public form.
// If no site key is configured, getRecaptchaToken() resolves to null and
// the backend simply skips the captcha check (see _verify_captcha).

const SITE_KEY = process.env.REACT_APP_RECAPTCHA_SITE_KEY;

let loadPromise = null;

function loadScript() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (!SITE_KEY) {
      resolve(false);
      return;
    }
    if (window.grecaptcha) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export async function getRecaptchaToken(action = "submit") {
  if (!SITE_KEY) return null;
  try {
    await loadScript();
    await new Promise((resolve) => window.grecaptcha.ready(resolve));
    return await window.grecaptcha.execute(SITE_KEY, { action });
  } catch (e) {
    console.warn("reCAPTCHA token fetch failed:", e);
    return null;
  }
}
