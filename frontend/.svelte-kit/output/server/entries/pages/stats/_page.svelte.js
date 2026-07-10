import "clsx";
import { L as Layout } from "../../../chunks/Layout.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { userId = "" } = $$props;
    Layout($$renderer2, {
      currentPage: "stats",
      userId,
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="page"><div class="page-header svelte-16pwk6k"><h2 class="svelte-16pwk6k">统计报表</h2> <p class="subtitle svelte-16pwk6k">多维度消费数据分析</p></div> `);
        {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="empty-state svelte-16pwk6k">加载中...</div>`);
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
