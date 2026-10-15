//! The wasm fetch layer — the only browser-gated code in the crate.
//!
//! Same-origin requests carry the session cookie implicitly; the CSRF
//! double-submit cookie read from `document.cookie` is echoed as the
//! `X-CSRF-Token` header on unsafe methods, matching the contract the htmx
//! frontend's `fe-fetch` implements.

/// GET JSON with the browser's cookies; resolves to the raw body text.
pub async fn get_json(url: &str) -> Result<String, String> {
  request_json("GET", url, None).await
}

/// POST JSON with the browser's cookies; resolves to the raw body text.
pub async fn post_json(url: &str, body: &str) -> Result<String, String> {
  request_json("POST", url, Some(body)).await
}

#[cfg(target_arch = "wasm32")]
async fn request_json(method: &str, url: &str, body: Option<&str>) -> Result<String, String> {
  use wasm_bindgen::JsCast as _;
  use wasm_bindgen_futures::JsFuture;
  use web_sys::{Headers, Request, RequestInit, Response, };

  let mut init = RequestInit::new();
  init.method(method);
  if let Some(body) = body {
    init.body(Some(wasm_bindgen::JsValue::from_str(body)));
  }

  let headers = Headers::new().map_err(|e| format!("{e:?}"))?;
  headers.set("Accept", "application/json").map_err(|e| format!("{e:?}"))?;
  if body.is_some() {
    headers.set("Content-Type", "application/json").map_err(|e| format!("{e:?}"))?;
  }
  if let Some(token) = crate::storage::csrf_cookie() {
    headers.set("X-CSRF-Token", &token).map_err(|e| format!("{e:?}"))?;
  }
  init.headers(&headers);

  let request = Request::new_with_str_and_init(url, &init).map_err(|e| format!("{e:?}"))?;
  let window = web_sys::window().ok_or("no window")?;
  let response_value = JsFuture::from(window.fetch_with_request(&request,))
    .await
    .map_err(|e| format!("{e:?}"))?;
  let response: Response = response_value
    .dyn_into()
    .map_err(|_| "fetch did not return a Response".to_string())?;
  let status = response.status();
  let body = JsFuture::from(response.text().map_err(|e| format!("{e:?}"))?)
    .await
    .map_err(|e| format!("{e:?}"))?;
  let text = body.as_string().ok_or("response body was not text")?;
  if (200..300).contains(&status) {
    Ok(text)
  } else {
    Err(format!("HTTP {status}: {text}"))
  }
}

#[cfg(not(target_arch = "wasm32"))]
async fn request_json(method: &str, url: &str, _body: Option<&str>) -> Result<String, String> {
  Err(format!("{method} {url} needs a browser target"))
}

// Browser-only; host builds get the stub above.

/// Run a future to completion on the browser's microtask queue.
///
/// Host builds never poll it, so `cargo test` stays dependency-free.
pub fn spawn(future: impl std::future::Future<Output = ()> + 'static) {
  imp::spawn(future)
}

#[cfg(target_arch = "wasm32")]
mod imp {
  pub(super) fn spawn(future: impl std::future::Future<Output = ()> + 'static) {
    wasm_bindgen_futures::spawn_local(future);
  }
}

#[cfg(not(target_arch = "wasm32"))]
mod imp {
  pub(super) fn spawn(_future: impl std::future::Future<Output = ()> + 'static) {}
}
