import "clsx";
import { L as Layout } from "../../chunks/Layout.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { userId = "", userName = "" } = $$props;
    Layout($$renderer2, {
      currentPage: "dashboard",
      // 初始加载
      userName,
      userId,
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="dashboard svelte-1uha8ag"><div class="page-header svelte-1uha8ag"><h2 class="svelte-1uha8ag">总览仪表盘</h2> <p class="subtitle svelte-1uha8ag">消费账单一览</p></div> `);
        {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="loading svelte-1uha8ag">加载中...</div>`);
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
