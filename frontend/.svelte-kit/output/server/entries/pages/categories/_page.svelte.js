import { l as attr, e as escape_html } from "../../../chunks/attributes.js";
import { L as Layout } from "../../../chunks/Layout.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { userId = "" } = $$props;
    let newName = "";
    let newKeywords = "";
    let newColor = "#6366f1";
    Layout($$renderer2, {
      currentPage: "categories",
      userId,
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="page"><div class="page-header svelte-13grsjl"><h2 class="svelte-13grsjl">分类管理</h2> <p class="subtitle svelte-13grsjl">自定义消费分类，用于自动分类匹配</p></div> `);
        {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <div class="card create-form svelte-13grsjl"><h3 class="form-title svelte-13grsjl">➕ 新建分类</h3> <div class="form-row svelte-13grsjl"><input type="text" placeholder="分类名称"${attr("value", newName)} maxlength="20" class="form-input svelte-13grsjl"/> <input type="text" placeholder="关键词（逗号分隔）"${attr("value", newKeywords)} class="form-input svelte-13grsjl"/> <input type="color"${attr("value", newColor)} class="color-picker svelte-13grsjl" title="分类颜色"/> <button class="btn-create svelte-13grsjl"${attr("disabled", !newName.trim(), true)}>${escape_html("创建")}</button></div></div> `);
        {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="empty-state svelte-13grsjl">加载中...</div>`);
        }
        $$renderer3.push(`<!--]--></div>`);
      },
      $$slots: { default: true }
    });
  });
}
export {
  _page as default
};
