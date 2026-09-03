// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { blogStore, } from "../alpine/blog";
import { log, } from "../alpine/logger";

const blogLog = log.child({ module: "blog-page", },);

document.addEventListener("htmx:load", () => {
  blogLog.info("Blog page loaded",);
},);

export function initBlogPage() {
  blogLog.info("initBlogPage",);
  void blogStore.loadPosts();
}
