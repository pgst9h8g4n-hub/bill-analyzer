import { N as ensure_array_like, O as attr_style, P as stringify } from "../../../chunks/index.js";
import { L as Layout } from "../../../chunks/Layout.js";
import { e as escape_html, l as attr } from "../../../chunks/attributes.js";
const API_BASE = "http://localhost:8000/api/v1";
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (options.headers) {
    if (typeof options.headers === "object" && !Array.isArray(options.headers)) {
      for (const [k, v] of Object.entries(options.headers)) {
        if (v !== void 0) headers[k] = v;
      }
    }
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }
  return response.json();
}
async function getRecords(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== void 0 && v !== "") qs.set(k, String(v));
  }
  return apiFetch(`/records/?${qs.toString()}`);
}
function formatAmount(amount) {
  return `¥${amount.toFixed(2)}`;
}
function formatShortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function getPlatformLabel(p) {
  return { alipay: "支付宝", wechat: "微信", douyin: "抖音" }[p] || p;
}
function getPlatformColor(p) {
  return { alipay: "#1677FF", wechat: "#07C160", douyin: "#FE2C55" }[p] || "#6366f1";
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { userId = "" } = $$props;
    let records = [];
    let total = 0;
    let totalPages = 1;
    let page = 1;
    const pageSize = 30;
    let loading = true;
    let error = "";
    let filterPlatform = "";
    let filterStartDate = "";
    let filterEndDate = "";
    async function loadRecords() {
      loading = true;
      try {
        const params = { user_id: userId, page, page_size: pageSize };
        if (filterPlatform) ;
        if (filterStartDate) ;
        if (filterEndDate) ;
        const result = await getRecords(params);
        records = result.data;
        total = result.total;
        totalPages = result.total_pages;
      } catch (e) {
        error = e.message;
      } finally {
        loading = false;
      }
    }
    Layout($$renderer2, {
      currentPage: "records",
      userId,
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="page svelte-192mfm1"><div class="page-header svelte-192mfm1"><h2 class="svelte-192mfm1">账单记录</h2> <p class="subtitle svelte-192mfm1">共 ${escape_html(total)} 笔交易</p></div> <div class="filters svelte-192mfm1">`);
        $$renderer3.select(
          { value: filterPlatform, onchange: loadRecords, class: "" },
          ($$renderer4) => {
            $$renderer4.option({ value: "" }, ($$renderer5) => {
              $$renderer5.push(`全部平台`);
            });
            $$renderer4.option({ value: "alipay" }, ($$renderer5) => {
              $$renderer5.push(`支付宝`);
            });
            $$renderer4.option({ value: "wechat" }, ($$renderer5) => {
              $$renderer5.push(`微信`);
            });
            $$renderer4.option({ value: "douyin" }, ($$renderer5) => {
              $$renderer5.push(`抖音`);
            });
          },
          "svelte-192mfm1"
        );
        $$renderer3.push(` <input type="date"${attr("value", filterStartDate)} class="svelte-192mfm1"/> <input type="date"${attr("value", filterEndDate)} class="svelte-192mfm1"/> <button class="reset-btn svelte-192mfm1">重置</button></div> `);
        if (loading) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="empty-state svelte-192mfm1">加载中...</div>`);
        } else if (error) {
          $$renderer3.push("<!--[1-->");
          $$renderer3.push(`<div class="error-box svelte-192mfm1">${escape_html(error)}</div>`);
        } else if (records.length === 0) {
          $$renderer3.push("<!--[2-->");
          $$renderer3.push(`<div class="empty-state svelte-192mfm1"><div class="empty-icon svelte-192mfm1">📭</div> <p class="svelte-192mfm1">暂无账单记录</p> <small class="svelte-192mfm1">上传账单文件开始记录消费</small></div>`);
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<div class="record-list svelte-192mfm1"><!--[-->`);
          const each_array = ensure_array_like(records);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let record = each_array[$$index];
            $$renderer3.push(`<div class="record-card svelte-192mfm1"><div class="record-platform svelte-192mfm1"${attr_style(`border-left-color: ${stringify(getPlatformColor(record.platform))}`)}><span class="platform-tag svelte-192mfm1">${escape_html(getPlatformLabel(record.platform))}</span></div> <div class="record-body svelte-192mfm1"><div class="record-top svelte-192mfm1"><span class="record-merchant svelte-192mfm1">${escape_html(record.original_merchant)}</span> <span class="record-amount svelte-192mfm1">-${escape_html(formatAmount(record.amount))}</span></div> <div class="record-meta svelte-192mfm1"><span class="record-time">${escape_html(formatShortDate(record.trans_time))}</span> `);
            if (record.category_name) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<span class="record-cat svelte-192mfm1">${escape_html(record.category_name)}</span>`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> `);
            if (record.classification_method === "manual") {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<span class="manual-badge svelte-192mfm1">手动</span>`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--></div></div></div>`);
          }
          $$renderer3.push(`<!--]--></div> <div class="pagination svelte-192mfm1"><button${attr("disabled", page <= 1, true)} class="svelte-192mfm1">上一页</button> <span class="svelte-192mfm1">第 ${escape_html(page)} / ${escape_html(totalPages)} 页</span> <button${attr("disabled", page >= totalPages, true)} class="svelte-192mfm1">下一页</button></div>`);
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
