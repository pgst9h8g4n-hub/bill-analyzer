import { Q as attr_class, N as ensure_array_like, V as slot } from "./index.js";
import { e as escape_html, l as attr } from "./attributes.js";
function Layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { currentPage = "", userName = "", userId = "" } = $$props;
    let mobileMenuOpen = false;
    const navItems = [
      { id: "dashboard", label: "📊 总览", page: "/" },
      { id: "records", label: "📋 账单", page: "/records" },
      { id: "upload", label: "📤 上传", page: "/upload" },
      { id: "categories", label: "🏷️ 分类", page: "/categories" },
      { id: "stats", label: "📈 统计", page: "/stats" }
    ];
    $$renderer2.push(`<header class="mobile-header svelte-qgpshq"><button class="menu-btn svelte-qgpshq">☰</button> <span class="logo svelte-qgpshq">💰 账单助手</span> `);
    if (userName) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="user-badge svelte-qgpshq">${escape_html(userName)}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></header> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <aside${attr_class("sidebar svelte-qgpshq", void 0, { "collapsed": false, "mobile-open": mobileMenuOpen })}><div class="sidebar-header svelte-qgpshq"><button class="toggle-btn svelte-qgpshq">◀</button> <span class="logo svelte-qgpshq">💰 账单助手</span></div> <nav class="nav-menu svelte-qgpshq"><!--[-->`);
    const each_array = ensure_array_like(navItems);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let item = each_array[$$index];
      $$renderer2.push(`<a${attr_class(`nav-item ${item.id === currentPage ? "active" : ""}`, "svelte-qgpshq")}${attr("href", item.page)}><span class="nav-icon svelte-qgpshq">${escape_html(item.label.split(" ")[0])}</span> <span class="nav-label svelte-qgpshq">${escape_html(item.label.split(" ").slice(1).join(" "))}</span></a>`);
    }
    $$renderer2.push(`<!--]--></nav> `);
    if (userId) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="sidebar-footer svelte-qgpshq"><div class="user-info svelte-qgpshq"><div class="avatar svelte-qgpshq">${escape_html(userName.charAt(0).toUpperCase())}</div> <span class="username svelte-qgpshq">${escape_html(userName)}</span></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></aside> <main${attr_class("main-content svelte-qgpshq", void 0, { "mobile-main": mobileMenuOpen })}><!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]--></main>`);
  });
}
export {
  Layout as L
};
