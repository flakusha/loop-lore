{
  const saved = localStorage.getItem("locale",) || "en";
  document.documentElement.lang = saved;
  document.documentElement.dir = saved === "ar" ? "rtl" : "ltr";
  globalThis.currentLocale = saved;
}
