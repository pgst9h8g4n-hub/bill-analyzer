import { N as ensure_array_like, Q as attr_class, O as attr_style, P as stringify } from "../../../chunks/index.js";
import { L as Layout } from "../../../chunks/Layout.js";
import { e as escape_html, l as attr } from "../../../chunks/attributes.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { userId = "" } = $$props;
    let platformHint = "";
    const fileTypes = {
      alipay: { accept: ".csv", label: "支付宝交易明细 CSV", color: "#1677FF" },
      wechat: { accept: ".xlsx", label: "微信支付账单 Excel", color: "#07C160" },
      douyin: { accept: ".pdf", label: "抖音支付流水 PDF", color: "#FE2C55" }
    };
    Layout($$renderer2, {
      currentPage: "upload",
      userId,
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="page"><div class="page-header svelte-tziouu"><h2 class="svelte-tziouu">上传账单</h2> <p class="subtitle svelte-tziouu">从支付宝/微信/抖音导出账单文件上传</p></div> <div class="upload-area svelte-tziouu" role="button" tabindex="0">`);
        {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="drop-zone svelte-tziouu"><div class="drop-icon svelte-tziouu">📁</div> <p class="svelte-tziouu">拖拽文件到此处，或点击下方选择</p> <p class="hint svelte-tziouu">支持 CSV / XLSX / PDF 格式</p></div>`);
        }
        $$renderer3.push(`<!--]--> `);
        {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> <label for="file-upload" class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">选择文件</label> <input type="file" id="file-upload" accept=".csv,.xlsx,.pdf" class="file-input svelte-tziouu"/></div> <div class="platform-selector svelte-tziouu"><label class="svelte-tziouu">平台类型</label> <div class="platform-options svelte-tziouu"><!--[-->`);
        const each_array = ensure_array_like(Object.entries(fileTypes));
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let [key, info] = each_array[$$index];
          $$renderer3.push(`<button${attr_class(`platform-option ${platformHint === key ? "active" : ""}`, "svelte-tziouu")}${attr_style(`--accent: ${stringify(info.color)}`)}><span class="platform-dot svelte-tziouu"></span> ${escape_html(info.label)}</button>`);
        }
        $$renderer3.push(`<!--]--></div></div> <button class="upload-btn svelte-tziouu"${attr("disabled", true, true)}>${escape_html("开始解析")}</button> `);
        {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        {
          $$renderer3.push("<!--[-1-->");
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
