// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

{
  const saved = localStorage.getItem("locale",) || "en";
  document.documentElement.lang = saved;
  document.documentElement.dir = saved === "ar" ? "rtl" : "ltr";
  globalThis.currentLocale = saved;
}
